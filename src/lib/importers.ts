import { BASE_HEADERS, ELEMENT_TYPES, w3cIRI } from "@/lib/constants";
import { curieToIri, detectFormatByExtension, parseFileExtension, rowObjectFromArray, rowsToObjects } from "@/lib/ontology";
import type { GridRow, PredicateColumnMeta } from "@/types";

export async function parseSpreadsheetData(file: File, extension: string, hasHeaderRow: boolean) {
  return await new Promise<{ rows: string[][]; header: string[] | null }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = window.XLSX.read(event.target?.result, {
          type: extension === "xls" || extension === "xlsx" ? "binary" : "string",
          raw: false,
        });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const allRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as string[][];
        resolve({
          header: hasHeaderRow ? allRows[0] || null : null,
          rows: hasHeaderRow ? allRows.slice(1) : allRows,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;

    if (extension === "xls" || extension === "xlsx") reader.readAsBinaryString(file);
    else reader.readAsText(file);
  });
}

export function validateTableData(
  rows: string[][],
  header: string[] | null,
  knownHeaders: string[],
  hasHeaderRow: boolean
) {
  const errors: string[] = [];
  const ignoredColumns: string[] = [];
  const normalizedKnown = knownHeaders.map((item) => item.toLowerCase().trim());
  let columnMap: number[] | null = null;

  if (hasHeaderRow && header) {
    columnMap = header.map((label) => {
      const normalized = String(label || "").toLowerCase().trim();
      const index = normalizedKnown.indexOf(normalized);
      if (index === -1) {
        ignoredColumns.push(label);
      }
      return index;
    });
  }

  const cleanedRows = rows.reduce<string[][]>((acc, row, rowIndex) => {
    const cleaned = Array.from({ length: knownHeaders.length }, () => "");
    if (columnMap) {
      row.forEach((value, index) => {
        const target = columnMap?.[index] ?? -1;
        if (target >= 0) cleaned[target] = String(value ?? "");
      });
    } else {
      for (let i = 0; i < Math.min(row.length, cleaned.length); i += 1) {
        cleaned[i] = String(row[i] ?? "");
      }
    }

    const typeValue = cleaned[2];
    if (typeValue && !ELEMENT_TYPES.includes(typeValue as (typeof ELEMENT_TYPES)[number])) {
      errors.push(`Row ${rowIndex + 1} has invalid Element Type: "${typeValue}"`);
    }

    if (cleaned.some((value) => String(value || "").trim() !== "")) {
      acc.push(cleaned);
    }
    return acc;
  }, []);

  return {
    valid: errors.length === 0,
    cleanedRows,
    ignoredColumns,
    unmatchedHeaders: ignoredColumns,
    errors,
  };
}

export async function parseOntologyData(file: File) {
  const text = await file.text();
  const extension = parseFileExtension(file.name);
  const format = detectFormatByExtension(extension) === "ontology" ? extension : "ttl";
  const parser = new window.N3.Parser({ format });
  return parser.parse(text);
}

export function validateAndPivotOntologyData(quads: any[], predicateMeta: PredicateColumnMeta[]) {
  const subjectData = new Map<string, Map<string, any[]>>();
  const errors: string[] = [];

  for (const quad of quads) {
    const subject = quad.subject.value;
    const predicate = quad.predicate.value;
    if (!subjectData.has(subject)) subjectData.set(subject, new Map());
    const map = subjectData.get(subject)!;
    if (!map.has(predicate)) map.set(predicate, []);
    map.get(predicate)!.push(quad.object);
  }

  const rows: string[][] = [];
  for (const [subject, predicates] of subjectData.entries()) {
    const rdfTypes = (predicates.get(w3cIRI.RDF_TYPE) || []).map((obj) => obj.value);
    if (rdfTypes.includes(w3cIRI.OWL_ONTOLOGY)) continue;

    let elementType = "";
    if (rdfTypes.includes(w3cIRI.OWL_CLASS)) elementType = "Class";
    else if (rdfTypes.includes(w3cIRI.OWL_OBJPROP)) elementType = "ObjectProperty";
    else if (rdfTypes.includes(w3cIRI.OWL_DATATYPE)) elementType = "DatatypeProperty";
    else if (rdfTypes.includes(w3cIRI.OWL_ANNOPROP)) elementType = "AnnotationProperty";
    else if (rdfTypes.includes(w3cIRI.OWL_NAMEDIND)) elementType = "NamedIndividual";
    else if (rdfTypes.length > 0) elementType = "NamedIndividual";

    const row = Array.from({ length: BASE_HEADERS.length + predicateMeta.length }, () => "");
    row[0] = subject;
    row[1] = predicates.get(w3cIRI.RDFS_LABEL)?.[0]?.value || "";
    row[2] = elementType;
    row[3] = predicates.get(w3cIRI.SKOS_DEFINITION)?.[0]?.value || "";
    row[4] =
      predicates.get(w3cIRI.RDFS_SUBCLASS)?.[0]?.value ||
      predicates.get(w3cIRI.RDFS_SUBPROP)?.[0]?.value ||
      "";
    row[5] = predicates.get(w3cIRI.CCO_CURATEDIN)?.[0]?.value || "";

    predicateMeta.forEach((meta, index) => {
      const values = predicates.get(meta.predicateIri) || [];
      row[BASE_HEADERS.length + index] = values.map((value) => value.value).join(" ; ");
    });

    rows.push(row);
  }

  if (rows.length === 0 && quads.length > 0) {
    errors.push("Data was parsed, but no rows matched the current table schema.");
  }

  return { valid: errors.length === 0, cleanedRows: rows, errors };
}

export function toGridRows(rows: string[][], predicateMeta: PredicateColumnMeta[]): GridRow[] {
  return rowsToObjects(rows, predicateMeta);
}
