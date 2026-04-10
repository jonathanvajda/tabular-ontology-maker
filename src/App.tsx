import { CompactSelection, type GridSelection } from "@glideapps/glide-data-grid";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { GlideOntologyGrid } from "@/components/GlideOntologyGrid";
import { parseOntologyData, parseSpreadsheetData, toGridRows, validateAndPivotOntologyData, validateTableData } from "@/lib/importers";
import { BASE_HEADERS, iriPrefixes, w3cIRI } from "@/lib/constants";
import { generateOntologySettings, getCurrentDateParts, insertBlankRows, mergeTableData, rebuildColumnSchema } from "@/lib/ontology";
import { generateRdfString, mimeTypes } from "@/lib/rdf";
import { hasPriorSession, loadOntologySettings, saveOntologySettings, saveRdfSession } from "@/lib/storage";
import { VocabularyIndex } from "@/lib/vocab";
import type { GridColumnDef, GridRow, OntologySettings, PredicateColumnMeta } from "@/types";
import "./styles.css";

const initialRows: string[][] = [
  ["http://example.org/ont000001", "Doctor", "Class", "A human person who has earned a doctorate.", "cco2:ont00001017", "http://example.org/ExampleOntology"],
  ["http://example.org/ont000002", "Bob", "NamedIndividual", "An instance of a Person.", "cco2:ont00001262", "http://example.org/ExampleOntology"],
  ["http://example.org/ont000003", "has vehicle", "ObjectProperty", "x hasVehicle y iff x possesses y and y is a Vehicle.", "ex:Owns", "http://example.org/ExampleOntology"],
  ["http://example.org/ont000004", "Automobile", "Class", "A ground vehicle that is designed to transport passengers.", "cco2:ont00000618", "http://example.org/ExampleOntology"],
  ["", "", "", "", "", ""],
];

type ModalState = "none" | "settings" | "prefixes" | "imports" | "predicates" | "insert";

