export type PredicateValueMode = "iri" | "literal";

export type BaseField =
  | "iri"
  | "label"
  | "elementType"
  | "definition"
  | "isA"
  | "isCuratedInOntology";

export interface GridRow {
  __rowId: string;
  iri: string;
  label: string;
  elementType: string;
  definition: string;
  isA: string;
  isCuratedInOntology: string;
  [key: string]: string | number | boolean | undefined;
}

export interface PredicateColumnMeta {
  predicateIri: string;
  field: string;
  title: string;
  mode: PredicateValueMode;
}

export interface GridColumnDef {
  field: string;
  title: string;
  width: number;
  editor: "text" | "textarea" | "select" | "autocomplete";
  predicateIri?: string;
  choices?: string[];
  wrap?: boolean;
  readonly?: boolean;
}

export interface GridSelectionPatch {
  startRow: number;
  startCol: number;
  values: string[][];
}

export interface GridEditContext {
  rows: GridRow[];
  columns: GridColumnDef[];
  settings: OntologySettings;
  predicateMeta: PredicateColumnMeta[];
  resolveToIri: (value: string) => string | null;
}

export interface OntologySettings {
  iri: string;
  base: string;
  delimiter: "/" | "#";
  iriMode: "opaque" | "readable";
  opaqueLeading: string;
  opaqueDigits: number;
  opaqueStart: number;
  readableCase: "PascalCase" | "camelCase" | "snake_case";
  predicateValueModes?: Record<string, PredicateValueMode>;
  owlImportsLocal?: Record<string, { content: string; mediaType?: string; updatedAt?: string }>;
  [key: string]: unknown;
}

export interface VocabRecord {
  iri: string;
  curie: string | null;
  label: string;
  type: string;
  altLabels: string[];
  source: string;
  deprecated: boolean;
}

export interface TableMergeResult {
  mergedRows: GridRow[];
  stats: {
    original: number;
    appended: number;
    total: number;
  };
}

