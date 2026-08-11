import { createReportValidationError } from './report-error.js';

/**
 * @typedef {Readonly<{
 *   title?: string,
 *   paragraphs?: ReadonlyArray<unknown>,
 *   metadata?: ReadonlyArray<Readonly<[unknown, unknown]>>,
 *   tables?: ReadonlyArray<ReportTable>,
 *   sections?: ReadonlyArray<ReportSection>
 * }>} ReportSection
 */

/**
 * @typedef {Readonly<{
 *   caption?: string,
 *   headers?: ReadonlyArray<unknown>,
 *   rows?: ReadonlyArray<ReadonlyArray<unknown>>
 * }>} ReportTable
 */

const DEFAULT_PRINT_CSS = `
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111;}
h1,h2,h3{margin:0.2rem 0 0.6rem;}
p{line-height:1.45;}
.report-section{border:1px solid #ddd;border-radius:8px;padding:14px;margin:14px 0;}
.report-meta{margin:0.25rem 0;}
.report-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.92em;}
table{width:100%;border-collapse:collapse;margin-top:10px;}
caption{text-align:left;font-weight:700;margin-bottom:6px;}
th,td{border-bottom:1px solid #e5e5e5;padding:8px;text-align:left;vertical-align:top;}
th{background:#f7f7f7;}
@media print{body{margin:12mm;}.report-section{break-inside:avoid;}}
`.trim();

/**
 * Escapes a value for safe insertion into HTML text or attribute contexts.
 *
 * @param {unknown} value Value to escape.
 * @returns {string} HTML-safe text.
 */
export function escapeHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Serializes a generic report table to an HTML table fragment.
 *
 * @param {ReportTable} table Report table descriptor.
 * @returns {string} HTML table fragment.
 */
export function serializeReportTableToHtml(table) {
  const headers = Array.isArray(table?.headers) ? table.headers : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  let html = '<table>';
  if (table?.caption) html += `<caption>${escapeHtmlText(table.caption)}</caption>`;
  if (headers.length) {
    html += '<thead><tr>';
    for (const header of headers) html += `<th>${escapeHtmlText(header)}</th>`;
    html += '</tr></thead>';
  }
  html += '<tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of Array.isArray(row) ? row : []) html += `<td>${escapeHtmlText(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

/**
 * Serializes a generic report section to an HTML fragment.
 *
 * @param {ReportSection} section Report section descriptor.
 * @param {number} [depth=2] Heading depth.
 * @returns {string} HTML section fragment.
 */
export function serializeReportSectionToHtml(section, depth = 2) {
  const safeDepth = Math.min(Math.max(Number(depth) || 2, 2), 6);
  let html = '<section class="report-section">';
  if (section?.title) html += `<h${safeDepth}>${escapeHtmlText(section.title)}</h${safeDepth}>`;
  for (const paragraph of Array.isArray(section?.paragraphs) ? section.paragraphs : []) {
    html += `<p>${escapeHtmlText(paragraph)}</p>`;
  }
  for (const [label, value] of Array.isArray(section?.metadata) ? section.metadata : []) {
    html += `<div class="report-meta">${escapeHtmlText(label)}: <span class="report-mono">${escapeHtmlText(value)}</span></div>`;
  }
  for (const table of Array.isArray(section?.tables) ? section.tables : []) {
    html += serializeReportTableToHtml(table);
  }
  for (const child of Array.isArray(section?.sections) ? section.sections : []) {
    html += serializeReportSectionToHtml(child, safeDepth + 1);
  }
  html += '</section>';
  return html;
}

/**
 * Serializes a report document descriptor to a complete HTML document.
 *
 * @param {object} report Report document descriptor.
 * @param {string} report.title Document title.
 * @param {ReadonlyArray<ReportSection>} [report.sections] Document sections.
 * @param {ReadonlyArray<unknown>} [report.paragraphs] Top-level paragraphs.
 * @param {ReadonlyArray<Readonly<[unknown, unknown]>>} [report.metadata] Top-level metadata rows.
 * @param {ReadonlyArray<ReportTable>} [report.tables] Top-level tables.
 * @param {object} [options]
 * @param {string} [options.language='en'] HTML language tag.
 * @param {string} [options.css] Additional or replacement CSS.
 * @param {boolean} [options.appendDefaultCss=true] Append default print CSS before custom CSS.
 * @returns {string} Complete HTML document.
 */
export function serializeReportDocumentToHtml(report, options = {}) {
  const title = String(report?.title || '').trim();
  if (!title) throw createReportValidationError('serializeReportDocumentToHtml expected a non-empty title.');

  const language = String(options.language || 'en').trim() || 'en';
  const appendDefaultCss = options.appendDefaultCss !== false;
  const css = `${appendDefaultCss ? DEFAULT_PRINT_CSS : ''}${options.css ? `\n${options.css}` : ''}`;
  const rootSection = {
    paragraphs: report.paragraphs,
    metadata: report.metadata,
    tables: report.tables,
    sections: report.sections
  };

  let html = '<!doctype html>';
  html += `<html lang="${escapeHtmlText(language)}"><head><meta charset="utf-8" />`;
  html += '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  html += `<title>${escapeHtmlText(title)}</title>`;
  if (css.trim()) html += `<style>${css}</style>`;
  html += '</head><body>';
  html += `<h1>${escapeHtmlText(title)}</h1>`;
  html += serializeReportSectionToHtml(rootSection);
  html += '</body></html>';
  return html;
}
