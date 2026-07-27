import { createTextBlob } from './create-text-blob.js';
import { downloadBlob } from './download-blob.js';

/**
 * @typedef {import('./create-text-blob.js').TextBlobOptions & import('./download-blob.js').DownloadBlobOptions} DownloadTextFileOptions
 */

/**
 * Downloads text content as a browser file.
 *
 * This composes the pure-ish text Blob creation step with the browser download
 * side-effect adapter. Callers that already have a Blob should use
 * `downloadBlob`; callers that need RDF/tabular/report serialization should do
 * that serialization before calling this function.
 *
 * @param {string} fileName - Suggested browser download filename.
 * @param {unknown} text - Text content to stringify and download.
 * @param {DownloadTextFileOptions} [options] - MIME, charset, and browser API options.
 * @returns {import('./download-blob.js').DownloadDescriptor} Download descriptor.
 */
export function downloadTextFile(fileName, text, options = {}) {
  const blob = createTextBlob(text, options);
  return downloadBlob(fileName, blob, options);
}

