import { normalizePrefixMap } from './prefix-map.js';

/**
 * @file SPARQL prefix prologue helpers.
 *
 * SPARQL prefix handling is text-oriented and intentionally distinct from RDF
 * parser prefix extraction. These helpers use conservative prologue regexes and
 * return warnings rather than logging.
 */

/**
 * Extracts `PREFIX` and `BASE` declarations from SPARQL query/update text.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {Readonly<{ok: true, prefixes: Record<string, string>, baseIri: string, warnings: ReadonlyArray<string>}>}
 */
export function extractSparqlPrefixesFromText(queryText) {
  const text = String(queryText || '');
  const prefixes = {};
  const warnings = [];
  const prefixRe = /^\s*PREFIX\s+([A-Za-z_][\w.-]*)?:\s*<([^>]+)>\s*$/gmi;
  const baseRe = /^\s*BASE\s+<([^>]+)>\s*$/gmi;

  for (let match; (match = prefixRe.exec(text)); ) {
    const prefix = String(match[1] || '').trim();
    const namespaceIri = String(match[2] || '').trim();
    if (!namespaceIri) {
      warnings.push(`Ignored empty namespace IRI for prefix "${prefix}".`);
      continue;
    }
    if (Object.hasOwn(prefixes, prefix)) {
      warnings.push(`Duplicate SPARQL prefix "${prefix}" found; using the last declaration.`);
    }
    prefixes[prefix] = namespaceIri;
  }

  const bases = [...text.matchAll(baseRe)].map((match) => String(match[1] || '').trim()).filter(Boolean);
  if (bases.length > 1) warnings.push('Multiple BASE declarations found; using the first one.');

  const normalized = normalizePrefixMap(prefixes);
  return Object.freeze({
    ok: true,
    prefixes: normalized.prefixes,
    baseIri: bases[0] || '',
    warnings: Object.freeze([...warnings, ...normalized.warnings])
  });
}

/**
 * Formats a prefix map as sorted SPARQL `PREFIX` declaration lines.
 *
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {Readonly<{ok: true, value: string, warnings: ReadonlyArray<string>}>}
 */
export function formatSparqlPrefixDeclarations(prefixes) {
  const normalized = normalizePrefixMap(prefixes);
  const lines = Object.entries(normalized.prefixes)
    .filter(([prefix]) => prefix)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([prefix, namespaceIri]) => `PREFIX ${prefix}: <${namespaceIri}>`);

  return Object.freeze({
    ok: true,
    value: lines.join('\n'),
    warnings: normalized.warnings
  });
}

/**
 * Prepends stored prefixes and an optional base IRI to a SPARQL query blob.
 *
 * This function does not remove or rewrite declarations already present in the
 * query text. Apps that need replacement semantics should call this after a
 * separate prologue rewrite step.
 *
 * @param {string} queryText - SPARQL body/query text.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @param {{baseIri?: string}} [options] - Optional base IRI.
 * @returns {Readonly<{ok: true, value: string, warnings: ReadonlyArray<string>}>}
 */
export function prependSparqlPrefixes(queryText, prefixes, options = {}) {
  const body = String(queryText || '');
  const declarations = formatSparqlPrefixDeclarations(prefixes);
  const baseIri = String(options.baseIri || '').trim();
  const baseLine = baseIri ? `BASE <${baseIri}>` : '';
  const prologue = [baseLine, declarations.value].filter(Boolean).join('\n');
  const separator = prologue && body.trim() ? '\n\n' : '';

  return Object.freeze({
    ok: true,
    value: `${prologue}${separator}${body}`,
    warnings: declarations.warnings
  });
}
