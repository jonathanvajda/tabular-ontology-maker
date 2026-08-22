import { normalizeSupportedMimeType } from './mime-registry.js';

/**
 * Detects the most likely supported MIME descriptor for RDF source text.
 *
 * This is a lightweight, deterministic content sniffing helper. It does not
 * parse RDF and must not be treated as validation. Parser packages remain
 * responsible for confirming that a payload is syntactically valid.
 *
 * @param {string | null | undefined} text - RDF or plain text source.
 * @returns {import('./mime-registry.js').MimeDescriptorResult} Supported MIME
 * descriptor. Plain text is returned when no RDF-specific signal is found.
 */
export function detectRdfMimeTypeFromText(text) {
  const content = String(text || '');
  if (/^\s*\{[\s\S]*"@context"\s*:/.test(content) || /^\s*\[[\s\S]*"@context"\s*:/.test(content)) {
    return normalizeSupportedMimeType('application/ld+json');
  }
  if (/<rdf:RDF\b/.test(content)) return normalizeSupportedMimeType('application/rdf+xml');
  if (/^\s*@prefix\b|^\s*@base\b|^\s*PREFIX\s+/i.test(content)) return normalizeSupportedMimeType('text/turtle');
  if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(content)) return normalizeSupportedMimeType('application/n-triples');
  return normalizeSupportedMimeType('text/plain');
}
