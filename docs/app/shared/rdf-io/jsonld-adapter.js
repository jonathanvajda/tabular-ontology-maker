import { parseRdfTextWithN3 } from './n3-adapter.js';
import { serializeRdfDatasetToNQuads } from './serialize-rdf.js';

/**
 * Parses JSON-LD text into RDF/JS quads through jsonld.js and N-Quads.
 *
 * @param {string} text - JSON-LD text.
 * @param {object} options - Adapter options.
 * @param {string} [options.baseIri] - Base IRI.
 * @param {object} options.runtime - Runtime containing `jsonld` and `N3`.
 * @returns {Promise<{dataset: object, quads: object[], prefixes: object, warnings: object[]}>} Parsed result.
 */
export async function parseJsonLdTextToRdfDataset(text, options = {}) {
  const jsonld = requireJsonLdParser(options.runtime);
  let doc;
  try {
    doc = JSON.parse(String(text ?? ''));
  } catch (error) {
    error.code = 'invalid-json';
    throw error;
  }
  const nquads = await jsonld.toRDF(doc, {
    format: 'application/n-quads',
    ...(options.baseIri ? { base: options.baseIri } : {})
  });
  return parseRdfTextWithN3(nquads, {
    ...options,
    format: 'nquads'
  });
}

/**
 * Serializes RDF/JS dataset-like input to JSON-LD through jsonld.js.
 *
 * @param {unknown} dataset - RDF/JS dataset-like input.
 * @param {object} options - Adapter options.
 * @param {object} [options.context] - Optional context for compaction.
 * @param {object} options.runtime - Runtime containing `jsonld`.
 * @returns {Promise<string>} JSON-LD text.
 */
export async function serializeRdfDatasetWithJsonLd(dataset, options = {}) {
  const jsonld = requireJsonLdSerializer(options.runtime);
  const nquads = serializeRdfDatasetToNQuads(dataset);
  const expanded = await jsonld.fromRDF(nquads, { format: 'application/n-quads' });
  const doc = options.context && typeof jsonld.compact === 'function'
    ? await jsonld.compact(expanded, options.context)
    : { '@graph': expanded };
  return JSON.stringify(doc, null, options.pretty === false ? 0 : 2);
}

function requireJsonLdParser(runtime = {}) {
  const jsonld = runtime.jsonld;
  if (!jsonld?.toRDF) throw new Error('JSON-LD parser runtime library is not available.');
  return jsonld;
}

function requireJsonLdSerializer(runtime = {}) {
  const jsonld = runtime.jsonld;
  if (!jsonld?.fromRDF) throw new Error('JSON-LD serializer runtime library is not available.');
  return jsonld;
}
