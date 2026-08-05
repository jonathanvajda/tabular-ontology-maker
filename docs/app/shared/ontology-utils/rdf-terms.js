/**
 * @file Non-throwing RDF/JS term predicates.
 *
 * RDF construction and normalization remain in rdf-io. These predicates are
 * for validation, filtering, and preflight checks where callers need a boolean
 * instead of a thrown constructor error.
 */

/**
 * Returns whether a value looks like an RDF/JS term.
 *
 * @param {unknown} value - Candidate RDF/JS term.
 * @returns {boolean} True when the value has a string `termType`.
 */
export function isRdfTerm(value) {
  return Boolean(value && typeof value === 'object' && typeof value.termType === 'string');
}

/**
 * Returns whether a value is an RDF/JS blank-node term.
 *
 * @param {unknown} value - Candidate RDF/JS term.
 * @returns {boolean} True when `termType` is `BlankNode`.
 */
export function isBlankNodeTerm(value) {
  return isRdfTerm(value) && value.termType === 'BlankNode';
}

/**
 * Returns whether an RDF/JS term can legally be used as a quad subject.
 *
 * @param {unknown} term - Candidate RDF/JS term.
 * @returns {boolean} True for named nodes and blank nodes.
 */
export function canUseTermAsSubject(term) {
  return isRdfTerm(term) && (term.termType === 'NamedNode' || term.termType === 'BlankNode');
}

/**
 * Returns whether an RDF/JS term can legally be used as a quad predicate.
 *
 * @param {unknown} term - Candidate RDF/JS term.
 * @returns {boolean} True only for named nodes.
 */
export function canUseTermAsPredicate(term) {
  return isRdfTerm(term) && term.termType === 'NamedNode';
}

/**
 * Returns whether an RDF/JS term can legally be used as a quad object.
 *
 * @param {unknown} term - Candidate RDF/JS term.
 * @returns {boolean} True for named nodes, blank nodes, and literals.
 */
export function canUseTermAsObject(term) {
  return isRdfTerm(term) && ['NamedNode', 'BlankNode', 'Literal'].includes(term.termType);
}

/**
 * Returns whether an RDF/JS term can legally be used as a quad graph term.
 *
 * Nullish values are accepted because many callers use them to mean the default
 * graph before normalization.
 *
 * @param {unknown} term - Candidate RDF/JS graph term.
 * @returns {boolean} True for default graph, named nodes, blank nodes, and
 * nullish default-graph placeholders.
 */
export function canUseTermAsGraph(term) {
  return term == null || (isRdfTerm(term) && ['DefaultGraph', 'NamedNode', 'BlankNode'].includes(term.termType));
}

/**
 * Returns whether a quad has a blank-node term in subject, object, or graph.
 *
 * Malformed quads return false rather than throwing; callers that need strict
 * validation should use rdf-io normalization.
 *
 * @param {unknown} quad - Candidate RDF/JS quad.
 * @returns {boolean} True when subject, object, or graph is a blank node.
 */
export function hasBlankNodeTermInQuad(quad) {
  return Boolean(
    quad &&
    typeof quad === 'object' &&
    (
      isBlankNodeTerm(quad.subject) ||
      isBlankNodeTerm(quad.object) ||
      isBlankNodeTerm(quad.graph)
    )
  );
}
