/**
 * @file Stable errors for report export utilities.
 */

/**
 * Error type with a stable machine-readable code for report export failures.
 */
export class ReportExportError extends Error {
  /**
   * @param {string} message Human-readable failure message.
   * @param {object} [options]
   * @param {string} [options.code='REPORT_EXPORT_ERROR'] Stable error code.
   * @param {unknown} [options.details] Additional diagnostic details.
   */
  constructor(message, { code = 'REPORT_EXPORT_ERROR', details } = {}) {
    super(message);
    this.name = 'ReportExportError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Creates a validation error for invalid report-export inputs.
 *
 * @param {string} message Human-readable validation message.
 * @param {unknown} [details] Optional diagnostic details.
 * @returns {ReportExportError}
 */
export function createReportValidationError(message, details) {
  return new ReportExportError(message, {
    code: 'REPORT_EXPORT_VALIDATION_ERROR',
    details
  });
}
