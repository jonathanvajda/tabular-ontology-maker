/**
 * @file Small RDF/JS-compatible data model helpers.
 *
 * These helpers intentionally cover only the portable RDF/JS term shape used
 * across the apps. Parser and serializer adapters may wrap N3 or rdflib terms,
 * but promoted package functions should exchange this simpler model at their
 * boundaries.
 */

import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';

let blankNodeCounter = 0;

/**
 * Creates an RDF/JS named node.
 *
 * @param {string} value - Absolute IRI value.
 * @returns {{termType: 'NamedNode', value: string}} RDF/JS named node.
 */
export function namedNode(value) {
  const iri = String(value ?? '').trim();
  if (!iri) throw new TypeError('Named node IRI must be a non-empty string.');
  return { termType: 'NamedNode', value: iri };
}

/**
 * Creates an RDF/JS blank node.
 *
 * @param {string} [value] - Blank node identifier without `_:` prefix.
 * @returns {{termType: 'BlankNode', value: string}} RDF/JS blank node.
 */
export function blankNode(value = createBlankNodeId()) {
  const id = String(value ?? '').replace(/^_:/, '').trim();
  if (!id) throw new TypeError('Blank node identifier must be a non-empty string.');
  return { termType: 'BlankNode', value: id };
}

function createBlankNodeId() {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    cryptoRef.getRandomValues(bytes);
    return `b${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  blankNodeCounter += 1;
  return `b${blankNodeCounter}`;
}

/**
 * Creates an RDF/JS literal.
 *
 * @param {unknown} value - Literal lexical value.
 * @param {object|string} [options] - Literal options or datatype IRI string.
 * @param {string} [options.language] - BCP47 language tag.
 * @param {string} [options.datatype] - Datatype IRI.
 * @returns {{termType: 'Literal', value: string, language: string, datatype: object}} RDF/JS literal.
 */
export function literal(value, options = {}) {
  const opts = typeof options === 'string' ? { datatype: options } : options || {};
  const language = opts.language ? String(opts.language) : '';
  const datatype = language
    ? COMMON_NAMESPACE_IRIS.rdf.langString
    : (opts.datatype || COMMON_NAMESPACE_IRIS.xsd.string);
  return {
    termType: 'Literal',
    value: value == null ? '' : String(value),
    language,
    datatype: namedNode(datatype)
  };
}

/**
 * Creates an RDF/JS default graph term.
 *
 * @returns {{termType: 'DefaultGraph', value: ''}} RDF/JS default graph.
 */
export function defaultGraph() {
  return { termType: 'DefaultGraph', value: '' };
}

/**
 * Creates an RDF/JS quad.
 *
 * @param {object|string} subject - Subject term or IRI.
 * @param {object|string} predicate - Predicate term or IRI.
 * @param {object|string|number|boolean} object - Object term or literal value.
 * @param {object|string} [graph] - Graph term or graph IRI.
 * @returns {{subject: object, predicate: object, object: object, graph: object}} RDF/JS quad.
 */
export function quad(subject, predicate, object, graph = defaultGraph()) {
  return {
    subject: normalizeSubjectTerm(subject),
    predicate: normalizeNamedNodeTerm(predicate, 'Predicate'),
    object: normalizeObjectTerm(object),
    graph: normalizeGraphTerm(graph)
  };
}

/**
 * Converts a dataset-like value or quad iterable into a quad array.
 *
 * @param {unknown} dataset - RDF/JS dataset-like value, N3 Store-like value, or iterable quads.
 * @returns {object[]} Normalized RDF/JS quads.
 */
export function datasetToQuads(dataset) {
  if (!dataset) return [];
  if (Array.isArray(dataset)) return dataset.map(normalizeQuad);
  if (typeof dataset.getQuads === 'function') return dataset.getQuads(null, null, null, null).map(normalizeQuad);
  if (typeof dataset.match === 'function') {
    const matched = dataset.match(null, null, null, null);
    if (Array.isArray(matched)) return matched.map(normalizeQuad);
    if (matched && typeof matched[Symbol.iterator] === 'function') return Array.from(matched, normalizeQuad);
  }
  if (typeof dataset[Symbol.iterator] === 'function') return Array.from(dataset, normalizeQuad);
  throw new TypeError('RDF dataset must be an array, iterable, or dataset-like object.');
}

/**
 * Creates a small dataset-like object for tests and app adapters.
 *
 * @param {object[]} [quads] - Initial quads.
 * @returns {{add: Function, getQuads: Function, match: Function, size: number, [Symbol.iterator]: Function}} Dataset-like object.
 */
export function createRdfDataset(quads = []) {
  const items = quads.map(normalizeQuad);
  return {
    add(nextQuad) {
      items.push(normalizeQuad(nextQuad));
      this.size = items.length;
      return this;
    },
    getQuads(subject = null, predicate = null, object = null, graph = null) {
      return filterQuads(items, subject, predicate, object, graph);
    },
    match(subject = null, predicate = null, object = null, graph = null) {
      return createRdfDataset(filterQuads(items, subject, predicate, object, graph));
    },
    get size() {
      return items.length;
    },
    set size(_value) {},
    [Symbol.iterator]() {
      return items[Symbol.iterator]();
    }
  };
}

export function normalizeQuad(value) {
  if (!value || typeof value !== 'object') throw new TypeError('RDF quad must be an object.');
  return quad(value.subject, value.predicate, value.object, value.graph || defaultGraph());
}

export function normalizeObjectTerm(value) {
  if (isRdfTerm(value)) return normalizeTerm(value);
  return literal(value);
}

export function normalizeSubjectTerm(value) {
  if (isRdfTerm(value)) {
    const term = normalizeTerm(value);
    if (term.termType !== 'NamedNode' && term.termType !== 'BlankNode') {
      throw new TypeError('Subject term must be a named node or blank node.');
    }
    return term;
  }
  const text = String(value ?? '').trim();
  return text.startsWith('_:') ? blankNode(text) : namedNode(text);
}

export function normalizeGraphTerm(value) {
  if (!value || value.termType === 'DefaultGraph') return defaultGraph();
  if (isRdfTerm(value)) {
    const term = normalizeTerm(value);
    if (term.termType !== 'NamedNode' && term.termType !== 'BlankNode') {
      throw new TypeError('Graph term must be a named node, blank node, or default graph.');
    }
    return term;
  }
  return namedNode(value);
}

function normalizeNamedNodeTerm(value, label) {
  if (isRdfTerm(value)) {
    const term = normalizeTerm(value);
    if (term.termType !== 'NamedNode') throw new TypeError(`${label} term must be a named node.`);
    return term;
  }
  return namedNode(value);
}

function normalizeTerm(term) {
  if (term.termType === 'Literal') {
    return literal(term.value, {
      language: term.language || '',
      datatype: term.datatype?.value || term.datatype || COMMON_NAMESPACE_IRIS.xsd.string
    });
  }
  if (term.termType === 'NamedNode') return namedNode(term.value);
  if (term.termType === 'BlankNode') return blankNode(term.value);
  if (term.termType === 'DefaultGraph') return defaultGraph();
  throw new TypeError(`Unsupported RDF term type: ${term.termType}`);
}

function isRdfTerm(value) {
  return Boolean(value && typeof value === 'object' && typeof value.termType === 'string');
}

function filterQuads(quads, subject, predicate, object, graph) {
  return quads.filter((item) =>
    matchesTerm(item.subject, subject) &&
    matchesTerm(item.predicate, predicate) &&
    matchesTerm(item.object, object) &&
    matchesTerm(item.graph, graph)
  );
}

function matchesTerm(actual, expected) {
  if (expected == null) return true;
  const normalized = expected.termType ? expected : normalizeObjectTerm(expected);
  return actual.termType === normalized.termType && actual.value === normalized.value;
}
