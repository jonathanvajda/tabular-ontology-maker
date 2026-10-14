import { parseDelimitedText, serializeDelimitedRecords } from './delimited-text.js';

export const QUERY_RECORD_HEADERS = [
  'query_id',
  'query_label',
  'query_language',
  'query_text',
  'query_kind',
  'description',
  'tags',
  'created_at',
  'updated_at'
];

const QUERY_LANGUAGE_ALIASES = new Map([
  ['sparql', 'sparql'],
  ['sql', 'sql'],
  ['nosql', 'nosql'],
  ['cypher', 'cypher'],
  ['mongodb', 'mongodb'],
  ['mongo', 'mongodb'],
  ['graphql', 'graphql'],
  ['gremlin', 'gremlin']
]);

/**
 * @typedef {Object} QueryRecord
 * @property {string} queryId - Stable query identifier or IRI.
 * @property {string} queryLabel - Human-readable label.
 * @property {string} queryLanguage - Query language, such as `sparql`, `sql`, or `mongodb`.
 * @property {string} queryText - Query body.
 * @property {string} [queryKind] - Optional kind such as `select`, `construct`, `aggregation`, or app-specific class IRI.
 * @property {string} [description] - Optional description.
 * @property {string[]} [tags] - Optional tag list.
 * @property {string} [createdAt] - Optional ISO-ish creation timestamp.
 * @property {string} [updatedAt] - Optional ISO-ish update timestamp.
 */

/**
 * Serializes SQL/SPARQL/NoSQL query records to CSV or TSV.
 *
 * This is intentionally query-language-neutral. Axiolotl's current saved
 * SPARQL CSV can be adapted into this shape, and CQ Ferret can later use the
 * same contract for database-query artifacts without inheriting Axiolotl's
 * storage schema.
 *
 * @param {QueryRecord[]} queryRecords - Query records to serialize.
 * @param {object} [options] - Serialization options.
 * @param {string} [options.delimiter=','] - Output delimiter.
 * @param {string} [options.newline='\n'] - Output newline.
 * @returns {string} Delimited query exchange text.
 */
export function serializeQueryRecordsToDelimitedText(queryRecords, options = {}) {
  const records = (Array.isArray(queryRecords) ? queryRecords : []).map((record) => ({
    query_id: record?.queryId ?? '',
    query_label: record?.queryLabel ?? '',
    query_language: normalizeQueryLanguage(record?.queryLanguage).value,
    query_text: record?.queryText ?? '',
    query_kind: record?.queryKind ?? '',
    description: record?.description ?? '',
    tags: Array.isArray(record?.tags) ? record.tags.join('|') : String(record?.tags ?? ''),
    created_at: record?.createdAt ?? '',
    updated_at: record?.updatedAt ?? ''
  }));

  return serializeDelimitedRecords(records, {
    ...options,
    headers: QUERY_RECORD_HEADERS
  });
}

/**
 * Parses delimited query exchange text into normalized query records.
 *
 * @param {string} text - CSV/TSV query exchange text.
 * @param {object} [options] - Parse options.
 * @param {string} [options.delimiter] - Explicit delimiter.
 * @param {string} [options.defaultQueryLanguage] - Language to use when an imported legacy file has no language column.
 * @param {boolean} [options.requireQueryText=true] - Warn and skip rows without query text.
 * @param {boolean} [options.requireQueryLanguage=true] - Warn and skip rows without query language.
 * @returns {{records: QueryRecord[], warnings: import('./delimited-text.js').TabularWarning[], delimiter: string}} Parsed query records and warnings.
 */
export function parseQueryRecordsFromDelimitedText(text, options = {}) {
  const parsed = parseDelimitedText(text, {
    delimiter: options.delimiter,
    hasHeader: true,
    trimHeaders: true,
    trimCells: false
  });
  const headerMap = createQueryHeaderMap(parsed.headers);
  const warnings = [...parsed.warnings];
  const records = [];
  const requireQueryText = options.requireQueryText !== false;
  const requireQueryLanguage = options.requireQueryLanguage !== false;

  parsed.records.forEach((row, index) => {
    const rowNumber = index + 2;
    const queryText = getMappedValue(row, headerMap, 'queryText');
    const languageResult = normalizeQueryLanguage(
      getMappedValue(row, headerMap, 'queryLanguage') || options.defaultQueryLanguage
    );
    if (requireQueryText && !String(queryText).trim()) {
      warnings.push({
        code: 'missing_query_text',
        message: `Row ${rowNumber} was skipped because query text is empty.`,
        row: rowNumber
      });
      return;
    }
    if (requireQueryLanguage && !languageResult.value) {
      warnings.push({
        code: 'missing_query_language',
        message: `Row ${rowNumber} was skipped because query language is empty or unsupported.`,
        row: rowNumber
      });
      return;
    }
    if (languageResult.warning) {
      warnings.push({
        code: 'unknown_query_language',
        message: `Row ${rowNumber} uses unrecognized query language "${languageResult.original}".`,
        row: rowNumber
      });
    }

    records.push({
      queryId: getMappedValue(row, headerMap, 'queryId'),
      queryLabel: getMappedValue(row, headerMap, 'queryLabel'),
      queryLanguage: languageResult.value,
      queryText,
      queryKind: getMappedValue(row, headerMap, 'queryKind'),
      description: getMappedValue(row, headerMap, 'description'),
      tags: splitTags(getMappedValue(row, headerMap, 'tags')),
      createdAt: getMappedValue(row, headerMap, 'createdAt'),
      updatedAt: getMappedValue(row, headerMap, 'updatedAt')
    });
  });

  return { records, warnings, delimiter: parsed.delimiter };
}

function createQueryHeaderMap(headers) {
  const aliases = {
    queryId: ['query_id', 'query id', 'id', 'query iri', 'query id (iri)'],
    queryLabel: ['query_label', 'query label', 'label', 'name', 'title'],
    queryLanguage: ['query_language', 'query language', 'language', 'dialect'],
    queryText: ['query_text', 'query text', 'value', "value ('has sparql query text value')", 'text', 'body'],
    queryKind: ['query_kind', 'query kind', 'kind', 'type', 'type (class iri)', 'query type'],
    description: ['description', 'notes', 'comment'],
    tags: ['tags', 'tag'],
    createdAt: ['created_at', 'created at', 'created'],
    updatedAt: ['updated_at', 'updated at', 'modified', 'updated']
  };
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const out = {};
  for (const [field, names] of Object.entries(aliases)) {
    const match = names.map(normalizeHeader).find((name) => normalizedHeaders.has(name));
    if (match) out[field] = normalizedHeaders.get(match);
  }
  return out;
}

function getMappedValue(row, headerMap, field) {
  const key = headerMap[field];
  return key ? String(row[key] ?? '') : '';
}

function normalizeQueryLanguage(value) {
  const original = String(value ?? '').trim();
  if (!original) return { value: '', original, warning: false };
  const normalized = original.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const valueFromAlias = QUERY_LANGUAGE_ALIASES.get(normalized);
  if (valueFromAlias) return { value: valueFromAlias, original, warning: false };
  return { value: normalized, original, warning: true };
}

function splitTags(value) {
  return String(value ?? '')
    .split(/[|;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
