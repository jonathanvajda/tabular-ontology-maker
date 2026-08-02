import { normalizeQuadRow } from './records.js';
import { StorageError } from './storage-error.js';

/**
 * Converts RDF/JS quads into canonical QuadRow records.
 *
 * @param {object[]} quads RDF/JS quads.
 * @param {object} [options]
 * @param {string|null} [options.projectId=null] Project id to attach.
 * @param {string|null} [options.graphId=null] Graph id to attach.
 * @param {string|null} [options.artifactId=null] Artifact id to attach.
 * @param {string|null} [options.graphIri] Override graph IRI for all rows.
 * @returns {object[]} Canonical QuadRows.
 */
export function convertRdfJsQuadsToQuadRows(quads, {
  projectId = null,
  graphId = null,
  artifactId = null,
  graphIri
} = {}) {
  return (quads || []).map((quad) => normalizeQuadRow({
    projectId,
    graphId,
    artifactId,
    subject: quad.subject,
    predicate: quad.predicate,
    object: quad.object,
    graph: graphIri !== undefined ? graphIri : quad.graph
  }));
}

/**
 * Converts canonical QuadRows into RDF/JS quads.
 *
 * @param {object[]} rows QuadRows.
 * @param {object} DataFactory RDF/JS DataFactory, such as `N3.DataFactory`.
 * @returns {object[]} RDF/JS quads.
 */
export function convertQuadRowsToRdfJsQuads(rows, DataFactory) {
  requireDataFactory(DataFactory);
  return (rows || []).map((row) => {
    const normalized = normalizeQuadRow(row);
    return DataFactory.quad(
      createTerm(DataFactory, normalized.subjectType, normalized.subject),
      createTerm(DataFactory, normalized.predicateType, normalized.predicate),
      createTerm(DataFactory, normalized.objectType, normalized.object, normalized.objectLang, normalized.objectDatatype),
      normalized.graph === null ? DataFactory.defaultGraph() : DataFactory.namedNode(normalized.graph)
    );
  });
}

/**
 * Creates an RDF/JS Store from QuadRows while preserving Axiolotl's Comunica
 * path: IndexedDB rows -> RDF/JS quads -> in-memory source.
 *
 * @param {object[]} rows QuadRows.
 * @param {Function} StoreConstructor RDF/JS Store constructor, such as `N3.Store`.
 * @param {object} DataFactory RDF/JS DataFactory.
 * @returns {object} RDF/JS Store instance.
 */
export function createRdfJsStoreFromQuadRows(rows, StoreConstructor, DataFactory) {
  if (typeof StoreConstructor !== 'function') {
    throw new StorageError('createRdfJsStoreFromQuadRows expected an RDF/JS Store constructor.', { code: 'INVALID_RDFJS_STORE' });
  }
  const store = new StoreConstructor();
  const quads = convertQuadRowsToRdfJsQuads(rows, DataFactory);
  if (typeof store.addQuads === 'function') {
    store.addQuads(quads);
  } else {
    for (const quad of quads) store.addQuad(quad);
  }
  return store;
}

function requireDataFactory(DataFactory) {
  const required = ['namedNode', 'blankNode', 'literal', 'defaultGraph', 'quad'];
  for (const name of required) {
    if (typeof DataFactory?.[name] !== 'function') {
      throw new StorageError(`RDF/JS DataFactory must provide ${name}().`, { code: 'INVALID_RDFJS_DATA_FACTORY' });
    }
  }
}

function createTerm(DataFactory, termType, value, language = '', datatype = '') {
  if (termType === 'BlankNode') return DataFactory.blankNode(String(value || '').replace(/^_:/, ''));
  if (termType === 'Literal') {
    if (language) return DataFactory.literal(value, language);
    if (datatype) return DataFactory.literal(value, DataFactory.namedNode(datatype));
    return DataFactory.literal(value);
  }
  return DataFactory.namedNode(value);
}
