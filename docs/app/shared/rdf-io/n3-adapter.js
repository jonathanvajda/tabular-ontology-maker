import { createRdfDataset, datasetToQuads, normalizeQuad } from './rdf-model.js';
import { n3FormatForRdfFormat } from './runtime.js';

/**
 * Parses N3.js-supported RDF text into the canonical RDF/JS dataset result.
 *
 * @param {string} text - RDF text.
 * @param {object} options - Adapter options.
 * @param {string} options.format - Normalized RDF format or MIME alias.
 * @param {string} [options.baseIri] - Base IRI.
 * @param {object} options.runtime - Runtime containing `N3`.
 * @returns {{dataset: object, quads: object[], prefixes: object, warnings: object[]}} Parsed result.
 */
export function parseRdfTextWithN3(text, options = {}) {
  const N3 = requireN3Parser(options.runtime);
  const n3Format = n3FormatForRdfFormat(options.format);
  if (!n3Format) throw new TypeError(`N3 adapter does not support RDF format: ${options.format}`);

  const parser = new N3.Parser({
    format: n3Format,
    ...(options.baseIri ? { baseIRI: options.baseIri } : {})
  });
  const parsed = parser.parse(String(text ?? ''));
  const quads = Array.isArray(parsed) ? parsed.map(normalizeQuad) : [];
  const dataset = createN3StoreDataset(N3, quads);
  return {
    dataset,
    quads,
    prefixes: { ...(parser._prefixes || {}) },
    warnings: []
  };
}

/**
 * Serializes RDF/JS dataset-like input through N3.Writer.
 *
 * @param {unknown} dataset - RDF/JS dataset-like input.
 * @param {object} options - Adapter options.
 * @param {string} options.format - Normalized RDF format or MIME alias.
 * @param {Record<string, string>} [options.prefixes] - Prefix map.
 * @param {object} options.runtime - Runtime containing `N3`.
 * @returns {Promise<string>} Serialized RDF text.
 */
export function serializeRdfDatasetWithN3(dataset, options = {}) {
  const N3 = requireN3Writer(options.runtime);
  const n3Format = n3FormatForRdfFormat(options.format);
  if (!n3Format) throw new TypeError(`N3 adapter does not support RDF format: ${options.format}`);
  const writer = new N3.Writer({
    format: n3Format,
    prefixes: shouldUsePrefixes(options.format) ? options.prefixes || {} : undefined
  });
  writer.addQuads(datasetToQuads(dataset).map((item) => rdfJsQuadToN3Quad(item, N3.DataFactory)));
  return new Promise((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result || '');
    });
  });
}

function rdfJsQuadToN3Quad(item, dataFactory = {}) {
  if (typeof dataFactory.quad !== 'function') return item;
  return dataFactory.quad(
    rdfJsTermToN3Term(item.subject, dataFactory),
    rdfJsTermToN3Term(item.predicate, dataFactory),
    rdfJsTermToN3Term(item.object, dataFactory),
    rdfJsTermToN3Term(item.graph, dataFactory)
  );
}

function rdfJsTermToN3Term(term, dataFactory = {}) {
  if (typeof dataFactory.fromTerm === 'function') return dataFactory.fromTerm(term);
  if (!term || term.termType === 'DefaultGraph') return dataFactory.defaultGraph ? dataFactory.defaultGraph() : term;
  if (term.termType === 'NamedNode') return dataFactory.namedNode ? dataFactory.namedNode(term.value) : term;
  if (term.termType === 'BlankNode') return dataFactory.blankNode ? dataFactory.blankNode(term.value) : term;
  if (term.termType === 'Literal' && dataFactory.literal) {
    if (term.language) return dataFactory.literal(term.value, term.language);
    return dataFactory.literal(term.value, rdfJsTermToN3Term(term.datatype, dataFactory));
  }
  return term;
}

function createN3StoreDataset(N3, quads) {
  if (typeof N3.Store === 'function') {
    const store = new N3.Store();
    if (typeof store.addQuads === 'function') store.addQuads(quads);
    else quads.forEach((item) => store.addQuad(item));
    return store;
  }
  return createRdfDataset(quads);
}

function shouldUsePrefixes(format) {
  return ['turtle', 'trig', 'n3', 'text/turtle', 'application/trig', 'text/n3'].includes(String(format || '').toLowerCase());
}

function requireN3Parser(runtime = {}) {
  const N3 = runtime.N3;
  if (!N3?.Parser) throw new Error('N3 Parser runtime is not available.');
  return N3;
}

function requireN3Writer(runtime = {}) {
  const N3 = runtime.N3;
  if (!N3?.Writer) throw new Error('N3 Writer runtime is not available.');
  return N3;
}
