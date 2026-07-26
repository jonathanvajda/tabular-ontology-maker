import { normalizeSupportedMimeType } from './mime-registry.js';

/**
 * @file RDF parser/serializer adapter helpers.
 *
 * These functions deliberately sit beside the generic MIME registry instead of
 * inside it. MIME detection should not imply that a specific RDF vendor library
 * can parse or serialize the format.
 */

const N3_FORMAT_BY_MIME = Object.freeze({
  'text/turtle': 'Turtle',
  'application/n-triples': 'N-Triples',
  'application/n-quads': 'N-Quads',
  'application/trig': 'TriG',
  'text/n3': 'N3'
});

/**
 * @typedef {Readonly<{
 *   parserAdapter: 'n3'|'jsonld'|'rdflib',
 *   serializerAdapter: 'n3'|'jsonld'|'rdflib',
 *   preservesNamedGraphs: boolean
 * }>} RdfAdapterDescriptor
 */

const RDF_ADAPTER_BY_MIME = Object.freeze({
  'text/turtle': Object.freeze({
    parserAdapter: 'n3',
    serializerAdapter: 'n3',
    preservesNamedGraphs: false
  }),
  'application/n-triples': Object.freeze({
    parserAdapter: 'n3',
    serializerAdapter: 'n3',
    preservesNamedGraphs: false
  }),
  'application/n-quads': Object.freeze({
    parserAdapter: 'n3',
    serializerAdapter: 'n3',
    preservesNamedGraphs: true
  }),
  'application/trig': Object.freeze({
    parserAdapter: 'n3',
    serializerAdapter: 'n3',
    preservesNamedGraphs: true
  }),
  'text/n3': Object.freeze({
    parserAdapter: 'n3',
    serializerAdapter: 'n3',
    preservesNamedGraphs: false
  }),
  'application/ld+json': Object.freeze({
    parserAdapter: 'jsonld',
    serializerAdapter: 'jsonld',
    preservesNamedGraphs: true
  }),
  'application/rdf+xml': Object.freeze({
    parserAdapter: 'rdflib',
    serializerAdapter: 'rdflib',
    preservesNamedGraphs: false
  })
});

/**
 * Resolves the N3.js parser/writer format for a supported RDF MIME type.
 *
 * JSON-LD and RDF/XML are supported RDF file types in the registry, but they
 * require different adapters and therefore return an unsupported-parser result.
 *
 * @param {string | null | undefined} mimeType - MIME type, descriptor id, or alias.
 * @returns {Readonly<{ok: true, value: string}> | Readonly<{ok: false, error: 'unknown filetype' | 'unsupported parser format', input: string}>}
 */
export function getN3ParserFormatForMimeType(mimeType) {
  const result = normalizeSupportedMimeType(mimeType);
  if (!result.ok) return result;

  const value = N3_FORMAT_BY_MIME[result.value.mimeType];
  return value
    ? Object.freeze({ ok: true, value })
    : Object.freeze({ ok: false, error: 'unsupported parser format', input: result.value.mimeType });
}

/**
 * Returns whether the MIME type can be handled directly by N3.js.
 *
 * @param {string | null | undefined} mimeType - MIME type, descriptor id, or alias.
 * @returns {boolean}
 */
export function isN3ParserSupportedMimeType(mimeType) {
  return getN3ParserFormatForMimeType(mimeType).ok;
}

/**
 * Resolves RDF parser/serializer adapter metadata for a supported RDF MIME.
 *
 * This preserves the useful part of the legacy `rdf-formats.js` file without
 * keeping a second MIME registry. The generic MIME registry remains the source
 * of truth for extensions, aliases, labels, and categories.
 *
 * @param {string | null | undefined} mimeType - MIME type, descriptor id, or alias.
 * @returns {Readonly<{ok: true, value: RdfAdapterDescriptor}> | Readonly<{ok: false, error: 'unknown filetype' | 'unsupported rdf format', input: string}>}
 */
export function getRdfAdapterDescriptorForMimeType(mimeType) {
  const result = normalizeSupportedMimeType(mimeType);
  if (!result.ok) return result;
  if (result.value.category !== 'rdf') {
    return Object.freeze({ ok: false, error: 'unsupported rdf format', input: result.value.mimeType });
  }

  const descriptor = RDF_ADAPTER_BY_MIME[result.value.mimeType];
  return descriptor
    ? Object.freeze({ ok: true, value: descriptor })
    : Object.freeze({ ok: false, error: 'unsupported rdf format', input: result.value.mimeType });
}

/**
 * Returns whether an RDF serialization can preserve named graphs.
 *
 * @param {string | null | undefined} mimeType - MIME type, descriptor id, or alias.
 * @returns {boolean}
 */
export function rdfSerializationPreservesNamedGraphs(mimeType) {
  const result = getRdfAdapterDescriptorForMimeType(mimeType);
  return result.ok ? result.value.preservesNamedGraphs : false;
}
