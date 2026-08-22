import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/namespace-registry.js';
import {
  compactIriToCurie,
  findLongestPrefixMatch
} from '../namespace-registry/curie.js';
import { isBlankNodeTerm } from '../ontology-utils/index.js';

const DEFAULT_ANNOTATION_PREDICATE_IRIS = Object.freeze([
  COMMON_NAMESPACE_IRIS.rdfs.label,
  COMMON_NAMESPACE_IRIS.rdfs.comment,
  COMMON_NAMESPACE_IRIS.dcterms.title,
  COMMON_NAMESPACE_IRIS.dc.title,
  COMMON_NAMESPACE_IRIS.skos.prefLabel,
  COMMON_NAMESPACE_IRIS.skos.altLabel,
  COMMON_NAMESPACE_IRIS.skos.definition
]);

/**
 * Parses SPARQL query text into a SPARQL.js AST using an explicitly injected
 * SPARQL.js parser runtime.
 *
 * @param {string} queryText - SPARQL query text.
 * @param {{Parser?: Function, sparqljs?: {Parser?: Function}, runtime?: {sparqljs?: {Parser?: Function}}, skipValidation?: boolean}} [options] - Parser/runtime options.
 * @returns {any} SPARQL.js AST.
 * @throws {Error} When no SPARQL.js parser is available or parsing fails.
 */
export function parseSparqlQueryToAst(queryText, options = {}) {
  const Parser = options.Parser || options.sparqljs?.Parser || options.runtime?.sparqljs?.Parser;
  if (!Parser) {
    throw new Error('SPARQL.js Parser not found. Provide options.Parser or load a SPARQL.js runtime.');
  }
  const parser = new Parser({ skipValidation: Boolean(options.skipValidation) });
  return parser.parse(String(queryText ?? ''));
}

/**
 * Creates a stable key for an RDF/JS term in SPARQL graph models.
 *
 * @param {{termType?: string, value?: string, language?: string, datatype?: {value?: string}}} term - RDF/JS term.
 * @returns {string} Stable graph node key.
 */
export function createSparqlAstTermKey(term) {
  if (!term || typeof term !== 'object') return 'term:unknown';
  if (term.termType === 'Variable') return `var:?${term.value}`;
  if (isBlankNodeTerm(term)) return `bnode:${term.value}`;
  if (term.termType === 'NamedNode') return `iri:${term.value}`;
  if (term.termType === 'Literal') {
    const datatype = term.datatype?.value ?? '';
    const language = term.language ?? '';
    return `lit:${term.value}|${language}|${datatype}`;
  }
  return `term:${term.termType}:${term.value}`;
}

/**
 * Chooses the longest matching prefix for an IRI.
 *
 * @param {string} iri - Absolute IRI.
 * @param {Record<string, string>} prefixes - Prefix map.
 * @returns {{prefix: string, namespace: string}|null} Best prefix match.
 */
export function selectBestSparqlAstPrefixForIri(iri, prefixes) {
  const match = findLongestPrefixMatch(iri, prefixes);
  return match.ok ? { prefix: match.prefix, namespace: match.namespaceIri } : null;
}

/**
 * Compacts an IRI for SPARQL graph-model display.
 *
 * @param {string} iri - IRI to compact.
 * @param {Record<string, string>} prefixes - Prefix map.
 * @returns {string} CURIE-like label or original IRI.
 */
export function compactSparqlAstIriForDisplay(iri, prefixes) {
  const compacted = compactIriToCurie(iri, prefixes);
  if (compacted.ok) return compacted.value;

  const best = selectBestSparqlAstPrefixForIri(iri, prefixes);
  if (!best) return iri;
  const local = String(iri || '').slice(best.namespace.length);
  const prefix = best.prefix === '' ? ':' : `${best.prefix}:`;
  return `${prefix}${local}`;
}

/**
 * Formats an RDF/JS term label for SPARQL graph-model display.
 *
 * @param {{termType?: string, value?: string, language?: string, datatype?: {value?: string}}} term - RDF/JS term.
 * @param {Record<string, string>} prefixes - Prefix map.
 * @returns {string} Human-readable term label.
 */
export function formatSparqlAstTermLabel(term, prefixes = {}) {
  if (!term || typeof term !== 'object') return '<?>';

  if (term.termType === 'Variable') return `?${term.value}`;
  if (isBlankNodeTerm(term)) return `_:${term.value}`;
  if (term.termType === 'NamedNode') return compactSparqlAstIriForDisplay(term.value, prefixes);

  if (term.termType === 'Literal') {
    const language = term.language ? `@${term.language}` : '';
    const datatype = term.datatype?.value ? `^^${compactSparqlAstIriForDisplay(term.datatype.value, prefixes)}` : '';
    return `"${term.value}"${language}${datatype}`;
  }

  return term.value ?? '<?>';
}

/**
 * Extracts selected variable keys from a SPARQL.js SELECT AST.
 *
 * @param {any} ast - SPARQL.js AST.
 * @returns {Set<string>} Variable keys such as `var:?x`.
 */
export function extractSelectedVariableKeysFromSparqlAst(ast) {
  const out = new Set();
  if (!ast || ast.queryType !== 'SELECT') return out;
  if (ast.variables === '*' || !Array.isArray(ast.variables)) return out;

  for (const variable of ast.variables) {
    if (variable?.termType === 'Variable') out.add(`var:?${variable.value}`);
  }
  return out;
}

