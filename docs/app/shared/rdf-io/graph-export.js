import { serializeRdfDatasetWithAdapters } from './serialize-rdf.js';
import { normalizeRdfFormat } from './runtime.js';

export const RDF_GRAPH_EXPORT_MIME_TYPES = Object.freeze([
  'text/turtle',
  'application/n-triples',
  'application/n-quads',
  'application/trig',
  'application/rdf+xml',
  'application/ld+json'
]);

/**
 * Selects quads for a graph export scope.
 *
 * This pure helper supports common browser-app export workflows where users
 * need only default graph triples, only named graph quads, or the whole dataset.
 *
 * @param {object} dataset - RDF/JS dataset-like object with `getQuads()`.
 * @param {object} [options] - Selection options.
 * @param {'default'|'named'|'all'} [options.scope='all'] - Graph export scope.
 * @param {object} [options.defaultGraphTerm] - Runtime default graph term.
 * @returns {object[]} Selected RDF/JS quads.
 */
export function selectRdfGraphExportQuads(dataset, options = {}) {
  if (!dataset || typeof dataset.getQuads !== 'function') {
    throw new TypeError('selectRdfGraphExportQuads expected an RDF/JS dataset with getQuads().');
  }

  const scope = options.scope || 'all';
  if (scope === 'all') return dataset.getQuads(null, null, null, null);
  if (scope === 'named') {
    return dataset.getQuads(null, null, null, null)
      .filter((item) => item.graph?.termType !== 'DefaultGraph');
  }
  if (scope === 'default') {
    return dataset.getQuads(null, null, null, options.defaultGraphTerm || { termType: 'DefaultGraph', value: '' });
  }

  throw new TypeError(`Unsupported RDF graph export scope: ${scope}`);
}

/**
 * Creates a dataset/store for a graph export scope.
 *
 * @param {object} dataset - RDF/JS dataset-like object with `getQuads()`.
 * @param {object} [options] - Export dataset options.
 * @param {'default'|'named'|'all'} [options.scope='all'] - Graph export scope.
 * @param {object} [options.runtime] - Runtime containing `N3.Store` when a new store is needed.
 * @returns {object} Dataset-like object for serialization.
 */
export function createRdfGraphExportDataset(dataset, options = {}) {
  const scope = options.scope || 'all';
  const shouldFlatten = shouldFlattenGraphNamesForRdfGraphExport(options);
  if (scope === 'all' && !shouldFlatten) return dataset;

  const N3 = options.runtime?.N3;
  if (!N3?.Store) throw new Error('N3 Store runtime is not available for scoped RDF graph export.');

  const selected = selectRdfGraphExportQuads(dataset, {
    scope,
    defaultGraphTerm: N3.DataFactory?.defaultGraph ? N3.DataFactory.defaultGraph() : undefined
  });
  const scoped = new N3.Store();
  scoped.addQuads(shouldFlatten ? flattenRdfQuadsToDefaultGraph(selected, N3.DataFactory) : selected);
  return scoped;
}

/**
 * Serializes an RDF graph export scope through the adapter layer.
 *
 * @param {object} dataset - RDF/JS dataset-like object with `getQuads()`.
 * @param {object} [options] - Serialization options.
 * @param {'default'|'named'|'all'} [options.scope='all'] - Graph export scope.
 * @param {string} [options.format] - RDF format, MIME type, or extension.
 * @param {string} [options.mimeType] - RDF MIME type alias for `format`.
 * @param {object} [options.runtime] - Runtime containing N3/jsonld/rdflib libraries.
 * @returns {Promise<{text: string, count: number, format: string, mimeType: string, warnings: object[]}>} Serialized graph export.
 */
export async function serializeRdfGraphExport(dataset, options = {}) {
  const scoped = createRdfGraphExportDataset(dataset, options);
  const count = scoped.getQuads(null, null, null, null).length;
  const serialized = await serializeRdfDatasetWithAdapters(scoped, {
    ...options,
    format: options.format || options.mimeType || 'application/n-quads'
  });

  assertNonEmptyRdfGraphExport(serialized.text, {
    count,
    mimeType: serialized.mimeType
  });

  return {
    ...serialized,
    count
  };
}

/**
 * Fails when a serializer returns no bytes for a non-empty graph selection.
 *
 * @param {string} text - Serialized RDF text.
 * @param {object} options - Validation options.
 * @param {number} options.count - Selected triple/quad count.
 * @param {string} options.mimeType - Output MIME type.
 * @returns {void}
 */
export function assertNonEmptyRdfGraphExport(text, { count, mimeType }) {
  if (count > 0 && !String(text || '').trim()) {
    throw new Error(`Serializer returned empty ${mimeType} output for ${count} triple${count === 1 ? '' : 's'}.`);
  }
}

/**
 * Flattens RDF quads to default graph triples for syntaxes such as Turtle and
 * N-Triples, which cannot preserve graph names.
 *
 * @param {object[]} quads - RDF/JS quads.
 * @param {object} [dataFactory] - RDF/JS/N3 data factory.
 * @returns {object[]} Quads with default graph terms.
 */
export function flattenRdfQuadsToDefaultGraph(quads, dataFactory = {}) {
  const makeQuad = dataFactory.quad || ((subject, predicate, object, graph) => ({ subject, predicate, object, graph }));
  const defaultGraph = dataFactory.defaultGraph
    ? dataFactory.defaultGraph()
    : { termType: 'DefaultGraph', value: '' };

  return (quads || []).map((item) => makeQuad(item.subject, item.predicate, item.object, defaultGraph));
}

/**
 * Detects whether graph names should be flattened for an RDF graph export.
 *
 * @param {object} [options] - Export options.
 * @param {string} [options.format] - RDF format, MIME, or alias.
 * @param {string} [options.mimeType] - RDF MIME alias.
 * @param {boolean} [options.flattenGraphNames] - Explicit override.
 * @returns {boolean} True when graph names should be dropped before serialization.
 */
export function shouldFlattenGraphNamesForRdfGraphExport(options = {}) {
  if (typeof options.flattenGraphNames === 'boolean') return options.flattenGraphNames;
  const format = normalizeRdfFormat(options.format || options.mimeType || '');
  return format === 'turtle' || format === 'ntriples' || format === 'rdfxml';
}

/**
 * Reports whether a MIME type is part of the promoted RDF graph export set.
 *
 * @param {string} mimeType - MIME type selected by an export UI.
 * @returns {boolean} True when the MIME type is supported.
 */
export function isSupportedRdfGraphExportMimeType(mimeType) {
  return RDF_GRAPH_EXPORT_MIME_TYPES.includes(String(mimeType || '').trim());
}

/**
 * Reports whether the selected RDF export format preserves graph names or
 * flattens quads to default-graph triples.
 *
 * @param {string} mimeType - MIME type selected by an export UI.
 * @returns {'quads'|'triples'} Export graph shape.
 * @throws {TypeError} When the MIME type is not in the promoted RDF export set.
 */
export function getRdfGraphExportGraphShape(mimeType) {
  const text = String(mimeType || '').trim();
  if (!isSupportedRdfGraphExportMimeType(text)) {
    throw new TypeError(`Unsupported RDF graph export MIME type: ${mimeType}`);
  }
  return shouldFlattenGraphNamesForRdfGraphExport({ mimeType: text }) ? 'triples' : 'quads';
}
