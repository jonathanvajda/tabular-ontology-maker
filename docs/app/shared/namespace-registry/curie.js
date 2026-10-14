import { isAbsoluteIri } from './prefix-map.js';

/**
 * @file Pure CURIE compaction and expansion helpers.
 */

const CURIE_LOCAL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]*$/;

/**
 * Finds the longest namespace prefix that matches an IRI.
 *
 * Longest-match behavior prevents broad namespaces from winning over more
 * specific namespaces when both share a common start.
 *
 * @param {string} iri - Absolute IRI to match.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {Readonly<{ok: true, prefix: string, namespaceIri: string}> | Readonly<{ok: false, error: 'unknown namespace', input: string}>}
 */
export function findLongestPrefixMatch(iri, prefixes) {
  const value = String(iri || '').trim();
  const entries = Object.entries(prefixes || {})
    .filter(([, namespaceIri]) => namespaceIri && value.startsWith(namespaceIri))
    .sort((a, b) => String(b[1]).length - String(a[1]).length || a[0].localeCompare(b[0]));

  const match = entries[0];
  return match
    ? Object.freeze({ ok: true, prefix: match[0], namespaceIri: match[1] })
    : Object.freeze({ ok: false, error: 'unknown namespace', input: value });
}

/**
 * Compacts an absolute IRI into a CURIE using an explicit prefix map.
 *
 * This function is intended for data/display normalization, not for blindly
 * emitting syntax-specific Turtle or SPARQL text. Callers that need looser
 * Turtle local-name rules should wrap this function in a syntax adapter.
 *
 * @param {string} iri - Absolute IRI to compact.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {Readonly<{ok: true, value: string, prefix: string, namespaceIri: string, localName: string}> | Readonly<{ok: false, error: 'invalid iri'|'unknown namespace'|'invalid curie local name', input: string, prefix?: string, namespaceIri?: string, localName?: string}>}
 */
export function compactIriToCurie(iri, prefixes) {
  const value = String(iri || '').trim();
  if (!isAbsoluteIri(value)) {
    return Object.freeze({ ok: false, error: 'invalid iri', input: String(iri || '') });
  }

  const match = findLongestPrefixMatch(value, prefixes);
  if (!match.ok) return match;

  const localName = value.slice(match.namespaceIri.length);
  if (!localName || !CURIE_LOCAL_NAME_PATTERN.test(localName)) {
    return Object.freeze({
      ok: false,
      error: 'invalid curie local name',
      input: value,
      prefix: match.prefix,
      namespaceIri: match.namespaceIri,
      localName
    });
  }

  return Object.freeze({
    ok: true,
    value: `${match.prefix}:${localName}`,
    prefix: match.prefix,
    namespaceIri: match.namespaceIri,
    localName
  });
}

/**
 * Formats an IRI for compact UI display. It prefers strict CURIE output, then
 * falls back to legacy local-name display for unknown namespaces.
 *
 * @param {string} iri - Full IRI.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {string} CURIE, local name, original IRI, or empty string.
 */
export function formatIriForDisplay(iri, prefixes) {
  if (typeof iri !== 'string') return '';
  const curie = compactIriToCurie(iri, prefixes);
  if (curie.ok) return curie.value;

  const match = findLongestPrefixMatch(iri, prefixes);
  if (match.ok) return `${match.prefix}:${iri.slice(match.namespaceIri.length)}`;

  const hash = iri.lastIndexOf('#');
  if (hash >= 0) return iri.slice(hash + 1);
  const slash = iri.lastIndexOf('/');
  if (slash >= 0) return iri.slice(slash + 1);
  return iri;
}

/**
 * Expands a CURIE into an absolute IRI using an explicit prefix map.
 *
 * Unknown prefixes are structured result errors rather than log messages or
 * thrown exceptions, so apps can decide whether to block, warn, or fall back.
 *
 * @param {string} curie - CURIE such as `rdfs:label`.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @param {{allowEmptyLocalName?: boolean}} [options] - Expansion options.
 * @returns {Readonly<{ok: true, value: string, prefix: string, namespaceIri: string, localName: string}> | Readonly<{ok: false, error: 'invalid curie'|'empty curie local name'|'unknown prefix', input: string, prefix?: string}>}
 */
export function expandCurieToIri(curie, prefixes, options = {}) {
  const token = String(curie || '').trim();
  const colonIndex = token.indexOf(':');
  if (colonIndex < 0) {
    return Object.freeze({ ok: false, error: 'invalid curie', input: String(curie || '') });
  }

  const prefix = token.slice(0, colonIndex);
  const localName = token.slice(colonIndex + 1);
  if (!localName && !options.allowEmptyLocalName) {
    return Object.freeze({ ok: false, error: 'empty curie local name', input: token, prefix });
  }

  const namespaceIri = prefixes?.[prefix];
  if (!namespaceIri) {
    return Object.freeze({ ok: false, error: 'unknown prefix', input: token, prefix });
  }

  return Object.freeze({ ok: true, value: `${namespaceIri}${localName}`, prefix, namespaceIri, localName });
}
