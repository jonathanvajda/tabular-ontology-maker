/**
 * Stable error type for shared UI feedback utilities.
 */
export class UiFeedbackError extends Error {
  /**
   * @param {string} message
   * @param {{code?: string, details?: any, cause?: any}} [options]
   */
  constructor(message, { code = 'UI_FEEDBACK_ERROR', details = null, cause = null } = {}) {
    super(message);
    this.name = 'UiFeedbackError';
    this.code = code;
    this.details = details;
    if (cause) this.cause = cause;
  }
}

/**
 * @param {string} message
 * @param {string} code
 * @param {any} [details]
 * @returns {UiFeedbackError}
 */
export function createUiFeedbackValidationError(message, code, details = null) {
  return new UiFeedbackError(message, { code, details });
}
