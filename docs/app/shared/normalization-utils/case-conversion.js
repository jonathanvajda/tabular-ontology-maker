/**
 * @file Pure string word-splitting and case-conversion utilities.
 */

/**
 * Supported case-style identifiers accepted by {@link normalizeStringToCase}.
 *
 * @type {readonly string[]}
 */
export const NORMALIZATION_CASE_STYLES = Object.freeze([
  'flatcase',
  'UPPERFLATCASE',
  'camelCase',
  'PascalCase',
  'snake_case',
  'SHOUTING_SNAKE',
  'kebab-case',
  'Train-Case',
  'COBOL-CASE'
]);

const CASE_STYLES = Object.freeze(new Set(NORMALIZATION_CASE_STYLES));

/**
 * Splits mixed free text and identifier text into alphanumeric word segments.
 *
 * The splitter handles spaces, punctuation, snake_case, kebab-case,
 * COBOL-CASE, Train-Case, camelCase, PascalCase, and acronym boundaries such
 * as `HTTPRequest` -> `["HTTP", "Request"]`.
 *
 * @param {unknown} value - Text, label, or identifier to split.
 * @returns {string[]} Word segments in source order.
 */
export function splitStringToWords(value) {
  const prepared = String(value ?? '')
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return prepared ? prepared.split(' ') : [];
}

/**
 * Converts text to flatcase.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized flatcase text.
 */
export function normalizeStringToFlatCase(value) {
  return splitStringToWords(value).join('').toLowerCase();
}

/**
 * Converts text to UPPERFLATCASE.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized UPPERFLATCASE text.
 */
export function normalizeStringToUpperFlatCase(value) {
  return splitStringToWords(value).join('').toUpperCase();
}

/**
 * Converts text to camelCase.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized camelCase text.
 */
export function normalizeStringToCamelCase(value) {
  const words = splitStringToWords(value);
  if (words.length === 0) return '';
  return words[0].toLowerCase() + words.slice(1).map(toTitleToken).join('');
}

/**
 * Converts text to PascalCase.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized PascalCase text.
 */
export function normalizeStringToPascalCase(value) {
  return splitStringToWords(value).map(toTitleToken).join('');
}

/**
 * Converts text to snake_case.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized snake_case text.
 */
export function normalizeStringToSnakeCase(value) {
  return splitStringToWords(value).map((word) => word.toLowerCase()).join('_');
}

/**
 * Converts text to SHOUTING_SNAKE.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized SHOUTING_SNAKE text.
 */
export function normalizeStringToShoutingSnakeCase(value) {
  return splitStringToWords(value).map((word) => word.toUpperCase()).join('_');
}

/**
 * Converts text to kebab-case.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized kebab-case text.
 */
export function normalizeStringToKebabCase(value) {
  return splitStringToWords(value).map((word) => word.toLowerCase()).join('-');
}

/**
 * Normalizes text to a lowercase ASCII slug by replacing non-alphanumeric runs
 * with one separator.
 *
 * Unlike kebab-case conversion, this does not split camelCase or acronym
 * boundaries. Use this for stable storage IDs and URL-ish fragments where
 * preserving existing alphanumeric runs matters.
 *
 * @param {unknown} value - Source text.
 * @param {object} [options]
 * @param {string} [options.separator='-'] Separator inserted between unsafe runs.
 * @returns {string} Lowercase ASCII slug text.
 */
export function normalizeStringToAsciiSlug(value, { separator = '-' } = {}) {
  const safeSeparator = String(separator || '-').slice(0, 1) || '-';
  const escaped = safeSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, safeSeparator)
    .replace(new RegExp(`${escaped}+`, 'g'), safeSeparator)
    .replace(new RegExp(`^${escaped}|${escaped}$`, 'g'), '');
}

/**
 * Converts text to Train-Case.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized Train-Case text.
 */
export function normalizeStringToTrainCase(value) {
  return splitStringToWords(value).map(toTitleToken).join('-');
}

/**
 * Converts text to COBOL-CASE.
 *
 * @param {unknown} value - Source text.
 * @returns {string} Normalized COBOL-CASE text.
 */
export function normalizeStringToCobolCase(value) {
  return splitStringToWords(value).map((word) => word.toUpperCase()).join('-');
}

/**
 * Converts text using a named case style.
 *
 * @param {unknown} value - Source text.
 * @param {string} caseStyle - One of the supported case-style names.
 * @param {object} [options]
 * @param {string} [options.fallbackStyle='camelCase'] Style used when caseStyle is blank or unknown.
 * @returns {string} Normalized text.
 */
export function normalizeStringToCase(value, caseStyle, { fallbackStyle = 'camelCase' } = {}) {
  const style = CASE_STYLES.has(caseStyle) ? caseStyle : fallbackStyle;
  switch (style) {
    case 'flatcase':
      return normalizeStringToFlatCase(value);
    case 'UPPERFLATCASE':
      return normalizeStringToUpperFlatCase(value);
    case 'PascalCase':
      return normalizeStringToPascalCase(value);
    case 'snake_case':
      return normalizeStringToSnakeCase(value);
    case 'SHOUTING_SNAKE':
      return normalizeStringToShoutingSnakeCase(value);
    case 'kebab-case':
      return normalizeStringToKebabCase(value);
    case 'Train-Case':
      return normalizeStringToTrainCase(value);
    case 'COBOL-CASE':
      return normalizeStringToCobolCase(value);
    case 'camelCase':
    default:
      return normalizeStringToCamelCase(value);
  }
}

/**
 * Detects the apparent case style of a string identifier or header.
 *
 * @param {unknown} value - Candidate text.
 * @returns {string} Case style label, `human`, or `unknown`.
 */
export function detectStringCaseStyle(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'unknown';
  if (/\s/.test(text)) return 'human';
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text)) return 'SHOUTING_SNAKE';
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text)) return 'snake_case';
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(text)) return 'COBOL-CASE';
  if (/^[A-Z][a-z0-9]*(?:-[A-Z][a-z0-9]*)+$/.test(text)) return 'Train-Case';
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text)) return 'kebab-case';
  if (/^[A-Z0-9]+$/.test(text)) return 'UPPERFLATCASE';
  if (/^[a-z0-9]+$/.test(text)) return 'flatcase';
  if (/^[a-z][A-Za-z0-9]*$/.test(text) && /[a-z0-9][A-Z]/.test(text)) return 'camelCase';
  if (/^[A-Z][A-Za-z0-9]*$/.test(text) && (/[a-z0-9][A-Z]/.test(text) || /[A-Z][a-z]/.test(text))) return 'PascalCase';
  if (/^[A-Za-z0-9]+$/.test(text)) return 'human';
  return 'unknown';
}

/**
 * Builds a display label from word tokens.
 *
 * @param {string[]} words - Word segments.
 * @param {object} [options]
 * @param {string} [options.fallback=''] Fallback for no words.
 * @returns {string} Space-separated title-style label.
 */
export function buildLabelFromWords(words, { fallback = '' } = {}) {
  const label = (Array.isArray(words) ? words : []).map(toTitleToken).filter(Boolean).join(' ');
  return label || fallback;
}

function toTitleToken(word) {
  const text = String(word ?? '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : '';
}
