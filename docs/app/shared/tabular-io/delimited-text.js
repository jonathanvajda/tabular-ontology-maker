/**
 * @file Pure delimited-text parsing and serialization helpers.
 *
 * This module owns CSV/TSV-style text grammar and row normalization. It does
 * not read browser files, trigger downloads, parse spreadsheets, or interpret
 * rows as ontology, query, report, or IRI-mapping records.
 */

/**
 * @typedef {Object} TabularWarning
 * @property {string} code - Stable warning code.
 * @property {string} message - Human-readable diagnostic.
 * @property {number} [row] - One-based row number when applicable.
 * @property {number} [column] - One-based column number when applicable.
 */

/**
 * @typedef {Object} ParsedDelimitedText
 * @property {string[]} headers - Header names after normalization.
 * @property {string[][]} rows - Data rows as string cells.
 * @property {Array<Record<string, string>>} records - Data rows keyed by header.
 * @property {string} delimiter - Delimiter used while parsing.
 * @property {TabularWarning[]} warnings - Non-fatal parse or normalization diagnostics.
 */

/**
 * Parses CSV/TSV-style text into a normalized tabular dataset.
 *
 * The parser supports quoted cells, escaped quotes, CRLF/LF/CR newlines, UTF-8
 * BOM removal, optional headers, duplicate-header normalization, blank-row
 * filtering, and row-width diagnostics. It is intentionally pure so browser
 * file reads and app-specific row interpretation can stay outside this package.
 *
 * @param {string} text - Delimited text content.
 * @param {object} [options] - Parse options.
 * @param {string} [options.delimiter] - Explicit delimiter, commonly `,` or `\t`.
 * @param {boolean} [options.hasHeader=true] - Whether the first parsed row is a header row.
 * @param {boolean} [options.trimHeaders=true] - Trim header names.
 * @param {boolean} [options.trimCells=false] - Trim data cells.
 * @param {boolean} [options.skipBlankRows=true] - Drop rows whose cells are all blank.
 * @param {boolean} [options.normalizeDuplicateHeaders=true] - Suffix duplicate headers as `_2`, `_3`, etc.
 * @returns {ParsedDelimitedText} Parsed tabular dataset.
 */
export function parseDelimitedText(text, options = {}) {
  const source = stripBom(String(text ?? ''));
  const delimiter = options.delimiter || detectDelimitedTextDelimiter(source);
  const warnings = [];
  const parsedRows = parseRows(source, delimiter, warnings);
  const skipBlankRows = options.skipBlankRows !== false;
  const rows = skipBlankRows ? parsedRows.filter((row) => !isBlankRow(row)) : parsedRows;

  if (rows.length === 0) {
    return { headers: [], rows: [], records: [], delimiter, warnings };
  }

  const hasHeader = options.hasHeader !== false;
  const rawHeaders = hasHeader ? rows[0] : createGeneratedHeaders(maxRowWidth(rows));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headers = normalizeHeaders(rawHeaders, {
    trimHeaders: options.trimHeaders !== false,
    normalizeDuplicateHeaders: options.normalizeDuplicateHeaders !== false,
    warnings
  });
  const normalizedRows = dataRows.map((row, rowIndex) => {
    const normalized = normalizeRowWidth(row, headers.length, warnings, rowIndex + (hasHeader ? 2 : 1));
    return options.trimCells ? normalized.map((cell) => cell.trim()) : normalized;
  });

  return {
    headers,
    rows: normalizedRows,
    records: rowsToRecords(normalizedRows, headers),
    delimiter,
    warnings
  };
}

/**
 * Detects the likely delimiter in delimited text.
 *
 * @param {string} text - Delimited text sample.
 * @param {object} [options] - Detection options.
 * @param {string[]} [options.candidates=[',','\t',';','|']] - Delimiters to consider.
 * @returns {string} Best delimiter candidate.
 */
