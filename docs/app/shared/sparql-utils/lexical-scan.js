/**
 * Removes SPARQL line comments while preserving string literals and IRI refs.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @returns {string} SPARQL text without comments outside strings/IRI refs.
 */
export function stripSparqlLineComments(queryText) {
  let output = '';
  for (const token of scanSparqlLexicalTokens(queryText, { includeText: true }).tokens) {
    if (token.kind !== 'Comment') output += token.text;
  }
  return output;
}

/**
 * Reads a balanced `{...}` block from SPARQL text.
 *
 * Braces inside strings, comments, and IRI refs are ignored. The returned
 * content excludes the outer braces.
 *
 * @param {string} queryText - SPARQL text.
 * @param {number} startOffset - Offset expected to point at `{`.
 * @returns {Readonly<{ok: true, content: string, endOffset: number}>|Readonly<{ok: false, error: string}>}
 */
export function readBalancedSparqlBraceBlock(queryText, startOffset = 0) {
  const text = String(queryText || '');
  const start = Number(startOffset);
  if (!Number.isInteger(start) || start < 0 || text[start] !== '{') {
    return Object.freeze({ ok: false, error: 'Expected a SPARQL brace block start at startOffset.' });
  }

  let depth = 0;
  let contentStart = start + 1;

  for (const token of scanSparqlLexicalTokens(text.slice(start), { includeText: true }).tokens) {
    if (token.kind !== 'Text') continue;
    for (let offset = 0; offset < token.text.length; offset++) {
      const char = token.text[offset];
      const absoluteOffset = start + token.start + offset;
      if (char === '{') {
        depth++;
        if (depth === 1) contentStart = absoluteOffset + 1;
      }
      if (char === '}') {
        depth--;
        if (depth === 0) {
          return Object.freeze({
            ok: true,
            content: text.slice(contentStart, absoluteOffset),
            endOffset: absoluteOffset + 1
          });
        }
      }
    }
  }

  return Object.freeze({ ok: false, error: 'Unterminated SPARQL brace block.' });
}

/**
 * Scans SPARQL text for lexical regions and rewrite-relevant IRI tokens.
 *
 * The scanner is deliberately conservative. It does not replace a full SPARQL
 * parser, but it does protect comments and string literals from token
 * extraction/rewrite.
 *
 * @param {string} queryText - SPARQL query or update text.
 * @param {{includeText?: boolean}} [options] - Include text/comment/string tokens for callers that need a stream.
 * @returns {Readonly<{ok: true, iriRefs: ReadonlyArray<string>, prefixedNames: ReadonlyArray<string>, tokens: ReadonlyArray<{kind: string, text: string, start: number, end: number}>}>}
 */
export function scanSparqlLexicalTokens(queryText, options = {}) {
  const text = String(queryText || '');
  const iriRefs = new Set();
  const prefixedNames = new Set();
  const tokens = [];
  const includeText = Boolean(options.includeText);
  let textStart = 0;
  let index = 0;

  const pushText = (end) => {
    if (includeText && end > textStart) {
      tokens.push({ kind: 'Text', text: text.slice(textStart, end), start: textStart, end });
    }
  };
  const pushToken = (kind, start, end) => {
    pushText(start);
    if (includeText) tokens.push({ kind, text: text.slice(start, end), start, end });
    textStart = end;
  };

  while (index < text.length) {
    const char = text[index];
    const triple = text.slice(index, index + 3);

    if (char === '#') {
      const end = findLineEnd(text, index);
      pushToken('Comment', index, end);
      index = end;
      continue;
    }

    if (triple === "'''" || triple === '"""') {
      const end = findTripleQuotedStringEnd(text, index, triple);
      pushToken('String', index, end);
      index = end;
      continue;
    }

    if (char === "'" || char === '"') {
      const end = findQuotedStringEnd(text, index, char);
      pushToken('String', index, end);
      index = end;
      continue;
    }

    if (char === '<') {
      const end = text.indexOf('>', index + 1);
      if (end > index) {
        const iri = text.slice(index + 1, end).trim();
        if (iri) iriRefs.add(iri);
        pushToken('IRIRef', index, end + 1);
        index = end + 1;
        continue;
      }
    }

    const prefixedName = readPrefixedName(text, index);
    if (prefixedName) {
      if (!prefixedName.value.startsWith('http:') && !prefixedName.value.startsWith('https:')) {
        prefixedNames.add(prefixedName.value);
      }
      index = prefixedName.end;
      continue;
    }

    index++;
  }

  pushText(text.length);

  return Object.freeze({
    ok: true,
    iriRefs: Object.freeze(Array.from(iriRefs).sort()),
    prefixedNames: Object.freeze(Array.from(prefixedNames).sort()),
    tokens: Object.freeze(tokens.map(Object.freeze))
  });
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
  if (!isPrefixStart(first) && first !== ':') return null;

  let offset = start;
  if (first === ':') {
    offset++;
  } else {
    offset++;
    while (offset < text.length && isPrefixChar(text[offset])) offset++;
    if (text[offset] !== ':') return null;
    offset++;
  }

  if (offset >= text.length || (!isPrefixStart(text[offset]) && !/[0-9_]/.test(text[offset]))) return null;
  offset++;
  while (offset < text.length && isLocalChar(text[offset])) offset++;

  return { value: text.slice(start, offset), end: offset };
}

function isPrefixStart(char) {
  return /[A-Za-z_]/.test(char || '');
}

function isPrefixChar(char) {
  return /[A-Za-z0-9_.-]/.test(char || '');
}

function isLocalChar(char) {
  return /[A-Za-z0-9_.-]/.test(char || '');
}
