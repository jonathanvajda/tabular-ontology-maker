import {
  compactIriToCurie,
  expandCurieToIri,
  findLongestPrefixMatch
} from '../namespace-registry/curie.js';
import { extractSparqlPrologueDeclarations } from './prologue.js';
import { scanSparqlLexicalTokens } from './lexical-scan.js';

const PREFIX_OR_BASE_DECLARATION_RE = /^\s*(PREFIX|BASE)\b/i;

/**
 * Extracts SPARQL IRI references and prefixed names that can be considered for
 * IRI rewrite workflows.
 *
 * Leading `PREFIX` and `BASE` declarations are metadata, so they are excluded
 * from returned token rows. Prefix declarations are still used to expand
 * prefixed names.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map used to expand prefixed names.
 * @returns {Readonly<{ok: true, tokens: ReadonlyArray<{token: string, kind: 'IRIRef'|'PrefixedName', expandedIri: string}>, warnings: ReadonlyArray<string>}>}
 */
export function extractSparqlRewriteTokens(queryText, prefixes = {}) {
  const bodyText = removeSparqlPrologueDeclarationLines(queryText);
  const scan = scanSparqlLexicalTokens(bodyText);
  const staged = new Map();
  const warnings = [];

  for (const iri of scan.iriRefs) {
    staged.set(`IRIRef|<${iri}>|${iri}`, {
      token: `<${iri}>`,
      kind: 'IRIRef',
      expandedIri: iri
    });
  }

  for (const prefixedName of scan.prefixedNames) {
    const expanded = expandPrefixedName(prefixedName, prefixes);
    if (!expanded) {
      warnings.push(`Unable to expand SPARQL prefixed name "${prefixedName}".`);
      continue;
    }
    staged.set(`PrefixedName|${prefixedName}|${expanded}`, {
      token: prefixedName,
      kind: 'PrefixedName',
      expandedIri: expanded
    });
  }

  return Object.freeze({
    ok: true,
    tokens: Object.freeze(Array.from(staged.values())
      .sort((left, right) => left.expandedIri.localeCompare(right.expandedIri))
      .map(Object.freeze)),
    warnings: Object.freeze(warnings)
  });
}

/**
 * Builds table-ready preview rows for a SPARQL IRI rewrite.
 *
 * @param {{prefixes?: Record<string, string>, tokens?: Array<{token: string, kind: string, expandedIri?: string, expanded?: string}>}} run - Query run data.
 * @param {Map<string, string>} mapping - Old-IRI to new-IRI mapping.
 * @returns {Readonly<{ok: true, rows: ReadonlyArray<{token: string, kind: string, expandedIri: string, targetIri: string, status: 'Change'|'No change'}>, proposedChangeCount: number, totalTokenCount: number}>}
 */
export function buildSparqlRewritePreviewRows(run, mapping) {
  const prefixes = run?.prefixes || {};
  const tokens = run?.tokens || [];
  const prefixNamespaceTargets = {};
  const rows = [];
  let proposedChangeCount = 0;

  for (const [prefix, namespaceIri] of Object.entries(prefixes)) {
    const mapped = mapping.get(namespaceIri);
    if (mapped && mapped !== namespaceIri) prefixNamespaceTargets[prefix] = mapped;
  }

  for (const token of tokens) {
    const expandedIri = token.expandedIri || token.expanded || '';
    const targetIri = getTargetIriForToken(token, expandedIri, mapping, prefixNamespaceTargets);
    const status = targetIri ? 'Change' : 'No change';
    if (targetIri) proposedChangeCount++;

    rows.push(Object.freeze({
      token: token.token,
      kind: token.kind,
      expandedIri,
      targetIri,
      status
    }));
  }

  return Object.freeze({
    ok: true,
    rows: Object.freeze(rows),
    proposedChangeCount,
    totalTokenCount: rows.length
  });
}

/**
 * Rewrites SPARQL IRI references and prefixed names according to an IRI map.
 *
 * The function returns both the rewritten text and a change log so callers do
 * not need to infer applied changes by searching the output string.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @param {Record<string, string>} prefixes - Original prefix-to-namespace map.
 * @param {Map<string, string>} mapping - Old-IRI to new-IRI mapping.
 * @param {{useNativePrefixes?: boolean}} [options] - Prefer prefixed names when the target IRI can be compacted with active SPARQL prefixes.
 * @returns {Readonly<{ok: true, value: string, changes: ReadonlyArray<{fromIri: string, toIri: string, fromToken: string, toToken: string, kind: string}>, warnings: ReadonlyArray<string>}>}
 */
