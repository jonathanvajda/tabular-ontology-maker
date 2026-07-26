import {
  SUPPORTED_MIME_DESCRIPTORS,
  getSupportedMimeTypeForFilename
} from './mime-registry.js';

/**
 * @file Browser-side file action helpers for format-aware apps.
 *
 * MIME detection and RDF parser format selection are pure package concerns.
 * Downloading a browser Blob and constructing file-picker accept attributes
 * are browser-bound adapters, so they live in this small module instead of a
 * global shim.
 */

/**
 * Downloads text content as a browser file.
 *
 * @param {string} fileName - Suggested download filename.
 * @param {string} text - File body.
 * @param {{mimeType?: string, charset?: string | false}} [options]
 * Download options.
 * @returns {void}
 */
export function downloadTextFile(fileName, text, options = {}) {
  const detected = getSupportedMimeTypeForFilename(fileName);
  const mimeType = options.mimeType || (detected.ok ? detected.value.mimeType : 'text/plain');
  const charset = options.charset === false || /;\s*charset=/i.test(mimeType)
    ? ''
    : `;charset=${options.charset || 'utf-8'}`;
  const blob = new Blob([text], { type: `${mimeType}${charset}` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Builds a comma-separated file input accept attribute from the registry.
 *
 * @param {string} [category] - Optional descriptor category such as `rdf`.
 * @returns {string} Accept attribute value such as `.ttl,.rdf`.
 */
export function getAcceptExtensions(category = '') {
  return Object.values(SUPPORTED_MIME_DESCRIPTORS)
    .filter((item) => !category || item.category === category)
    .flatMap((item) => item.extensions.map((extension) => `.${extension}`))
    .join(',');
}

/**
 * Guesses an RDF-ish MIME type from text content.
 *
 * @param {string} text - RDF source text.
 * @returns {string} MIME type guess.
 */
export function guessRdfMimeTypeFromText(text) {
  const content = String(text || '');
  if (/^\s*\{[\s\S]*"@context"\s*:/.test(content) || /^\s*\[[\s\S]*"@context"\s*:/.test(content)) {
    return 'application/ld+json';
  }
  if (/<rdf:RDF\b/.test(content)) return 'application/rdf+xml';
  if (/^\s*@prefix\b|@base\b|:\s/.test(content)) return 'text/turtle';
  if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(content)) return 'application/n-triples';
  return 'text/plain';
}
