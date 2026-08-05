import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';
import { createRdfDataset, datasetToQuads, defaultGraph, literal, namedNode, quad } from './rdf-model.js';

const RDF_XML_MIME = 'application/rdf+xml';

/**
 * Parses RDF/XML through rdflib and converts statements to RDF/JS quads.
 *
 * @param {string} text - RDF/XML text.
 * @param {object} options - Adapter options.
 * @param {string} [options.baseIri='urn:rdf-io:base'] - Base IRI.
 * @param {object} options.runtime - Runtime containing `$rdf`.
 * @returns {Promise<{dataset: object, quads: object[], prefixes: object, warnings: object[]}>} Parsed result.
 */
export async function parseRdfXmlTextToRdfDataset(text, options = {}) {
  const $rdf = requireRdflib(options.runtime);
  const graph = $rdf.graph();
  await new Promise((resolve, reject) => {
    try {
      $rdf.parse(String(text ?? ''), graph, options.baseIri || 'urn:rdf-io:base', RDF_XML_MIME, (error) => {
        if (error) reject(error);
        else resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  });
  const quads = [];
  for (const statement of graph.statements || []) {
    quads.push(quad(
      rdflibTermToRdfJs(statement.subject, quads),
      rdflibTermToRdfJs(statement.predicate, quads),
      rdflibTermToRdfJs(statement.object, quads),
      statement.graph ? rdflibTermToRdfJs(statement.graph, quads) : defaultGraph()
    ));
  }
  return {
    dataset: createRdfDataset(quads),
    quads,
    prefixes: {},
    warnings: []
  };
}

/**
 * Serializes RDF/JS dataset-like input to RDF/XML through rdflib.
 *
 * @param {unknown} dataset - RDF/JS dataset-like input.
 * @param {object} options - Adapter options.
 * @param {string} [options.baseIri='urn:rdf-io:base'] - Base IRI.
 * @param {Record<string, string>} [options.prefixes] - Prefix map applied when rdflib supports it.
 * @param {object} options.runtime - Runtime containing `$rdf`.
 * @returns {Promise<string>} RDF/XML text.
 */
export async function serializeRdfDatasetWithRdflib(dataset, options = {}) {
  const $rdf = requireRdflib(options.runtime);
  const graph = $rdf.graph();
  applyRdflibPrefixes(graph, options.prefixes || {});
  for (const item of datasetToQuads(dataset)) {
    const st = typeof $rdf.st === 'function'
      ? $rdf.st(rdfJsTermToRdflib(item.subject, $rdf), rdfJsTermToRdflib(item.predicate, $rdf), rdfJsTermToRdflib(item.object, $rdf))
      : {
          subject: rdfJsTermToRdflib(item.subject, $rdf),
          predicate: rdfJsTermToRdflib(item.predicate, $rdf),
          object: rdfJsTermToRdflib(item.object, $rdf)
        };
    if (typeof graph.add === 'function') graph.add(st.subject, st.predicate, st.object);
    else if (Array.isArray(graph.statements)) graph.statements.push(st);
  }
  return new Promise((resolve, reject) => {
    try {
      const result = $rdf.serialize(null, graph, options.baseIri || 'urn:rdf-io:base', RDF_XML_MIME, (error, value) => {
        if (error) reject(error);
        else resolve(value || '');
      });
      if (typeof result === 'string') resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

export function rdflibTermToRdfJs(term, targetQuads = []) {
  if (!term) throw new TypeError('rdflib term is required.');
  if (term.termType === 'NamedNode' || term.termType === 'symbol') return namedNode(term.value || term.uri);
  if (term.termType === 'BlankNode' || term.termType === 'bnode') return { termType: 'BlankNode', value: String(term.value || term.id || '').replace(/^_:/, '') };
  if (term.termType === 'Literal' || term.termType === 'literal') {
    return literal(term.value, {
      language: term.language || '',
      datatype: term.datatype?.value || term.datatype?.uri || undefined
    });
  }
  if (term.termType === 'DefaultGraph') return defaultGraph();
  if (term.termType === 'Collection') return rdflibCollectionToRdfList(term, targetQuads);
  throw new TypeError(`Unsupported rdflib term type: ${term.termType}`);
}

function rdflibCollectionToRdfList(term, targetQuads) {
  const items = Array.isArray(term.elements) ? term.elements : [];
  if (!items.length) return namedNode(COMMON_NAMESPACE_IRIS.rdf.nil);
  const nodes = items.map((_item, index) => ({
    termType: 'BlankNode',
    value: index === 0 && term.value ? String(term.value).replace(/^_:/, '') : `list${targetQuads.length}_${index}`
  }));
  items.forEach((item, index) => {
    targetQuads.push(quad(nodes[index], COMMON_NAMESPACE_IRIS.rdf.first, rdflibTermToRdfJs(item, targetQuads)));
    targetQuads.push(quad(
      nodes[index],
      COMMON_NAMESPACE_IRIS.rdf.rest,
      index === items.length - 1 ? namedNode(COMMON_NAMESPACE_IRIS.rdf.nil) : nodes[index + 1]
    ));
  });
  return nodes[0];
}

export function rdfJsTermToRdflib(term, $rdf) {
  if (term.termType === 'NamedNode') return $rdf.sym ? $rdf.sym(term.value) : { termType: 'NamedNode', value: term.value };
  if (term.termType === 'BlankNode') return $rdf.blankNode ? $rdf.blankNode(term.value) : { termType: 'BlankNode', value: term.value };
  if (term.termType === 'Literal') {
    const datatype = term.datatype?.value && $rdf.sym ? $rdf.sym(term.datatype.value) : term.datatype;
    return $rdf.literal ? $rdf.literal(term.value, term.language || undefined, datatype) : term;
  }
  return null;
}

function applyRdflibPrefixes(graph, prefixes) {
  if (!graph || typeof graph.setPrefixForURI !== 'function') return;
  for (const [prefix, iri] of Object.entries(prefixes || {})) {
    graph.setPrefixForURI(prefix, iri);
  }
}

function requireRdflib(runtime = {}) {
  const $rdf = runtime.$rdf;
  if (!$rdf?.graph || !$rdf?.parse || !$rdf?.serialize) throw new Error('rdflib runtime library is not available.');
  return $rdf;
}