export function rewriteSparqlIris(queryText, prefixes, mapping, options = {}) {
  const useNativePrefixes = options.useNativePrefixes !== false;
  const warnings = [];
  const changes = [];
  let text = String(queryText || '');

  text = rewritePrologueIris(text, mapping, changes);
  const updatedPrefixes = extractSparqlPrologueDeclarations(text).prefixes;
  const value = rewriteSparqlBodyIriTokens(text, prefixes, updatedPrefixes, mapping, {
    useNativePrefixes,
    changes
  });

  return Object.freeze({
    ok: true,
    value,
    changes: Object.freeze(changes.map(Object.freeze)),
    warnings: Object.freeze(warnings)
  });
}

/**
 * Formats an IRI for SPARQL output as either a prefixed name or `<IRI>`.
 *
 * @param {string} iri - Absolute IRI to format.
 * @param {Record<string, string>} prefixes - Active SPARQL prefix map.
 * @param {{useNativePrefixes?: boolean}} [options] - Whether prefixed names are allowed.
 * @returns {string} SPARQL IRI token.
 */
export function formatSparqlIriToken(iri, prefixes = {}, options = {}) {
  const iriText = String(iri || '').trim();
  const useNativePrefixes = options.useNativePrefixes !== false;
  if (!useNativePrefixes) return `<${iriText}>`;

  const compacted = compactIriToCurie(iriText, prefixes);
  if (compacted.ok && compacted.prefix) return compacted.value;

  const match = findLongestPrefixMatch(iriText, prefixes);
  if (match.ok && match.prefix) {
    const local = iriText.slice(match.namespaceIri.length);
    if (/^[A-Za-z0-9_.-]+$/.test(local)) return `${match.prefix}:${local}`;
  }

  return `<${iriText}>`;
}

/**
 * Counts applied IRI rewrites by comparing the rewrite change log.
 *
 * @param {{changes?: ReadonlyArray<unknown>}} rewriteResult - Result from `rewriteSparqlIris`.
 * @returns {number} Number of applied changes.
 */
export function countAppliedSparqlIriRewrites(rewriteResult) {
  return Array.isArray(rewriteResult?.changes) ? rewriteResult.changes.length : 0;
}

function removeSparqlPrologueDeclarationLines(queryText) {
  return String(queryText || '')
    .split(/\r?\n/)
    .map((line) => PREFIX_OR_BASE_DECLARATION_RE.test(line) ? '' : line)
    .join('\n');
}

function expandPrefixedName(token, prefixes) {
  const expanded = expandCurieToIri(token, prefixes);
  return expanded.ok ? expanded.value : '';
}

function getTargetIriForToken(token, expandedIri, mapping, prefixNamespaceTargets) {
  const mapped = mapping.get(expandedIri);
  if (mapped && mapped !== expandedIri) return mapped;

  if (token.kind !== 'PrefixedName') return '';

  const separatorIndex = String(token.token || '').indexOf(':');
  const prefix = separatorIndex >= 0 ? token.token.slice(0, separatorIndex) : '';
  const localName = separatorIndex >= 0 ? token.token.slice(separatorIndex + 1) : '';
  const namespaceTarget = prefixNamespaceTargets[prefix];
  const impliedTarget = namespaceTarget ? `${namespaceTarget}${localName}` : '';
  return impliedTarget && impliedTarget !== expandedIri ? impliedTarget : '';
}

function rewritePrologueIris(text, mapping, changes) {
  return text
    .replace(/^\s*PREFIX\s+([A-Za-z_][\w.-]*)?:\s*<([^>]+)>\s*$/gmi, (full, _prefixRaw, namespaceRaw) => {
      const namespaceIri = String(namespaceRaw || '').trim();
      const mapped = mapping.get(namespaceIri);
      if (!mapped || mapped === namespaceIri) return full;
      changes.push({ fromIri: namespaceIri, toIri: mapped, fromToken: `<${namespaceIri}>`, toToken: `<${mapped}>`, kind: 'PREFIX' });
      return full.replace(`<${namespaceIri}>`, `<${mapped}>`);
    })
    .replace(/^\s*BASE\s+<([^>]+)>\s*$/gmi, (full, baseRaw) => {
      const baseIri = String(baseRaw || '').trim();
      const mapped = mapping.get(baseIri);
      if (!mapped || mapped === baseIri) return full;
      changes.push({ fromIri: baseIri, toIri: mapped, fromToken: `<${baseIri}>`, toToken: `<${mapped}>`, kind: 'BASE' });
      return full.replace(`<${baseIri}>`, `<${mapped}>`);
    });
}

