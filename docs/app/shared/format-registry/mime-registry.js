/**
 * @file Pure helpers for supported file extensions and MIME descriptors.
 *
 * This module is intentionally generic. It answers "what supported MIME does
 * this extension imply?" without knowing whether a caller is importing RDF,
 * parsing tabular data, exporting a report, or filtering a file picker.
 */

/**
 * @typedef {'rdf'|'query'|'tabular'|'document'|'text'|'data'|'visualization'|'archive'|'binary'} FormatCategory
 */

/**
 * @typedef {Readonly<{
 *   id: string,
 *   mimeType: string,
 *   label: string,
 *   category: FormatCategory,
 *   extensions: ReadonlyArray<string>,
 *   aliases: ReadonlyArray<string>
 * }>} MimeDescriptor
 */

/**
 * @typedef {Readonly<{ok: true, value: MimeDescriptor}>} MimeDescriptorOk
 */

/**
 * @typedef {Readonly<{
 *   ok: false,
 *   error: 'unknown filetype',
 *   input: string,
 *   extension?: string
 * }>} UnknownFiletypeResult
 */

/**
 * @typedef {MimeDescriptorOk | UnknownFiletypeResult} MimeDescriptorResult
 */

const defineDescriptor = (descriptor) => Object.freeze({
  ...descriptor,
  extensions: Object.freeze(descriptor.extensions.map(normalizeExtension)),
  aliases: Object.freeze(descriptor.aliases.map(normalizeToken))
});

/**
 * Canonical descriptors for every file type currently recognized by the
 * monorepo staging plan. App file-picker filters can select a subset of this
 * registry without changing generic MIME detection behavior.
 *
 * @type {Readonly<Record<string, MimeDescriptor>>}
 */
