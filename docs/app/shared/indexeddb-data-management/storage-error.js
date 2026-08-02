/**
 * Error type used by the data-management package when an operation fails at a
 * known boundary such as validation, IndexedDB open, transaction, or storage.
 */
export class StorageError extends Error {
  constructor(message, { code = 'STORAGE_ERROR', cause, details } = {}) {
    super(message, { cause });
    this.name = 'StorageError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Create a validation error with a stable code and optional diagnostic details.
 *
 * @param {string} message Human-readable validation failure.
 * @param {object} [details] Structured details useful to tests or callers.
 * @returns {StorageError}
 */
export function createValidationError(message, details) {
  return new StorageError(message, {
    code: 'VALIDATION_ERROR',
    details
  });
}

/**
 * Convert an unknown thrown value into a StorageError while preserving the
 * original value as `cause` when possible.
 *
 * @param {unknown} error Original thrown value.
 * @param {string} fallbackMessage Message to use when `error` has no message.
 * @param {string} [code] Stable storage error code.
 * @returns {StorageError}
 */
export function toStorageError(error, fallbackMessage, code = 'STORAGE_ERROR') {
  if (error instanceof StorageError) return error;
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : fallbackMessage;
  return new StorageError(message || fallbackMessage, { code, cause: error });
}
