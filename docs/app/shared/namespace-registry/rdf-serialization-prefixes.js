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