export const SUPPORTED_MIME_DESCRIPTORS = Object.freeze({
  turtle: defineDescriptor({
    id: 'turtle',
    mimeType: 'text/turtle',
    label: 'Turtle',
    category: 'rdf',
    extensions: ['ttl', 'turtle'],
    aliases: ['ttl', 'turtle', 'text/turtle']
  }),
  nTriples: defineDescriptor({
    id: 'nTriples',
    mimeType: 'application/n-triples',
    label: 'N-Triples',
    category: 'rdf',
    extensions: ['nt', 'ntriples'],
    aliases: ['nt', 'ntriples', 'n-triples', 'application/n-triples']
  }),
  nQuads: defineDescriptor({
    id: 'nQuads',
    mimeType: 'application/n-quads',
    label: 'N-Quads',
    category: 'rdf',
    extensions: ['nq', 'nquads'],
    aliases: ['nq', 'nquads', 'n-quads', 'application/n-quads']
  }),
  trig: defineDescriptor({
    id: 'trig',
    mimeType: 'application/trig',
    label: 'TriG',
    category: 'rdf',
    extensions: ['trig'],
    aliases: ['trig', 'application/trig']
  }),
  n3: defineDescriptor({
    id: 'n3',
    mimeType: 'text/n3',
    label: 'Notation3',
    category: 'rdf',
    extensions: ['n3'],
    aliases: ['n3', 'text/n3']
  }),
  jsonLd: defineDescriptor({
    id: 'jsonLd',
    mimeType: 'application/ld+json',
    label: 'JSON-LD',
    category: 'rdf',
    extensions: ['jsonld', 'json-ld'],
    aliases: ['jsonld', 'json-ld', 'application/ld+json']
  }),
  rdfXml: defineDescriptor({
    id: 'rdfXml',
    mimeType: 'application/rdf+xml',
    label: 'RDF/XML',
    category: 'rdf',
    extensions: ['rdf', 'owl', 'xml'],
    aliases: ['rdf', 'owl', 'xml', 'rdfxml', 'rdf/xml', 'application/rdf+xml']
  }),
  sparqlQuery: defineDescriptor({
    id: 'sparqlQuery',
    mimeType: 'application/sparql-query',
    label: 'SPARQL Query',
    category: 'query',
    extensions: ['rq', 'sparql'],
    aliases: ['rq', 'sparql', 'SPARQL Query', 'application/sparql-query']
  }),
  sparqlUpdate: defineDescriptor({
    id: 'sparqlUpdate',
    mimeType: 'application/sparql-update',
    label: 'SPARQL Update',
    category: 'query',
    extensions: ['ru'],
    aliases: ['ru', 'sparql-update', 'SPARQL Update', 'application/sparql-update']
  }),
  sparqlResultsJson: defineDescriptor({
    id: 'sparqlResultsJson',
    mimeType: 'application/sparql-results+json',
    label: 'SPARQL Results JSON',
    category: 'query',
    extensions: ['srj'],
    aliases: ['srj', 'sparql-results-json', 'SPARQL Results JSON', 'application/sparql-results+json']
  }),
  sparqlResultsXml: defineDescriptor({
    id: 'sparqlResultsXml',
    mimeType: 'application/sparql-results+xml',
    label: 'SPARQL Results XML',
    category: 'query',
    extensions: ['srx'],
    aliases: ['srx', 'sparql-results-xml', 'SPARQL Results XML', 'application/sparql-results+xml']
  }),
  sql: defineDescriptor({
    id: 'sql',
    mimeType: 'application/sql',
    label: 'SQL',
    category: 'query',
    extensions: ['sql'],
    aliases: ['sql', 'text/sql', 'application/sql']
  }),
  csv: defineDescriptor({
    id: 'csv',
    mimeType: 'text/csv',
    label: 'CSV',
    category: 'tabular',
    extensions: ['csv'],
    aliases: ['csv', 'text/csv']
  }),
  tsv: defineDescriptor({
    id: 'tsv',
    mimeType: 'text/tab-separated-values',
    label: 'TSV',
    category: 'tabular',
    extensions: ['tsv'],
    aliases: ['tsv', 'text/tab-separated-values']
  }),
  xlsx: defineDescriptor({
    id: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'XLSX',
    category: 'tabular',
    extensions: ['xlsx'],
    aliases: ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  }),
  xls: defineDescriptor({
    id: 'xls',
    mimeType: 'application/vnd.ms-excel',
    label: 'Excel 97-2003 Workbook',
    category: 'tabular',
    extensions: ['xls'],
    aliases: ['xls', 'application/vnd.ms-excel']
  }),
  docx: defineDescriptor({
    id: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'DOCX',
    category: 'document',
    extensions: ['docx'],
    aliases: ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  }),
  plainText: defineDescriptor({
    id: 'plainText',
    mimeType: 'text/plain',
    label: 'Plain text',
    category: 'text',
    extensions: ['txt', 'text'],
    aliases: ['txt', 'text', 'text/plain']
  }),
  html: defineDescriptor({
    id: 'html',
    mimeType: 'text/html',
    label: 'HTML',
    category: 'document',
    extensions: ['html', 'htm'],
    aliases: ['html', 'htm', 'text/html']
  }),
  yaml: defineDescriptor({
    id: 'yaml',
    mimeType: 'text/yaml',
    label: 'YAML',
    category: 'data',
    extensions: ['yaml', 'yml'],
    aliases: ['yaml', 'yml', 'text/yaml', 'application/yaml', 'application/x-yaml']
  }),
  json: defineDescriptor({
    id: 'json',
    mimeType: 'application/json',
    label: 'JSON',
    category: 'data',
    extensions: ['json'],
    aliases: ['json', 'application/json']
  }),
  mermaid: defineDescriptor({
    id: 'mermaid',
    mimeType: 'text/mermaid',
    label: 'Mermaid',
    category: 'visualization',
    extensions: ['mmd', 'mermaid'],
    aliases: ['mmd', 'mermaid', 'text/mermaid']
  }),
  d3Json: defineDescriptor({
    id: 'd3Json',
    mimeType: 'application/d3+json',
    label: 'D3 JSON',
    category: 'visualization',
    extensions: ['json'],
    aliases: ['d3', 'd3json', 'd3-json', 'application/d3+json']
  }),
  zip: defineDescriptor({
    id: 'zip',
    mimeType: 'application/zip',
    label: 'ZIP archive',
    category: 'archive',
    extensions: ['zip'],
    aliases: ['zip', 'application/zip']
  }),
  binary: defineDescriptor({
    id: 'binary',
    mimeType: 'application/octet-stream',
    label: 'Binary file',
    category: 'binary',
    extensions: ['bin'],
    aliases: ['binary', 'bin', 'application/octet-stream']
  })
});

const FORMAT_LIST = Object.freeze(Object.values(SUPPORTED_MIME_DESCRIPTORS));

