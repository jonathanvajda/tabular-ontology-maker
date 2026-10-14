/**
 * @file Runtime and RDF format normalization for vendor-backed adapters.
 */

const FORMAT_ALIASES = new Map([
  ['ttl', 'turtle'],
  ['turtle', 'turtle'],
  ['text/turtle', 'turtle'],
  ['n3', 'n3'],
  ['text/n3', 'n3'],
  ['trig', 'trig'],
  ['application/trig', 'trig'],
  ['nt', 'ntriples'],
  ['ntriples', 'ntriples'],
  ['n-triples', 'ntriples'],
  ['application/n-triples', 'ntriples'],
  ['text/plain', 'ntriples'],
  ['nq', 'nquads'],
  ['nquads', 'nquads'],
  ['n-quads', 'nquads'],
  ['application/n-quads', 'nquads'],
  ['jsonld', 'jsonld'],
  ['json-ld', 'jsonld'],
  ['application/ld+json', 'jsonld'],
  ['rdfxml', 'rdfxml'],
  ['rdf-xml', 'rdfxml'],
  ['rdf/xml', 'rdfxml'],
  ['application/rdf+xml', 'rdfxml'],
  ['xml', 'rdfxml']
]);

const MIME_BY_FORMAT = Object.freeze({
  turtle: 'text/turtle',
  n3: 'text/n3',
  trig: 'application/trig',
  ntriples: 'application/n-triples',
  nquads: 'application/n-quads',
  jsonld: 'application/ld+json',
  rdfxml: 'application/rdf+xml'
});

const N3_FORMAT_BY_FORMAT = Object.freeze({
  turtle: 'Turtle',
  n3: 'N3',
  trig: 'TriG',
  ntriples: 'N-Triples',
  nquads: 'N-Quads'
});

/**
 * Resolves vendor libraries from explicit options or browser globals.
 *
 * @param {object} [runtime] - Runtime overrides.
 * @returns {{N3?: object, jsonld?: object, $rdf?: object}} Runtime libraries.
 */
export function createRdfIoRuntime(runtime = {}) {
  return {
    N3: runtime.N3 || globalThis.N3,
    jsonld: runtime.jsonld || globalThis.jsonld,
    $rdf: runtime.$rdf || globalThis.$rdf
  };
}

/**
 * Normalizes supported RDF format ids and MIME aliases.
 *
 * @param {string} value - Format, MIME type, extension, or alias.
 * @returns {string} Normalized format id.
 */
export function normalizeRdfFormat(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return FORMAT_ALIASES.get(key) || key;
}

/**
 * Returns the preferred MIME type for a normalized RDF format.
 *
 * @param {string} format - Normalized RDF format.
 * @returns {string} Preferred MIME type.
 */
export function mimeTypeForRdfFormat(format) {
  return MIME_BY_FORMAT[normalizeRdfFormat(format)] || 'application/octet-stream';
}

/**
 * Returns the N3.js parser/writer format for supported N3-backed formats.
 *
 * @param {string} format - Normalized RDF format, MIME, or alias.
 * @returns {string|null} N3 format string.
 */
export function n3FormatForRdfFormat(format) {
  return N3_FORMAT_BY_FORMAT[normalizeRdfFormat(format)] || null;
}

export function adapterForRdfFormat(format) {
  const normalized = normalizeRdfFormat(format);
  if (N3_FORMAT_BY_FORMAT[normalized]) return 'n3';
  if (normalized === 'jsonld') return 'jsonld';
  if (normalized === 'rdfxml') return 'rdflib';
  return null;
}

