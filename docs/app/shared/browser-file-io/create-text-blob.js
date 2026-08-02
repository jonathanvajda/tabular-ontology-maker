/**
 * @file Blob creation helpers for browser download adapters.
 */

/**
 * @typedef {Object} TextBlobOptions
 * @property {string} [mimeType='text/plain'] - MIME type to apply to the Blob.
 * @property {string | false} [charset='utf-8'] - Charset appended unless false or already present.
 * @property {typeof Blob} [BlobConstructor] - Browser Blob constructor, mainly supplied by tests.
 */

/**
 * Creates a Blob from text with predictable MIME and charset handling.
 *
 * This function does not create object URLs, touch the DOM, or trigger a
 * download. It is intentionally separate from `downloadBlob` so content
 * creation can be tested independently from browser side effects.
 *
 * @param {unknown} text - Content to stringify into the Blob.
 * @param {TextBlobOptions} [options] - Blob MIME options and test seam.
 * @returns {Blob} Text Blob.
 */
export function createTextBlob(text, options = {}) {
  const BlobConstructor = options.BlobConstructor || globalThis.Blob;
  if (typeof BlobConstructor !== 'function') {
    throw new Error('Blob is not available in this environment.');
  }

  return new BlobConstructor([String(text ?? '')], {
    type: normalizeTextMimeType(options.mimeType, options.charset)
  });
}

/**
 * Normalizes a MIME type and appends a charset for text-like downloads.
 *
 * @param {string} [mimeType='text/plain'] - MIME type.
 * @param {string | false} [charset='utf-8'] - Charset to append, or false.
 * @returns {string} MIME type suitable for Blob construction.
 */
export function normalizeTextMimeType(mimeType = 'text/plain', charset = 'utf-8') {
  const base = String(mimeType || 'text/plain').trim() || 'text/plain';
  if (charset === false || /;\s*charset=/i.test(base)) return base;
  return `${base};charset=${charset || 'utf-8'}`;
}
