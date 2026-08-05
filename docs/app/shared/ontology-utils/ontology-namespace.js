import {
  COMMON_NAMESPACE_REGISTRY
} from '../namespace-registry/index.js';
import { isAbsoluteIri, normalizeIriToken } from './iri.js';

/**
 * Returns whether an IRI is inside a namespace IRI.
 *
 * @param {unknown} iri - Candidate IRI.
 * @param {unknown} namespaceIri - Namespace boundary.
 * @returns {boolean} True when both values are non-empty strings and `iri`
 * starts with `namespaceIri`.
 */
export function isIriInNamespace(iri, namespaceIri) {
  const value = normalizeIriToken(iri);
  const namespace = normalizeIriToken(namespaceIri);
  return Boolean(value && namespace && value.startsWith(namespace));
}

/**
 * Returns whether an IRI belongs to one of the common registered vocabulary
 * namespaces such as RDF, RDFS, OWL, XSD, SKOS, DCTERMS, BFO, IAO, or CCO.
 *
 * The namespace list is derived from the namespace registry so apps do not
 * maintain local built-in vocabulary constants.
 *
 * @param {unknown} iri - Candidate IRI.
 * @param {object} [options] - Matching options.
 * @param {readonly string[]} [options.includePrefixes] - Registry prefixes to
 * include. Defaults to every registered namespace.
 * @param {readonly string[]} [options.excludePrefixes] - Registry prefixes to
 * exclude.
 * @returns {boolean} True when the IRI is absolute and starts with an included
 * registered namespace IRI.
 */
export function isRegisteredVocabularyIri(iri, options = {}) {
  const value = normalizeIriToken(iri);
  if (!isAbsoluteIri(value, { allowedSchemes: null, normalizeToken: false })) return false;

  const include = options.includePrefixes
    ? new Set(options.includePrefixes.map((item) => String(item)))
    : null;
  const exclude = new Set((options.excludePrefixes || []).map((item) => String(item)));

  return Object.values(COMMON_NAMESPACE_REGISTRY).some((entry) => {
    if (include && !include.has(entry.prefix)) return false;
    if (exclude.has(entry.prefix)) return false;
    return isIriInNamespace(value, entry.namespaceIri);
  });
}
