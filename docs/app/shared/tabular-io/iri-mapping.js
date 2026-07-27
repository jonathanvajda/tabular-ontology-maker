/**
 * @file IRI mapping row normalization.
 *
 * This module is intentionally domain-specific. It consumes already-parsed
 * tabular rows and creates an IRI mapping model; it does not parse CSV grammar
 * itself and should not live inside generic delimited-text code.
 */

/**
 * Creates a Map of old IRI to new IRI from parsed tabular records.
 *
 * @param {Array<Record<string, unknown>>} rows - Parsed row records.
 * @param {object} [options] - Mapping options.
 * @param {string[]} [options.oldIriHeaders] - Accepted old/source IRI headers.
 * @param {string[]} [options.newIriHeaders] - Accepted new/target IRI headers.
 * @param {'first'|'last'|'error'} [options.duplicatePolicy='last'] - Conflict policy for duplicate old IRIs.
 * @param {boolean} [options.stripAngleBrackets=true] - Strip wrapping `<...>` from IRI cells.
 * @returns {{mapping: Map<string, string>, meta: { rows: number, uniqueOld: number, duplicateOld: number, skippedRows: number }, warnings: Array<{code:string,message:string,row?:number}>}} Mapping result.
 */
export function createIriMappingFromRows(rows, options = {}) {
  const records = Array.isArray(rows) ? rows : [];
  const headers = Object.keys(records[0] || {});
  const oldKey = findHeader(headers, options.oldIriHeaders || ['old iri', 'source iri', 'from iri', 'oldiri']);
  const newKey = findHeader(headers, options.newIriHeaders || ['new iri', 'target iri', 'to iri', 'newiri']);
  const warnings = [];

  if (!oldKey || !newKey) {
    throw new Error(`Mapping rows must include old and new IRI columns. Found: ${headers.length ? headers.join(', ') : '(no columns)'}`);
  }

  const duplicatePolicy = options.duplicatePolicy || 'last';
  const mapping = new Map();
  let duplicateOld = 0;
  let skippedRows = 0;

  records.forEach((row, index) => {
    const rowNumber = index + 2;
    const oldIri = normalizeIriCell(row[oldKey], options);
    const newIri = normalizeIriCell(row[newKey], options);
    if (!oldIri || !newIri) {
      skippedRows += 1;
      warnings.push({
        code: 'missing_mapping_value',
        message: `Row ${rowNumber} was skipped because old or new IRI is empty.`,
        row: rowNumber
      });
      return;
    }
    if (mapping.has(oldIri)) {
      duplicateOld += 1;
      const existing = mapping.get(oldIri);
      if (existing !== newIri && duplicatePolicy === 'error') {
        throw new Error(`Conflicting mapping for "${oldIri}" at row ${rowNumber}.`);
      }
      warnings.push({
        code: existing === newIri ? 'duplicate_mapping' : 'conflicting_mapping',
        message: existing === newIri
          ? `Row ${rowNumber} repeats mapping for "${oldIri}".`
          : `Row ${rowNumber} changes mapping for "${oldIri}". Policy "${duplicatePolicy}" applied.`,
        row: rowNumber
      });
      if (duplicatePolicy === 'first') return;
    }
    mapping.set(oldIri, newIri);
  });

  return {
    mapping,
    meta: {
      rows: records.length,
      uniqueOld: mapping.size,
      duplicateOld,
      skippedRows
    },
    warnings
  };
}

function findHeader(headers, accepted) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const name of accepted) {
    const exact = normalized.get(normalizeHeader(name));
    if (exact) return exact;
  }
  for (const header of headers) {
    const normalizedHeader = normalizeHeader(header);
    if (accepted.some((name) => {
      const normalizedName = normalizeHeader(name);
      return normalizedName.split(' ').every((part) => normalizedHeader.includes(part));
    })) {
      return header;
    }
  }
  return null;
}

function normalizeIriCell(value, options) {
  let text = String(value ?? '').trim();
  if (options.stripAngleBrackets !== false && text.startsWith('<') && text.endsWith('>')) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}