/**
 * Extracts WHERE triple patterns from recursive SPARQL.js pattern arrays.
 *
 * @param {any[]} wherePatterns - SPARQL.js `where` array or nested pattern array.
 * @returns {any[]} Flat triple-pattern array.
 */
export function extractWhereTriplesFromSparqlAst(wherePatterns) {
  const triples = [];
  const patterns = Array.isArray(wherePatterns) ? wherePatterns : [];

  for (const pattern of patterns) {
    if (!pattern || typeof pattern !== 'object') continue;
    if (pattern.type === 'bgp' && Array.isArray(pattern.triples)) {
      triples.push(...pattern.triples);
      continue;
    }
    if (Array.isArray(pattern.patterns)) {
      if (pattern.type === 'union') {
        for (const branch of pattern.patterns) triples.push(...extractWhereTriplesFromSparqlAst(branch));
      } else {
        triples.push(...extractWhereTriplesFromSparqlAst(pattern.patterns));
      }
    }
  }

  return triples;
}

/**
 * Classifies a SPARQL triple-pattern edge for graph visualization.
 *
 * @param {any} predicateTerm - SPARQL.js predicate term or path object.
 * @param {any} objectTerm - SPARQL.js object term.
 * @param {{annotationPredicateIris?: Iterable<string>}} [options] - Optional annotation predicate IRI set.
 * @returns {'rdfType'|'objectProp'|'datatypeProp'|'annotationProp'|'path'} Edge category.
 */
export function classifySparqlTriplePatternEdge(predicateTerm, objectTerm, options = {}) {
  const annotationPredicateIris = new Set(options.annotationPredicateIris || DEFAULT_ANNOTATION_PREDICATE_IRIS);
  const predicateIri = predicateTerm?.termType === 'NamedNode' ? predicateTerm.value : null;

  if (predicateIri === COMMON_NAMESPACE_IRIS.rdf.type) return 'rdfType';
  if (predicateTerm && predicateTerm.termType == null && typeof predicateTerm === 'object') return 'path';
  if (objectTerm?.termType === 'Literal') {
    if (predicateIri && annotationPredicateIris.has(predicateIri)) return 'annotationProp';
    return 'datatypeProp';
  }
  return 'objectProp';
}

/**
 * Applies rdf:type heuristics to graph model nodes.
 *
 * @param {Map<string, any>} nodesById - Graph nodes keyed by ID.
 * @param {Array<{category: string, source: string, target: string}>} edges - Graph edges.
 */
export function applySparqlTypeHeuristicsToGraphNodes(nodesById, edges) {
  for (const edge of edges) {
    if (edge.category !== 'rdfType') continue;
    const subject = nodesById.get(edge.source);
    const object = nodesById.get(edge.target);
    if (object && object.kind === 'iri') object.category = 'class';
    if (subject && (subject.kind === 'iri' || subject.kind === 'variable' || subject.kind === 'blank')) {
      if (subject.category === 'unknown') subject.category = 'individual';
    }
  }
}

/**
 * Builds an app-neutral SPARQL graph model from a SPARQL.js AST.
 *
 * @param {any} ast - SPARQL.js AST.
 * @param {{annotationPredicateIris?: Iterable<string>}} [options] - Model options.
 * @returns {{queryType: string, prefixes: Record<string,string>, nodes: any[], edges: any[], whereTripleCount: number}} Graph model.
 */
export function buildSparqlGraphModelFromAst(ast, options = {}) {
  const prefixes = ast?.prefixes || {};
  const queryType = ast?.queryType || ast?.type || 'UNKNOWN';
  const selectedVariableKeys = extractSelectedVariableKeysFromSparqlAst(ast);
  const whereTriples = extractWhereTriplesFromSparqlAst(ast?.where);
  const nodesById = new Map();
  const edges = [];

  const ensureNode = (term) => {
    const id = createSparqlAstTermKey(term);
    if (nodesById.has(id)) return id;

    let kind = 'iri';
    if (term?.termType === 'Variable') kind = 'variable';
    else if (isBlankNodeTerm(term)) kind = 'blank';
    else if (term?.termType === 'Literal') kind = 'literal';
    else if (term?.termType === 'NamedNode') kind = 'iri';

    nodesById.set(id, {
      id,
      label: formatSparqlAstTermLabel(term, prefixes),
      kind,
      category: kind === 'literal' ? 'literal' : (kind === 'variable' ? 'variable' : 'unknown'),
      isSelectedVar: selectedVariableKeys.has(id)
    });
    return id;
  };

  for (const triple of whereTriples) {
    const source = ensureNode(triple.subject);
    const target = ensureNode(triple.object);
    const category = classifySparqlTriplePatternEdge(triple.predicate, triple.object, options);
    const label = triple.predicate?.termType === 'NamedNode'
      ? formatSparqlAstTermLabel(triple.predicate, prefixes)
      : (category === 'path' ? '[path]' : '[predicate]');

    edges.push({
      id: `e:${source}::${label}::${target}::${edges.length}`,
      source,
      target,
      label,
      category,
      effect: 'none'
    });
  }

  applySparqlTypeHeuristicsToGraphNodes(nodesById, edges);

  return {
    queryType,
    prefixes,
    nodes: Array.from(nodesById.values()),
    edges,
    whereTripleCount: whereTriples.length
  };
}