export default function App() {
  const [settings, setSettings] = useState<OntologySettings>(generateOntologySettings());
  const [customPredicates, setCustomPredicates] = useState<string[]>([]);
  const [predicateMeta, setPredicateMeta] = useState<PredicateColumnMeta[]>([]);
  const [columns, setColumns] = useState<GridColumnDef[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [rdfOutput, setRdfOutput] = useState("");
  const [selection, setSelection] = useState<GridSelection>({
    current: undefined,
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const [activeModal, setActiveModal] = useState<ModalState>("none");
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [insertMode, setInsertMode] = useState<"append" | "replace">("append");
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [fileType, setFileType] = useState<"spreadsheet" | "ontology">("spreadsheet");
  const [predicateInput, setPredicateInput] = useState("");
  const vocabIndex = useMemo(() => new VocabularyIndex(), []);

  useEffect(() => {
    void (async () => {
      const loaded = await loadOntologySettings();
      setSettings(loaded);
      const schema = rebuildColumnSchema(customPredicates, loaded);
      setPredicateMeta(schema.predicateMeta);
      setColumns(schema.columns);
      setRows(toGridRows(initialRows, schema.predicateMeta).map((row) => ({
        ...row,
        isCuratedInOntology: row.isCuratedInOntology || loaded.iri,
      })));
      setReloadAvailable(await hasPriorSession());
      try {
        await vocabIndex.loadFrom("./json/bfo-cco-lookup.json", "BFO/CCO");
      } catch (error) {
        console.error("[vocab] Failed to load lookup index", error);
      }
    })();
  }, [vocabIndex]);

  useEffect(() => {
    const schema = rebuildColumnSchema(customPredicates, settings);
    setPredicateMeta(schema.predicateMeta);
    setColumns(schema.columns);
    setRows((currentRows) =>
      currentRows.map((row) => {
        const nextRow = { ...row };
        schema.predicateMeta.forEach((meta) => {
          if (typeof nextRow[meta.field] === "undefined") {
            nextRow[meta.field] = "";
          }
        });
        return nextRow;
      })
    );
  }, [customPredicates, settings]);

  useEffect(() => {
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        isCuratedInOntology: row.isCuratedInOntology || String(settings.iri || ""),
      }))
    );
  }, [settings.iri]);

  const modalFooter = (
    <div className="tom-modal-actions">
      <button type="button" onClick={() => setActiveModal("none")}>
        Close
      </button>
    </div>
  );

  const handlePreview = async () => {
    const rdf = await generateRdfString(rows, settings, predicateMeta, "ttl");
    setRdfOutput(rdf);
  };

  const handleDownload = async () => {
    const format = "ttl";
    const rdf = await generateRdfString(rows, settings, predicateMeta, format);
    setRdfOutput(rdf);
    const blob = new Blob([rdf], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ontology.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSession = async () => {
    const rdf = await generateRdfString(rows, settings, predicateMeta, "ttl");
    setRdfOutput(rdf);
    await saveRdfSession(rdf, "ttl");
    setReloadAvailable(true);
  };

  const handleAddRows = () => {
    setRows(insertBlankRows(rows, rows.length, 1, settings, predicateMeta));
  };

  const handleRemoveRows = () => {
    setRows((currentRows) => currentRows.slice(0, Math.max(0, currentRows.length - 1)));
  };

  const handleAddPredicate = () => {
    const finalIri = predicateInput.trim();
    if (!finalIri || customPredicates.includes(finalIri)) return;
    setCustomPredicates((current) => [...current, finalIri]);
    setPredicateInput("");
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    if (fileType === "spreadsheet") {
      const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "";
      const parsed = await parseSpreadsheetData(selectedFile, extension, hasHeaderRow);
      const result = validateTableData(parsed.rows, parsed.header, [...BASE_HEADERS, ...customPredicates], hasHeaderRow);
      if (!result.valid) {
        throw new Error(result.errors.join("\n"));
      }

      const incoming = toGridRows(result.cleanedRows, predicateMeta);
      const merged = mergeTableData(rows, incoming, insertMode);
      setRows(merged.mergedRows);
    } else {
      const quads = await parseOntologyData(selectedFile);
      const result = validateAndPivotOntologyData(quads, predicateMeta);
      if (!result.valid) throw new Error(result.errors.join("\n"));
      const incoming = toGridRows(result.cleanedRows, predicateMeta);
      const merged = mergeTableData(rows, incoming, insertMode);
      setRows(merged.mergedRows);
    }

    setSelectedFile(null);
    setActiveModal("none");
  };

  const versionPreview = useMemo(() => {
    const { year, month, day } = getCurrentDateParts();
    return {
      versionIri: `${settings.base}/${year}-${month}-${day}${settings.delimiter}${settings[w3cIRI.RDFS_LABEL as keyof OntologySettings] || "ExampleOntology"}`,
      versionInfo: `${year}-${month}-${day}`,
    };
  }, [settings]);

  return (
    <div className="tom-app">
      <header className="tom-header">
        <div className="tom-brand">
          <img src="./images/tom-black.svg" width={90} alt="TOM" />
          <h1>TOM — Tabular Ontology Maker</h1>
        </div>
      </header>

      <main className="tom-main">
        <div className="tom-toolbar">
          <button onClick={() => setActiveModal("settings")}>Ontology Settings</button>
          <button onClick={() => setActiveModal("prefixes")}>Manage Prefixes</button>
          <button onClick={() => setActiveModal("imports")}>Ontology Imports</button>
          <button onClick={() => setActiveModal("predicates")}>Manage Predicates</button>
          <button onClick={() => setActiveModal("insert")}>Insert Data from File</button>
          <button disabled={!reloadAvailable}>Reload Saved Session</button>
          <button onClick={handlePreview}>Preview RDF</button>
          <button onClick={handleSaveSession}>Save Session</button>
          <button onClick={handleDownload}>Download RDF</button>
        </div>

        <GlideOntologyGrid
          rows={rows}
          setRows={setRows}
          columns={columns}
          predicateMeta={predicateMeta}
          settings={settings}
          vocabIndex={vocabIndex}
          selection={selection}
          setSelection={setSelection}
        />

        <div className="tom-row-controls">
          <button onClick={handleAddRows}>Add Row</button>
          <button onClick={handleRemoveRows}>Remove Row</button>
        </div>

        <section className="tom-rdf-output">
          <h3>Generated RDF</h3>
          <textarea readOnly value={rdfOutput} onChange={() => undefined} />
        </section>
      </main>

      <Modal
        title="Ontology Settings"
        open={activeModal === "settings"}
        onClose={() => setActiveModal("none")}
        footer={
          <div className="tom-modal-actions">
            <button
              onClick={async () => {
                await saveOntologySettings(settings);
                setActiveModal("none");
              }}
            >
              Save & Close
            </button>
          </div>
        }
      >
        <label>
          Ontology Label
          <input
            value={String(settings[w3cIRI.RDFS_LABEL] || "")}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                [w3cIRI.RDFS_LABEL]: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Base IRI
          <input value={settings.base} onChange={(event) => setSettings((current) => ({ ...current, base: event.target.value }))} />
        </label>
        <label>
          IRI Mode
          <select
            value={settings.iriMode}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                iriMode: event.target.value as OntologySettings["iriMode"],
              }))
            }
          >
            <option value="opaque">Opaque</option>
            <option value="readable">Readable</option>
          </select>
        </label>
        <div className="tom-preview">
          <strong>Version IRI:</strong> <span>{versionPreview.versionIri}</span>
          <strong>Version Info:</strong> <span>{versionPreview.versionInfo}</span>
        </div>
      </Modal>

      <Modal title="Manage IRI Prefixes" open={activeModal === "prefixes"} onClose={() => setActiveModal("none")} footer={modalFooter}>
        <table className="tom-table">
          <thead>
            <tr>
              <th>Prefix</th>
              <th>IRI</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(iriPrefixes).map(([prefix, iri]) => (
              <tr key={prefix}>
                <td>{prefix}</td>
                <td>{iri}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <Modal title="Ontology Imports" open={activeModal === "imports"} onClose={() => setActiveModal("none")} footer={modalFooter}>
        <p>Ontology import management remains local-first and uses ontology settings storage.</p>
        <p>The React migration preserves this workflow, but the upload/reload flow still needs a live build pass to verify end to end.</p>
      </Modal>

      <Modal
        title="Manage Predicates"
        open={activeModal === "predicates"}
        onClose={() => setActiveModal("none")}
        footer={
          <div className="tom-modal-actions">
            <button onClick={handleAddPredicate}>Add Predicate</button>
            <button onClick={() => setActiveModal("none")}>Close</button>
          </div>
        }
      >
        <input
          placeholder="http://example.org/myPredicate"
          value={predicateInput}
          onChange={(event) => setPredicateInput(event.target.value)}
        />
        <ul className="tom-predicate-list">
          {predicateMeta.map((meta) => (
            <li key={meta.field}>
              <span>{meta.title}</span>
              <select
                value={meta.mode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    predicateValueModes: {
                      ...(current.predicateValueModes || {}),
                      [meta.predicateIri]: event.target.value as "iri" | "literal",
                    },
                  }))
                }
              >
                <option value="literal">Literal</option>
                <option value="iri">IRI</option>
              </select>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        title="Insert Data"
        open={activeModal === "insert"}
        onClose={() => setActiveModal("none")}
        footer={
          <div className="tom-modal-actions">
            <button onClick={() => void handleImport()}>Save</button>
            <button onClick={() => setActiveModal("none")}>Close</button>
          </div>
        }
      >
        <p>
          Download Starter Template: <a href="./template.csv">CSV</a> or <a href="./template.xlsx">XLSX</a>
        </p>
        <input
          type="file"
          accept=".csv,.tsv,.xls,.xlsx,.ttl,.rdf,.jsonld,.nt,.trig"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            setSelectedFile(file);
          }}
        />
        <label>
          <input checked={fileType === "spreadsheet"} onChange={() => setFileType("spreadsheet")} type="radio" />
          Spreadsheet
        </label>
        <label>
          <input checked={fileType === "ontology"} onChange={() => setFileType("ontology")} type="radio" />
          Ontology
        </label>
        {fileType === "spreadsheet" ? (
          <label>
            <input checked={hasHeaderRow} onChange={(event) => setHasHeaderRow(event.target.checked)} type="checkbox" />
            First row is header
          </label>
        ) : null}
        <label>
          <input checked={insertMode === "append"} onChange={() => setInsertMode("append")} type="radio" />
          Append Data
        </label>
        <label>
          <input checked={insertMode === "replace"} onChange={() => setInsertMode("replace")} type="radio" />
          Replace Data
        </label>
        {selectedFile ? <p>Selected: {selectedFile.name}</p> : null}
      </Modal>

      <footer className="tom-footer">
        <details>
          <summary>
            <strong>Important User Data Notice</strong>
          </summary>
          By design, any data that a user inputs stays local to the user's device. Ontology settings and data can be
          saved in the browser, but users are encouraged to export their work.
        </details>
      </footer>
    </div>
  );
}
