import { createReportValidationError, ReportExportError } from './report-error.js';

/**
 * Opens a browser print window for an HTML document.
 *
 * @param {string} html Complete HTML document or HTML fragment.
 * @param {object} [options]
 * @param {Window} [options.windowRef=globalThis.window] Window-like object.
 * @param {string} [options.target='_blank'] Window target.
 * @param {string} [options.features='width=1200,height=800'] Window features.
 * @param {boolean} [options.closeAfterPrint=true] Close the print window after printing.
 * @returns {Window} The opened print window.
 */
export function openPrintableHtmlDocument(html, {
  windowRef = globalThis.window,
  target = '_blank',
  features = 'width=1200,height=800',
  closeAfterPrint = true
} = {}) {
  if (!html) throw createReportValidationError('openPrintableHtmlDocument expected HTML content.');
  if (!windowRef || typeof windowRef.open !== 'function') {
    throw new ReportExportError('openPrintableHtmlDocument expected a browser window object.', {
      code: 'PRINT_WINDOW_UNAVAILABLE'
    });
  }

  const printWindow = windowRef.open('', target, features);
  if (!printWindow) {
    throw new ReportExportError('Print window was blocked.', {
      code: 'PRINT_WINDOW_BLOCKED'
    });
  }

  const printableHtml = appendPrintScript(String(html), { closeAfterPrint });
  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();
  if (typeof printWindow.focus === 'function') printWindow.focus();
  return printWindow;
}

/**
 * Adds a load-time print script before the closing body tag.
 *
 * @param {string} html HTML document or fragment.
 * @param {object} [options]
 * @param {boolean} [options.closeAfterPrint=true] Close the print window after printing.
 * @returns {string} HTML with a print script.
 */
export function appendPrintScript(html, { closeAfterPrint = true } = {}) {
  const script = `<script>
window.addEventListener('load', () => { window.print(); });
${closeAfterPrint ? "window.addEventListener('afterprint', () => { window.close(); });" : ''}
</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${script}</body>`) : `${html}${script}`;
}