export function detectDelimitedTextDelimiter(text, options = {}) {
  const candidates = Array.isArray(options.candidates) && options.candidates.length
    ? options.candidates
    : [',', '\t', ';', '|'];
  const sampleRows = parseRows(stripBom(String(text ?? '')).slice(0, 8192), null, [])
    .filter((row) => !isBlankRow(row))
    .slice(0, 10);

  let best = candidates[0];
  let bestScore = -1;
  for (const delimiter of candidates) {
    const widths = sampleRows.map((row) => row.join('\u001f').split(delimiter).length);
    const rowsWithDelimiter = widths.filter((width) => width > 1).length;
    const averageWidth = widths.reduce((sum, width) => sum + width, 0) / Math.max(widths.length, 1);
    const score = rowsWithDelimiter * 10 + averageWidth;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Escapes one value for delimited text output.
 *
 * @param {unknown} value - Cell value.
 * @param {object} [options] - Escape options.
 * @param {string} [options.delimiter=','] - Output delimiter.
 * @param {boolean} [options.quoteAll=false] - Quote every cell, including empty cells.
 * @returns {string} Escaped cell text.
 */
export function escapeDelimitedCell(value, options = {}) {
  const delimiter = options.delimiter ?? ',';
  const text = value == null ? '' : String(value);
  const mustQuote = options.quoteAll === true || text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter);
  const escaped = text.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

/**
 * Serializes row arrays to delimited text.
 *
 * @param {Array<Array<unknown>>} rows - Rows to serialize.
 * @param {object} [options] - Serialization options.
 * @param {string} [options.delimiter=','] - Output delimiter.
 * @param {string} [options.newline='\n'] - Output newline.
 * @param {boolean} [options.trailingNewline=true] - Append a final newline.
 * @param {boolean} [options.quoteAll=false] - Quote every cell.
 * @returns {string} Delimited text.
 */
export function serializeDelimitedRows(rows, options = {}) {
  const delimiter = options.delimiter ?? ',';
  const newline = options.newline ?? '\n';
  const lines = (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => escapeDelimitedCell(cell, {
      delimiter,
      quoteAll: options.quoteAll === true
    })).join(delimiter)
  );
  const text = lines.join(newline);
  return options.trailingNewline === false ? text : `${text}${newline}`;
}

/**
 * Serializes records to delimited text using explicit headers.
 *
 * @param {Array<Record<string, unknown>>} records - Record objects.
 * @param {object} [options] - Serialization options.
 * @param {string[]} [options.headers] - Header order. Defaults to keys from the first record.
 * @returns {string} Delimited text.
 */
export function serializeDelimitedRecords(records, options = {}) {
  const source = Array.isArray(records) ? records : [];
  const headers = Array.isArray(options.headers) && options.headers.length
    ? options.headers.map((header) => String(header))
    : Object.keys(source[0] || {});
  const rows = [
    headers,
    ...source.map((record) => headers.map((header) => record?.[header] ?? ''))
  ];
  return serializeDelimitedRows(rows, options);
}

/**
 * Converts row arrays into records keyed by header.
 *
 * @param {string[][]} rows - Row arrays.
 * @param {string[]} headers - Header names.
 * @returns {Array<Record<string, string>>} Record rows.
 */
export function rowsToRecords(rows, headers) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
}

function parseRows(text, delimiter, warnings) {
  const delim = delimiter || '\n';
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let rowNumber = 1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (delimiter && ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      rowNumber += 1;
      if (ch === '\r' && next === '\n') i += 1;
    } else {
      cell += ch;
    }
  }

  if (inQuotes) {
    warnings.push({
      code: 'unterminated_quote',
      message: `Row ${rowNumber} has an unterminated quoted cell.`,
      row: rowNumber
    });
  }

  if (cell.length > 0 || row.length > 0 || text.endsWith(delim)) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeaders(headers, options) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = options.trimHeaders ? String(header ?? '').trim() : String(header ?? '');
    let name = base || `column_${index + 1}`;
    if (!base) {
      options.warnings.push({
        code: 'blank_header',
        message: `Blank header at column ${index + 1} was replaced with "${name}".`,
        column: index + 1
      });
    }
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    if (count > 0 && options.normalizeDuplicateHeaders) {
      const next = `${name}_${count + 1}`;
      options.warnings.push({
        code: 'duplicate_header',
        message: `Duplicate header "${name}" at column ${index + 1} was renamed to "${next}".`,
        column: index + 1
      });
      name = next;
    }
    return name;
  });
}

function normalizeRowWidth(row, width, warnings, rowNumber) {
  const normalized = row.slice(0, width).map((cell) => String(cell ?? ''));
  if (row.length < width) {
    warnings.push({
      code: 'short_row',
      message: `Row ${rowNumber} has ${row.length} cells; expected ${width}. Missing cells were filled with empty strings.`,
      row: rowNumber
    });
    while (normalized.length < width) normalized.push('');
  } else if (row.length > width) {
    warnings.push({
      code: 'wide_row',
      message: `Row ${rowNumber} has ${row.length} cells; expected ${width}. Extra cells were ignored.`,
      row: rowNumber
    });
  }
  return normalized;
}

function maxRowWidth(rows) {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function createGeneratedHeaders(width) {
  return Array.from({ length: width }, (_, index) => `column_${index + 1}`);
}

function isBlankRow(row) {
  return row.every((cell) => String(cell ?? '').trim() === '');
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
