/**
 * @file Browser Blob download adapter.
 */

/**
 * @typedef {Object} DownloadBlobOptions
 * @property {Document} [documentRef] - Test seam or browser document.
 * @property {Pick<typeof URL, 'createObjectURL'|'revokeObjectURL'>} [urlRef] - Test seam or browser URL object.
 * @property {number} [revokeDelayMs=0] - Delay before revoking the object URL.
 * @property {boolean} [appendToDocument=true] - Append the anchor before clicking for broad browser compatibility.
 */

/**
 * @typedef {Readonly<{
 *   fileName: string,
 *   objectUrl: string,
 *   revokeDelayMs: number
 * }>} DownloadDescriptor
 */

/**
 * Triggers a browser download for an existing Blob.
 *
 * This is the only canonical function in the package that owns the anchor
 * click and object URL lifecycle. It intentionally does not know how content
 * was produced, so text, JSON, ZIP, XLSX, or any future binary output can use
 * the same side-effect boundary.
 *
 * @param {string} fileName - Suggested browser download filename.
 * @param {Blob} blob - Blob payload to download.
 * @param {DownloadBlobOptions} [options] - Browser API seams and cleanup options.
 * @returns {DownloadDescriptor} Descriptor useful for tests and logging.
 */
export function downloadBlob(fileName, blob, options = {}) {
  const safeFileName = normalizeDownloadFileName(fileName);
  const documentRef = options.documentRef || globalThis.document;
  const urlRef = options.urlRef || globalThis.URL;

  if (!documentRef?.createElement) {
    throw new Error('document.createElement is not available in this environment.');
  }
  if (!urlRef?.createObjectURL || !urlRef?.revokeObjectURL) {
    throw new Error('URL.createObjectURL and URL.revokeObjectURL are required.');
  }

  const objectUrl = urlRef.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = objectUrl;
  link.download = safeFileName;
  link.rel = 'noopener';

  const shouldAppend = options.appendToDocument !== false && documentRef.body?.appendChild;
  if (shouldAppend) documentRef.body.appendChild(link);
  link.click();
  if (shouldAppend) link.remove?.();

  const revoke = () => urlRef.revokeObjectURL(objectUrl);
  const revokeDelayMs = Math.max(0, Number(options.revokeDelayMs || 0));
  if (revokeDelayMs > 0) {
    globalThis.setTimeout(revoke, revokeDelayMs);
  } else {
    revoke();
  }

  return Object.freeze({ fileName: safeFileName, objectUrl, revokeDelayMs });
}

/**
 * Normalizes a browser download filename without inventing app semantics.
 *
 * @param {string | null | undefined} fileName - Suggested filename.
 * @returns {string} Non-empty filename.
 */
export function normalizeDownloadFileName(fileName) {
  const value = String(fileName || '').trim();
  return value || 'download.txt';
}

