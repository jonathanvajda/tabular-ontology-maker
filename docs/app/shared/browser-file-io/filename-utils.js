/**
 * @file Pure filename and Blob-shape helpers for browser file workflows.
 */

/**
 * Normalizes a file extension for registry lookup or filename construction.
 *
 * @param {string | null | undefined} extension - Extension with or without leading dot.
 * @returns {string} Lowercase extension without a leading dot.
 */
export function normalizeFileExtension(extension) {
  return String(extension || '').trim().toLowerCase().replace(/^\.+/, '');
}

/**
 * Removes one known-looking filename extension from the final path segment.
 *
 * This intentionally strips only a short final extension. It does not try to
 * parse archive chains such as `.tar.gz`, because callers may want to preserve
 * that semantic basename.
 *
 * @param {string | null | undefined} fileName - Filename or label.
 * @returns {string} Filename text without a short final extension.
 */
export function stripFileExtension(fileName) {
  return String(fileName || '').trim().replace(/\.[A-Za-z0-9_-]{1,12}$/, '');
}

/**
 * Creates a filesystem-safe basename without adding an extension.
 *
 * @param {string | null | undefined} value - User label, filename, or id.
 * @param {object} [options]
 * @param {string} [options.fallbackBase='artifact'] Basename used after empty input.
 * @param {number} [options.maxLength=120] Maximum returned basename length.
 * @returns {string} Safe non-empty filename basename.
 */
export function createSafeFilenameBase(value, { fallbackBase = 'artifact', maxLength = 120 } = {}) {
  const safe = String(value || fallbackBase)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, Math.max(1, Number(maxLength) || 120));
  return safe || fallbackBase;
}

/**
 * Identifies browser Blob-like objects without requiring the global Blob class.
 *
 * @param {unknown} value - Candidate payload.
 * @returns {boolean} True when the value exposes common Blob read/type APIs.
 */
export function isBlobLike(value) {
  return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.type === 'string');
}
