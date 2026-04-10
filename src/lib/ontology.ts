import { BASE_FIELDS, BASE_HEADERS, ELEMENT_TYPES, iriPrefixes, w3cIRI } from "@/lib/constants";
import type {
  GridColumnDef,
  GridEditContext,
  GridRow,
  GridSelectionPatch,
  OntologySettings,
  PredicateColumnMeta,
  PredicateValueMode,
  TableMergeResult,
} from "@/types";

let nextRowId = 1;

export function getCurrentDateParts() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0"),
    day: String(now.getDate()).padStart(2, "0"),
  };
}

export function toCamelCase(str: string) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase());
}

export function toPascalCase(str: string) {
  return toCamelCase(str).replace(/^./, (chr) => chr.toUpperCase());
}

export function toSnakeCase(str: string) {
  return String(str || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function fromLabelWithCase(label: string, caseStyle: OntologySettings["readableCase"]) {
  if (caseStyle === "camelCase") return toCamelCase(label);
  if (caseStyle === "snake_case") return toSnakeCase(label);
  return toPascalCase(label);
}

export function parseFileExtension(filename: string | null | undefined) {
  if (typeof filename !== "string") return "";
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

export function detectFormatByExtension(extension: string | null | undefined) {
  if (typeof extension !== "string") return "unsupported";
  if (["csv", "tsv", "xls", "xlsx"].includes(extension)) return "spreadsheet";
  if (["ttl", "rdf", "jsonld", "nt", "trig"].includes(extension)) return "ontology";
  return "unsupported";
}

export function getBaseAndDelimiter(settings: Partial<OntologySettings>) {
  const base = String(settings.base || "http://example.org").replace(/[\/#]+$/g, "");
  const delimiter = settings.delimiter === "#" ? "#" : "/";
  return { base, delimiter };
}

export function zeroPad(n: number, width: number) {
  const text = String(Math.max(0, Math.trunc(n)));
  return text.length >= width ? text : "0".repeat(width - text.length) + text;
}

export function generateOntologySettings(
  base = "http://example.org",
  label = "Example Ontology",
  creator = "Barry Guarino",
  description = "An example ontology",
  delimiter: "/" | "#" = "/",
  iriMode: "opaque" | "readable" = "opaque",
  opaqueLeading = "ont",
  opaqueDigits = 6,
  opaqueStart = 1,
  readableCase: OntologySettings["readableCase"] = "PascalCase"
): OntologySettings {
  const { year, month, day } = getCurrentDateParts();
  const normalizedLabel = toPascalCase(label);

  return {
    iri: `${base}${delimiter}${normalizedLabel}`,
    [w3cIRI.OWL_VERSION_IRI]: `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`,
    [w3cIRI.OWL_VERSION_INFO]: `${year}-${month}-${day}`,
    [w3cIRI.RDFS_LABEL]: label,
    [w3cIRI.DCTERMS_CREATOR]: creator,
    [w3cIRI.DCTERMS_DESCRIPTION]: description,
    base,
    delimiter,
    iriMode,
    opaqueLeading,
    opaqueDigits,
    opaqueStart,
    readableCase,
    predicateValueModes: {},
    owlImportsLocal: {},
  };
}

export function getIsAPredicate(elementType: string) {
  switch (elementType) {
    case "Class":
      return w3cIRI.RDFS_SUBCLASS;
    case "ObjectProperty":
    case "DatatypeProperty":
    case "AnnotationProperty":
      return w3cIRI.RDFS_SUBPROP;
    case "NamedIndividual":
      return w3cIRI.RDF_TYPE;
    default:
      return null;
  }
}

export function iriToCurie(iri: string) {
  for (const [prefix, base] of Object.entries(iriPrefixes)) {
    if (iri.startsWith(base)) {
      return `${prefix}:${iri.slice(base.length)}`;
    }
  }
  return null;
}

export function curieToIri(value: string | null | undefined) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (!text.includes(":")) return null;
  const [prefix, local] = text.split(":");
  const base = iriPrefixes[prefix];
  return base ? `${base}${local}` : null;
}

export function displayLabelAndCurie(record: { label?: string; curie?: string | null; iri: string }) {
  return `${record.label || record.curie || record.iri} — ${record.curie || record.iri}`;
}

export function resolveDisplayValue(value: string) {
  return value;
}

export function resolveToIri(
  value: string | null | undefined,
  lookup?: {
    byCurie?: Map<string, { iri: string }>;
  }
) {
  if (!value) return null;
  const raw = String(value).trim();
  const maybeCode = raw.includes("—") ? raw.split("—").pop()?.trim() || raw : raw;
  if (/^https?:\/\/\S+$/i.test(maybeCode) || /^urn:[^:\s]+:.+/i.test(maybeCode)) return maybeCode;
  if (/^<[^>\s]+>$/.test(maybeCode)) return maybeCode.slice(1, -1);
  const curie = curieToIri(maybeCode);
  if (curie) return curie;
  return lookup?.byCurie?.get(maybeCode)?.iri || null;
}

export function defaultModeForPredicate(iri: string): PredicateValueMode {
  if (/#.+Property$/.test(iri) || /sameAs$/i.test(iri)) return "iri";
  return "literal";
}

export function predicateFieldFromIri(iri: string, index: number) {
  let hash = 0;
  for (let i = 0; i < iri.length; i += 1) {
    hash = (hash * 33 + iri.charCodeAt(i)) >>> 0;
  }
  return `predicate_${hash.toString(36)}_${index}`;
}

export function buildPredicateMeta(
  customPredicates: string[],
  predicateValueModes: Record<string, PredicateValueMode> = {}
): PredicateColumnMeta[] {
  return customPredicates.map((predicateIri, index) => ({
    predicateIri,
    field: predicateFieldFromIri(predicateIri, index),
    title: iriToCurie(predicateIri) || predicateIri,
    mode: predicateValueModes[predicateIri] || defaultModeForPredicate(predicateIri),
  }));
}

export function createBlankRow(predicateMeta: PredicateColumnMeta[]): GridRow {
  const row: GridRow = {
    __rowId: `row_${nextRowId++}`,
    iri: "",
    label: "",
    elementType: "",
    definition: "",
    isA: "",
    isCuratedInOntology: "",
  };

  predicateMeta.forEach((meta) => {
    row[meta.field] = "";
  });

  return row;
}

export function rowObjectFromArray(row: string[], predicateMeta: PredicateColumnMeta[]): GridRow {
  const next = createBlankRow(predicateMeta);
  BASE_FIELDS.forEach((field, index) => {
    next[field] = row[index] ?? "";
  });
  predicateMeta.forEach((meta, index) => {
    next[meta.field] = row[BASE_FIELDS.length + index] ?? "";
  });
  return next;
}

export function rowArrayFromObject(row: GridRow, predicateMeta: PredicateColumnMeta[]) {
  const values = BASE_FIELDS.map((field) => String(row[field] ?? ""));
  predicateMeta.forEach((meta) => values.push(String(row[meta.field] ?? "")));
  return values;
}

export function rowsToObjects(rows: string[][], predicateMeta: PredicateColumnMeta[]) {
  return rows.map((row) => rowObjectFromArray(row, predicateMeta));
}

export function rowsToArrays(rows: GridRow[], predicateMeta: PredicateColumnMeta[]) {
  return rows.map((row) => rowArrayFromObject(row, predicateMeta));
}

export function mergeTableData(currentRows: GridRow[], newRows: GridRow[], mode: "append" | "replace"): TableMergeResult {
  const mergedRows = mode === "replace" ? [...newRows] : [...currentRows, ...newRows];
  return {
    mergedRows,
    stats: {
      original: currentRows.length,
      appended: newRows.length,
      total: mergedRows.length,
    },
  };
}

export function isLikelyOntology(content: string) {
  return typeof content === "string" && content.length > 0 && /rdf:RDF|@prefix|owl:Ontology/.test(content);
}

export function buildOpaqueIri(nextNum: number, settings: OntologySettings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const lead = settings.opaqueLeading || "ont";
  const digits = Math.max(1, settings.opaqueDigits || 6);
  return `${base}${delimiter}${lead}${zeroPad(nextNum, digits)}`;
}

export function buildReadableIri(label: string, settings: OntologySettings, existingIris = new Set<string>()) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const local = fromLabelWithCase(label, settings.readableCase || "PascalCase") || "Unnamed";
  let candidate = `${base}${delimiter}${local}`;
  let suffix = 2;
  while (existingIris.has(candidate)) {
    candidate = `${base}${delimiter}${local}_${suffix++}`;
  }
  return candidate;
}

export function findMaxOpaqueNumber(rows: GridRow[], settings: OntologySettings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const iriPrefix = `${base}${delimiter}${settings.opaqueLeading || "ont"}`;
  const digits = Math.max(1, settings.opaqueDigits || 6);
  const re = new RegExp(`^${iriPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{${digits}})$`);
  let max = Math.max(0, (settings.opaqueStart || 1) - 1);
  rows.forEach((row) => {
    const match = re.exec(String(row.iri || ""));
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  });
  return max;
}

export function buildGridColumns(predicateMeta: PredicateColumnMeta[]): GridColumnDef[] {
  const baseColumns: GridColumnDef[] = [
    { field: "iri", title: "iri", width: 220, editor: "textarea", wrap: true },
    { field: "label", title: "label", width: 180, editor: "textarea", wrap: true },
    { field: "elementType", title: "element type", width: 160, editor: "select", choices: [...ELEMENT_TYPES] },
    { field: "definition", title: "definition", width: 240, editor: "textarea", wrap: true },
    { field: "isA", title: "is a", width: 220, editor: "autocomplete", wrap: true },
    { field: "isCuratedInOntology", title: "is curated in ontology", width: 220, editor: "textarea", wrap: true },
  ];

  return baseColumns.concat(
    predicateMeta.map((meta) => ({
      field: meta.field,
      title: meta.title,
      width: 180,
      editor: meta.mode === "iri" ? "autocomplete" : "textarea",
      wrap: true,
      predicateIri: meta.predicateIri,
    }))
  );
}

function normalizeEditedValue(
  row: GridRow,
  field: string,
  value: string,
  context: GridEditContext
) {
  if (field === "elementType") {
    return ELEMENT_TYPES.includes(value as (typeof ELEMENT_TYPES)[number]) ? value : row.elementType;
  }

  if (field === "isA") {
    return context.resolveToIri(value) || value;
  }

  const predicate = context.predicateMeta.find((meta) => meta.field === field);
  if (predicate?.mode === "iri") {
    return context.resolveToIri(value) || value;
  }

  return value;
}

function syncManagedIri(rows: GridRow[], row: GridRow, previousIri: string, settings: OntologySettings) {
  if ((settings.iriMode || "opaque") !== "readable") return;
  const label = String(row.label || "").trim();
  if (!label) return;
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const looksAuto = previousIri ? previousIri.startsWith(`${base}${delimiter}`) : true;
  if (!previousIri || looksAuto) {
    const allIris = new Set(rows.map((entry) => String(entry.iri || "")));
    if (previousIri) allIris.delete(previousIri);
    row.iri = buildReadableIri(label, settings, allIris);
  }
}

export function applyCellEdit(
  rows: GridRow[],
  rowIndex: number,
  field: string,
  value: string,
  context: GridEditContext
) {
  const nextRows = rows.map((row) => ({ ...row }));
  const row = nextRows[rowIndex];
  if (!row) return rows;

  const previousIri = String(row.iri || "");
  const normalized = normalizeEditedValue(row, field, value, context);
  row[field] = normalized;

  if (field === "label") {
    syncManagedIri(nextRows, row, previousIri, context.settings);
  }

  return nextRows;
}

export function applyPastePatch(rows: GridRow[], patch: GridSelectionPatch, context: GridEditContext) {
  let nextRows = [...rows];
  for (let rowOffset = 0; rowOffset < patch.values.length; rowOffset += 1) {
    const targetRowIndex = patch.startRow + rowOffset;
    while (targetRowIndex >= nextRows.length) {
      nextRows = insertBlankRows(nextRows, nextRows.length, 1, context.settings, context.predicateMeta);
    }

    for (let colOffset = 0; colOffset < patch.values[rowOffset].length; colOffset += 1) {
      const targetCol = patch.startCol + colOffset;
      const column = context.columns[targetCol];
      if (!column) continue;
      nextRows = applyCellEdit(nextRows, targetRowIndex, column.field, patch.values[rowOffset][colOffset] || "", context);
    }
  }
  return nextRows;
}

export function insertBlankRows(
  rows: GridRow[],
  index: number,
  count: number,
  settings: OntologySettings,
  predicateMeta: PredicateColumnMeta[]
) {
  const nextRows = rows.map((row) => ({ ...row }));
  let nextOpaque = findMaxOpaqueNumber(nextRows, settings);
  const blanks = Array.from({ length: count }, () => {
    const blank = createBlankRow(predicateMeta);
    if (settings.iri) {
      blank.isCuratedInOntology = settings.iri;
    }
    if ((settings.iriMode || "opaque") === "opaque") {
      nextOpaque += 1;
      blank.iri = buildOpaqueIri(nextOpaque, settings);
    }
    return blank;
  });

  nextRows.splice(index, 0, ...blanks);
  return nextRows;
}

export function rebuildColumnSchema(
  customPredicates: string[],
  settings: OntologySettings
) {
  const predicateMeta = buildPredicateMeta(customPredicates, settings.predicateValueModes);
  return {
    predicateMeta,
    columns: buildGridColumns(predicateMeta),
    headers: [...BASE_HEADERS, ...customPredicates],
  };
}

