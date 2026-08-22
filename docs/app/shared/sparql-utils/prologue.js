import { normalizePrefixMap } from '../namespace-registry/prefix-map.js';

const PREFIX_DECLARATION_RE = /^\s*PREFIX\s+([A-Za-z_][\w.-]*)?:\s*<([^>]+)>\s*$/i;
const BASE_DECLARATION_RE = /^\s*BASE\s+<([^>]+)>\s*$/i;

/**
 * Splits a SPARQL query or update into leading prologue lines and remaining
 * body text.
 *
 * Only leading `PREFIX` and `BASE` declarations are treated as prologue. This
 * keeps the function conservative: declarations embedded after the query/update
 * body are left untouched for parser-level validation.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {Readonly<{ok: true, prologueText: string, bodyText: string, warnings: ReadonlyArray<string>}>}
 */
export function splitSparqlPrologueFromBody(queryText) {
  const lines = String(queryText || '').split(/\r?\n/);
  const prologueLines = [];
  let bodyStart = 0;
  let seenDeclaration = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const isDeclaration = PREFIX_DECLARATION_RE.test(line) || BASE_DECLARATION_RE.test(line);

    if (!trimmed && !seenDeclaration) {
      prologueLines.push(line);
      bodyStart = index + 1;
      continue;
    }

    if (isDeclaration) {
      seenDeclaration = true;
      prologueLines.push(line);
      bodyStart = index + 1;
      continue;
    }

    bodyStart = index;
    break;
  }

  const prologueText = prologueLines.join('\n').trim();
  const bodyText = lines.slice(bodyStart).join('\n').replace(/^\s+/, '');

  return Object.freeze({
    ok: true,
    prologueText,
    bodyText,
    warnings: Object.freeze([])
  });
}

/**
 * Extracts leading `PREFIX` and `BASE` declarations from SPARQL text.
 *
 * Prefix namespace IRIs are normalized through the namespace-registry prefix
 * map normalizer so ontology/RDF and SPARQL prefix handling share the same
 * validation rules. `BASE` is intentionally returned separately because it is a
 * query resolution rule, not a namespace prefix.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {Readonly<{ok: true, prefixes: Record<string, string>, baseIri: string, prologueText: string, bodyText: string, warnings: ReadonlyArray<string>}>}
 */
export function extractSparqlPrologueDeclarations(queryText) {
  const split = splitSparqlPrologueFromBody(queryText);
  const prefixes = {};
  const bases = [];
  const warnings = [];

  for (const line of split.prologueText.split(/\n/)) {
    const prefixMatch = PREFIX_DECLARATION_RE.exec(line);
    if (prefixMatch) {
      const prefix = String(prefixMatch[1] || '').trim();
      const namespaceIri = String(prefixMatch[2] || '').trim();
      if (!namespaceIri) {
        warnings.push(`Ignored empty namespace IRI for prefix "${prefix}".`);
        continue;
      }
      if (Object.hasOwn(prefixes, prefix)) {
        warnings.push(`Duplicate SPARQL prefix "${prefix}" found; using the last declaration.`);
      }
      prefixes[prefix] = namespaceIri;
      continue;
    }

    const baseMatch = BASE_DECLARATION_RE.exec(line);
    if (baseMatch) bases.push(String(baseMatch[1] || '').trim());
  }

  if (bases.length > 1) warnings.push('Multiple BASE declarations found; using the first one.');

  const normalized = normalizePrefixMap(prefixes);
  return Object.freeze({
    ok: true,
    prefixes: normalized.prefixes,
    baseIri: bases[0] || '',
    prologueText: split.prologueText,
    bodyText: split.bodyText,
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
 * Prepends a normalized SPARQL prologue to query/update body text.
 *
 * @param {string} queryText - SPARQL body or full query text.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @param {{baseIri?: string}} [options] - Optional base IRI.
 * @returns {Readonly<{ok: true, value: string, warnings: ReadonlyArray<string>}>}
 */
export function prependSparqlPrologue(queryText, prefixes, options = {}) {
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
