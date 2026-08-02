import {
  detectDelimitedTextDelimiter,
  parseDelimitedText
} from './delimited-text.js';

/**
 * Detects the likely CSV/TSV delimiter from one line or text sample.
 *
 * @param {string} text Text sample.
 * @returns {','|'\t'} Comma or tab delimiter.
 */
export function detectCsvOrTsvDelimiter(text) {
  return /** @type {','|'\t'} */ (detectDelimitedTextDelimiter(text, { candidates: [',', '\t'] }));
}

/**
 * Parses one delimited line using the package CSV/TSV parser.
 *
 * @param {string} line One CSV/TSV line.
 * @param {','|'\t'} delimiter Delimiter to use.
 * @returns {string[]} Parsed cells.
 */
export function parseDelimitedLine(line, delimiter) {
  return parseDelimitedText(line, {
    delimiter,
    hasHeader: false,
    trimCells: false,
    skipBlankRows: false
  }).rows[0] || [];
}

/**
 * Parses CSV/TSV text into the legacy table shape used by Table Nova:
 * `{ header: string[]|null, rows: string[][] }`.
 *
 * @param {string} text CSV/TSV text.
 * @param {','|'\t'|null} [delimiterHint=null] Optional delimiter override.
 * @returns {{header: string[]|null, rows: string[][]}} Header candidate and rows.
 */
export function parseDelimitedTextAsHeaderRows(text, delimiterHint = null) {
  const parsed = parseDelimitedText(String(text ?? ''), {
    delimiter: delimiterHint || undefined,
    hasHeader: false,
    trimCells: true,
    skipBlankRows: true
  });
  const rows = parsed.rows || [];
  if (rows.length === 0) return { header: null, rows: [] };
  return { header: rows[0], rows: rows.slice(1) };
}

/**
 * Applies user-selected header row options to a header/rows table shape.
 *
 * @param {{header?: string[]|null, rows?: string[][]}} tabular Parsed table.
 * @param {boolean} treatFirstRowAsHeader Whether a header row should be selected.
 * @param {number} [headerRowNumber=1] One-based header row number.
 * @returns {{header: string[]|null, rows: string[][]}} Updated table shape.
 */
export function applyHeaderRowOptions(tabular, treatFirstRowAsHeader, headerRowNumber = 1) {
  if (!treatFirstRowAsHeader) return /** @type {{header: string[]|null, rows: string[][]}} */ (tabular);

  const allRows = [
    ...(Array.isArray(tabular.header) ? [tabular.header] : []),
    ...(Array.isArray(tabular.rows) ? tabular.rows : [])
  ];
  if (allRows.length === 0) return { header: null, rows: [] };

  const requested = Math.max(1, Math.floor(Number(headerRowNumber || 1)));
  const headerIndex = Math.min(allRows.length - 1, requested - 1);
  return {
    header: allRows[headerIndex],
    rows: allRows.slice(headerIndex + 1)
  };
}
