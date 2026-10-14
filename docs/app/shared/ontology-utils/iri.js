/**
 * @file Pure IRI and IRI-token utilities for ontology-facing workflows.
 *
 * These helpers deliberately do not expand CURIEs. Prefix expansion and
 * compaction belong to the namespace registry package.
 */

const DEFAULT_ABSOLUTE_IRI_SCHEMES = Object.freeze([
  'http',
  'https',
  'urn',
  'tag',
  'mailto',
  'data',
  'ipfs',
  'ipns',
  'ftp',
  'file',
  'ws',
  'wss'
]);

const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):([^\s]*)$/;

/**
 * Normalize one user-, RDF-, SPARQL-, or table-provided IRI token.
 *
 * The function trims whitespace, optionally removes display labels such as
 * `Label - http://example.org/x`, and optionally removes surrounding angle
 * brackets. It does not validate the result and does not expand CURIEs.
 *
 * @param {unknown} value - Candidate IRI token.
 * @param {object} [options] - Normalization options.
 * @param {boolean} [options.stripAngleBrackets=true] - Remove one surrounding
 * `<...>` pair after trimming.
 * @param {boolean} [options.stripDisplayLabel=true] - Remove common display
 * labels separated by ` - ` or ` :: `.
 * @returns {string} Normalized token or an empty string for nullish values.
 */
export function normalizeIriToken(value, options = {}) {
  const {
    stripAngleBrackets = true,
    stripDisplayLabel = true
  } = options;

  let text = String(value ?? '').trim();
  if (stripDisplayLabel) {
    const displayParts = text.split(/\s(?:-|::)\s/);
    if (displayParts.length > 1) text = displayParts[displayParts.length - 1].trim();
  }

  if (stripAngleBrackets && text.length >= 2 && text[0] === '<' && text[text.length - 1] === '>') {
    text = text.slice(1, -1).trim();
  }

  return text;
}

/**
 * Returns whether a value is an absolute IRI suitable for RDF named-node use.
 *
 * By default this intentionally rejects CURIEs such as `skos:prefLabel`, while
 * accepting common absolute IRI schemes used by semantic-web tools. Callers
 * that need broad URI-scheme acceptance may pass `{ allowedSchemes: null }`.
 *
 * @param {unknown} value - Candidate IRI value or token.
 * @param {object} [options] - Validation options.
 * @param {readonly string[] | null} [options.allowedSchemes] - Lowercase or
 * mixed-case scheme allowlist. Use `null` to allow any syntactically valid
 * scheme.
 * @param {boolean} [options.normalizeToken=true] - Whether to apply
 * `normalizeIriToken()` before validation.
 * @returns {boolean} True when the value is an absolute IRI under the selected
 * scheme policy.
 */
export function isAbsoluteIri(value, options = {}) {
  const {
    allowedSchemes = DEFAULT_ABSOLUTE_IRI_SCHEMES,
    normalizeToken = true
  } = options;
  const text = normalizeToken ? normalizeIriToken(value) : String(value ?? '').trim();
  if (!text || /\s/.test(text)) return false;

  const match = SCHEME_PATTERN.exec(text);
  if (!match) return false;

  const scheme = match[1].toLowerCase();
  const remainder = match[2];
  if (!remainder) return false;
  if (allowedSchemes === null) return true;
  return allowedSchemes.map((item) => String(item).toLowerCase()).includes(scheme);
}

/**
 * Returns whether a token uses the blank-node identifier syntax used by RDF
 * serializations and JSON-LD (`_:id`).
 *
 * @param {unknown} value - Candidate blank-node identifier.
 * @returns {boolean} True when the normalized token starts with `_:` and has an
 * identifier after the prefix.
 */
export function isBlankNodeId(value) {
  const text = normalizeIriToken(value, { stripAngleBrackets: false });
  return /^_:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text);
}

/**
 * Normalize a namespace IRI for places where a namespace boundary is required.
 *
 * If the value is non-empty and does not end in `/` or `#`, this appends `#`.
 * The function is intentionally simple because namespace policy is controlled
 * by the caller.
 *
 * @param {unknown} value - Candidate namespace IRI.
 * @returns {string} Namespace IRI with a terminal separator, or empty string.
 */
export function normalizeNamespaceIri(value) {
  const text = normalizeIriToken(value);
  if (!text) return '';
  return /[#/]$/.test(text) ? text : `${text}#`;
}