function rewriteSparqlBodyIriTokens(text, originalPrefixes, updatedPrefixes, mapping, options) {
  const useNativePrefixes = Boolean(options.useNativePrefixes);
  const changes = options.changes;
  let output = '';
  let index = 0;
  let atLineStart = true;
  let skipPrefixedNamesOnLine = false;

  while (index < text.length) {
    const char = text[index];
    const triple = text.slice(index, index + 3);

    if (atLineStart) {
      skipPrefixedNamesOnLine = PREFIX_OR_BASE_DECLARATION_RE.test(text.slice(index).replace(/^\s+/, ''));
      atLineStart = false;
    }

    if (char === '\n' || char === '\r') {
      atLineStart = true;
      output += char;
      index++;
      continue;
    }

    if (char === '#') {
      const end = findLineEnd(text, index);
      output += text.slice(index, end);
      index = end;
      continue;
    }

    if (triple === "'''" || triple === '"""') {
      const end = findTripleQuotedStringEnd(text, index, triple);
      output += text.slice(index, end);
      index = end;
      continue;
    }

    if (char === "'" || char === '"') {
      const end = findQuotedStringEnd(text, index, char);
      output += text.slice(index, end);
      index = end;
      continue;
    }

    if (char === '<') {
      const end = text.indexOf('>', index + 1);
      if (end > index) {
        const iri = text.slice(index + 1, end).trim();
        const mapped = mapping.get(iri);
        if (mapped && mapped !== iri) {
          const toToken = `<${mapped}>`;
          changes.push({ fromIri: iri, toIri: mapped, fromToken: `<${iri}>`, toToken, kind: 'IRIRef' });
          output += toToken;
        } else {
          output += text.slice(index, end + 1);
        }
        index = end + 1;
        continue;
      }
    }

    const prefixedName = skipPrefixedNamesOnLine ? null : readPrefixedName(text, index);
    if (prefixedName) {
      const expanded = expandPrefixedName(prefixedName.value, originalPrefixes);
      const mapped = expanded ? mapping.get(expanded) : '';
      if (mapped && mapped !== expanded) {
        const toToken = formatSparqlIriToken(mapped, updatedPrefixes, { useNativePrefixes });
        changes.push({ fromIri: expanded, toIri: mapped, fromToken: prefixedName.value, toToken, kind: 'PrefixedName' });
        output += toToken;
      } else {
        output += prefixedName.value;
      }
      index = prefixedName.end;
      continue;
    }

    output += char;
    index++;
  }

  return output;
}

function findLineEnd(text, start) {
  const newline = text.slice(start).search(/\r?\n/);
  return newline < 0 ? text.length : start + newline;
}

function findQuotedStringEnd(text, start, quote) {
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === quote && text[index - 1] !== '\\') return index + 1;
  }
  return text.length;
}

function findTripleQuotedStringEnd(text, start, quote) {
  const end = text.indexOf(quote, start + 3);
  return end < 0 ? text.length : end + 3;
}

function readPrefixedName(text, start) {
  const first = text[start];
  if (!/[A-Za-z_:]/.test(first || '')) return null;

  let offset = start;
  if (first === ':') {
    offset++;
  } else {
    offset++;
    while (offset < text.length && /[A-Za-z0-9_.-]/.test(text[offset])) offset++;
    if (text[offset] !== ':') return null;
    offset++;
  }

  if (text.slice(start, offset).startsWith('http:') || text.slice(start, offset).startsWith('https:')) return null;
  if (offset >= text.length || (!/[A-Za-z_]/.test(text[offset]) && !/[0-9_]/.test(text[offset]))) return null;
  offset++;
  while (offset < text.length && /[A-Za-z0-9_.-]/.test(text[offset])) offset++;

  return { value: text.slice(start, offset), end: offset };
}
