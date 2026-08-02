import { normalizePrefixMap } from './prefix-map.js';

/**
 * @file RDF serializer prefix adapter helpers.
 *
 * These helpers prepare or apply stored prefixes for RDF serialization targets.
 * They do not perform RDF serialization themselves.
 */

/**
 * Creates N3 Writer options with normalized prefixes.
 *
 * @param {Record<string, unknown> & {prefixes?: Record<string, string>}} [options]
 * Existing N3 Writer options.
 * @returns {Readonly<{ok: true, value: Record<string, unknown> & {prefixes: Record<string, string>}, warnings: ReadonlyArray<string>}>}
 */
export function createN3WriterOptionsWithPrefixes(options = {}) {
  const normalized = normalizePrefixMap(options.prefixes || {});
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...options,
      prefixes: normalized.prefixes
    }),
    warnings: normalized.warnings
  });
}

/**
 * Selects only prefixes whose namespace IRIs occur in an RDF dataset.
 *
 * This is intended for serializers such as N3 Writer, where passing every known
 * app prefix makes Turtle/TriG output noisy. It accepts RDF/JS quads, N3 quads,
 * dataset-like objects with `getQuads()`, or any iterable of quads.
 *
 * @param {Record<string, string>} prefixes Prefix-to-namespace map.
 * @param {unknown} dataset RDF dataset-like value or quad iterable.
 * @returns {Readonly<{ok: true, value: Record<string, string>, warnings: ReadonlyArray<string>}>}
 */
export function selectPrefixesUsedByRdfTerms(prefixes, dataset) {
  const normalized = normalizePrefixMap(prefixes || {});
  const values = collectRdfTermIriValues(dataset);
  const selected = {};

  for (const [prefix, namespaceIri] of Object.entries(normalized.prefixes)) {
    if (values.some((value) => value.startsWith(namespaceIri))) {
      selected[prefix] = namespaceIri;
    }
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze(selected),
    warnings: normalized.warnings
  });
}

/**
 * Applies prefixes to an rdflib-style store when that API is available.
 *
 * @param {{setPrefixForURI?: (prefix: string, namespaceIri: string) => unknown}} store
 * rdflib-like store or graph.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {Readonly<{ok: true, value: unknown, warnings: ReadonlyArray<string>} | {ok: false, error: 'unsupported prefix target', warnings: ReadonlyArray<string>}>}
 */
export function applyPrefixesToRdflibStore(store, prefixes) {
  const normalized = normalizePrefixMap(prefixes);
  if (typeof store?.setPrefixForURI !== 'function') {
    return Object.freeze({
      ok: false,
      error: 'unsupported prefix target',
      warnings: normalized.warnings
    });
  }

  for (const [prefix, namespaceIri] of Object.entries(normalized.prefixes)) {
    if (prefix) store.setPrefixForURI(prefix, namespaceIri);
  }

  return Object.freeze({
    ok: true,
    value: store,
    warnings: normalized.warnings
  });
}

function collectRdfTermIriValues(dataset) {
  return quadsFromDatasetLike(dataset).flatMap((quad) => [
    ...iriValuesFromTerm(quad?.subject),
    ...iriValuesFromTerm(quad?.predicate),
    ...iriValuesFromTerm(quad?.object),
    ...iriValuesFromTerm(quad?.graph)
  ]);
}

function quadsFromDatasetLike(dataset) {
  if (!dataset) return [];
  if (Array.isArray(dataset)) return dataset;
  if (typeof dataset.getQuads === 'function') return dataset.getQuads(null, null, null, null) || [];
  if (typeof dataset.match === 'function') {
    const matched = dataset.match(null, null, null, null);
    if (Array.isArray(matched)) return matched;
    if (matched && typeof matched[Symbol.iterator] === 'function') return Array.from(matched);
  }
  if (typeof dataset[Symbol.iterator] === 'function') return Array.from(dataset);
  return [];
}

function iriValuesFromTerm(term) {
  if (!term || typeof term !== 'object') return [];
  if (term.termType === 'NamedNode') return [term.value || term.id].filter(Boolean);
  if (term.termType === 'Literal') {
    const datatypeValue = term.datatype?.value || term.datatype?.id || '';
    if (datatypeValue === 'http://www.w3.org/2001/XMLSchema#string') return [];
    return iriValuesFromTerm(term.datatype);
  }
  return [];
}