const MIME_BY_EXTENSION = Object.freeze(FORMAT_LIST.reduce((map, descriptor) => {
  for (const extension of descriptor.extensions) {
    if (!map[extension]) map[extension] = descriptor;
  }
  return map;
}, {}));

const MIME_BY_ALIAS = Object.freeze(Object.fromEntries(
  FORMAT_LIST.flatMap((descriptor) => {
    const aliases = new Set([descriptor.mimeType, descriptor.id, ...descriptor.aliases].map(normalizeToken));
    return [...aliases].map((alias) => [alias, descriptor]);
  })
));

const MERMAID_OUTPUT_DESCRIPTOR = SUPPORTED_MIME_DESCRIPTORS.mermaid;

const D3_JSON_OUTPUT_DESCRIPTOR = SUPPORTED_MIME_DESCRIPTORS.d3Json;

/**
 * Returns the last filename extension without the leading dot.
 *
 * @param {string | null | undefined} fileName - Browser filename, local path,
 * URL-like path, or other string-like value.
 * @returns {string} Lowercase extension without dot, or an empty string when
 * no extension is present.
 */
export function getFilenameExtension(fileName) {
  const clean = String(fileName || '').split(/[?#]/, 1)[0].trim();
  const base = clean.split(/[\\/]/).pop() || '';
  const index = base.lastIndexOf('.');
  if (index <= 0 || index === base.length - 1) return '';
  return base.slice(index + 1).toLowerCase();
}

/**
 * Lists supported MIME descriptors, optionally filtered by category.
 *
 * @param {{category?: FormatCategory}} [options] - Optional descriptor filter.
 * @returns {ReadonlyArray<MimeDescriptor>} Frozen descriptor objects from the
 * registry.
 */
export function listSupportedMimeDescriptors(options = {}) {
  const category = options.category || '';
  return category
    ? Object.freeze(FORMAT_LIST.filter((descriptor) => descriptor.category === category))
    : FORMAT_LIST;
}

/**
 * Finds the supported MIME descriptor implied by a filename extension.
 *
 * This function does not know or enforce a file picker's accepted extensions.
 * A picker that only allows RDF files should filter independently and can call
 * this function after selection.
 *
 * @param {string | null | undefined} fileName - Filename or path.
 * @returns {MimeDescriptorResult} Supported descriptor, or an explicit
 * `unknown filetype` result.
 */
export function getSupportedMimeTypeForFilename(fileName) {
  const extension = getFilenameExtension(fileName);
  const descriptor = MIME_BY_EXTENSION[extension];
  return descriptor
    ? Object.freeze({ ok: true, value: descriptor })
    : unknownFiletype(fileName, extension);
}

/**
 * Finds the MIME descriptor for a user-selected output extension.
 *
 * This is intentionally extension-based. Export workflows that produce
 * context-specific JSON, such as D3 JSON, should use their dedicated output
 * descriptor instead of relying on `.json` alone.
 *
 * @param {string | null | undefined} extension - Extension with or without dot.
 * @returns {MimeDescriptorResult} Supported descriptor, or an explicit
 * `unknown filetype` result.
 */
export function getOutputMimeTypeForExtension(extension) {
  const normalized = normalizeExtension(extension);
  const descriptor = MIME_BY_EXTENSION[normalized];
  return descriptor
    ? Object.freeze({ ok: true, value: descriptor })
    : unknownFiletype(extension, normalized);
}

/**
 * Normalizes a supported MIME type, descriptor id, or shorthand token.
 *
 * @param {string | null | undefined} input - MIME string or alias.
 * @returns {MimeDescriptorResult} Supported descriptor, or an explicit
 * `unknown filetype` result.
 */
export function normalizeSupportedMimeType(input) {
  const descriptor = MIME_BY_ALIAS[normalizeToken(input)];
  return descriptor
    ? Object.freeze({ ok: true, value: descriptor })
    : unknownFiletype(input);
}

/**
 * Returns the preferred file extension for a supported MIME type or alias.
 *
 * @param {string | null | undefined} mimeType - MIME type, descriptor id, or alias.
 * @returns {Readonly<{ok: true, value: string}> | UnknownFiletypeResult}
 * Preferred extension without dot, or an unknown-filetype result.
 */
export function getPreferredExtensionForMimeType(mimeType) {
  const normalized = normalizeToken(mimeType);
  if (normalized === normalizeToken(MERMAID_OUTPUT_DESCRIPTOR.mimeType) || normalized === normalizeToken(MERMAID_OUTPUT_DESCRIPTOR.id)) {
    return Object.freeze({ ok: true, value: MERMAID_OUTPUT_DESCRIPTOR.extensions[0] });
  }
  if (normalized === normalizeToken(D3_JSON_OUTPUT_DESCRIPTOR.mimeType) || normalized === normalizeToken(D3_JSON_OUTPUT_DESCRIPTOR.id)) {
    return Object.freeze({ ok: true, value: D3_JSON_OUTPUT_DESCRIPTOR.extensions[0] });
  }
  const result = normalizeSupportedMimeType(mimeType);
  return result.ok
    ? Object.freeze({ ok: true, value: result.value.extensions[0] })
    : result;
}

/**
 * Classifies an extension into the legacy import kind used by tabular tools.
 *
 * @param {string | null | undefined} extension - Extension with or without dot.
 * @returns {'spreadsheet'|'ontology'|'query'|'document'|'text'|'data'|'unsupported'}
 */
export function getInputKindForExtension(extension) {
  const result = getOutputMimeTypeForExtension(extension);
  if (!result.ok) return 'unsupported';
  if (result.value.category === 'tabular') return 'spreadsheet';
  if (result.value.category === 'rdf') return 'ontology';
  return result.value.category;
}

/**
 * Resolves a format key or MIME string to a supported descriptor.
 *
 * @param {string | null | undefined} formatKey - Extension, alias, descriptor id, or MIME type.
 * @returns {MimeDescriptorResult}
 */
export function getMimeTypeForFormatKey(formatKey) {
  return normalizeSupportedMimeType(formatKey);
}

/**
 * Builds an export key to MIME type map from the promoted registry.
 *
 * @param {ReadonlyArray<string>} formatKeys - App-level format keys.
 * @returns {Readonly<Record<string, string>>}
 */
export function createFormatMimeTypeMap(formatKeys) {
  return Object.freeze((formatKeys || []).reduce((map, key) => {
    const result = getMimeTypeForFormatKey(key);
    if (result.ok) map[key] = result.value.mimeType;
    return map;
  }, {}));
}

/**
 * Builds an export key to preferred extension map from the promoted registry.
 *
 * @param {ReadonlyArray<string>} formatKeys - App-level format keys.
 * @returns {Readonly<Record<string, string>>}
 */
export function createFormatExtensionMap(formatKeys) {
  return Object.freeze((formatKeys || []).reduce((map, key) => {
    const result = getMimeTypeForFormatKey(key);
    const extension = normalizeExtension(key);
    if (result.ok) {
      map[key] = result.value.extensions.includes(extension)
        ? extension
        : result.value.extensions[0];
    }
    return map;
  }, {}));
}

/**
 * Returns the dedicated descriptor for Mermaid text output.
 *
 * Mermaid is not an RDF serialization and should not be mixed into ordinary
 * RDF MIME normalization.
 *
 * @returns {Readonly<{id: string, mimeType: string, label: string, category: 'visualization', extensions: ReadonlyArray<string>}>}
 */
export function getMermaidOutputMimeDescriptor() {
  return MERMAID_OUTPUT_DESCRIPTOR;
}

/**
 * Returns the dedicated descriptor for graph visualization JSON consumed by D3.
 *
 * The `.json` extension alone maps to ordinary `application/json`; callers
 * should use this function when the intended output is specifically D3 JSON.
 *
 * @returns {Readonly<{id: string, mimeType: string, label: string, category: 'visualization', extensions: ReadonlyArray<string>}>}
 */
export function getD3JsonOutputMimeDescriptor() {
  return D3_JSON_OUTPUT_DESCRIPTOR;
}

/**
 * Returns true when a descriptor belongs to the requested category.
 *
 * @param {MimeDescriptor} descriptor - MIME descriptor returned from this module.
 * @param {FormatCategory} category - Category to test.
 * @returns {boolean}
 */
export function isMimeDescriptorCategory(descriptor, category) {
  return descriptor?.category === category;
}

function unknownFiletype(input, extension = undefined) {
  return Object.freeze({
    ok: false,
    error: 'unknown filetype',
    input: String(input || ''),
    ...(extension !== undefined ? { extension } : {})
  });
}

function normalizeExtension(extension) {
  return String(extension || '').trim().toLowerCase().replace(/^\./, '');
}

function normalizeToken(input) {
  return String(input || '').trim().toLowerCase();
}
