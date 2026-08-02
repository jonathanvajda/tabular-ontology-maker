import { createValidationError } from './storage-error.js';

const DEFAULT_TIME_SOURCE = () => new Date().toISOString();

function normalizeIdPart(part) {
  return String(part ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Create a deterministic id from a type prefix and stable semantic parts.
 *
 * This covers OntoEagle dataset ids, TOM default-project ids, and deterministic
 * artifact ids where a file fingerprint or source IRI is available.
 *
 * @param {string} prefix Id namespace such as `project`, `dataset`, or `artifact`.
 * @param {Array<string|number|boolean|null|undefined>} parts Stable id components.
 * @param {object} [options]
 * @param {string} [options.fallback='item'] Component used when all parts are empty.
 * @returns {string} Stable id formatted as `prefix:normalized-parts`.
 */
export function createStableRecordId(prefix, parts, { fallback = 'item' } = {}) {
  const cleanPrefix = normalizeIdPart(prefix);
  if (!cleanPrefix) throw createValidationError('createStableRecordId expected a non-empty prefix.');
  const cleanParts = (Array.isArray(parts) ? parts : [parts])
    .map(normalizeIdPart)
    .filter(Boolean);
  return `${cleanPrefix}:${cleanParts.join('-') || normalizeIdPart(fallback) || 'item'}`;
}

/**
 * Create a time-based id for user actions such as diagnostic or transformation
 * runs where uniqueness is more important than deterministic replay.
 *
 * @param {string} prefix Id namespace such as `run`.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function returning an ISO-like value.
 * @param {string|number} [options.suffix] Optional collision breaker.
 * @returns {string} Id formatted as `prefix:timestamp[:suffix]`.
 */
export function createTimestampRecordId(prefix, { now = DEFAULT_TIME_SOURCE, suffix } = {}) {
  const cleanPrefix = normalizeIdPart(prefix);
  if (!cleanPrefix) throw createValidationError('createTimestampRecordId expected a non-empty prefix.');
  const stamp = normalizeIdPart(now());
  if (!stamp) throw createValidationError('createTimestampRecordId expected now() to return a usable timestamp.');
  const cleanSuffix = suffix === undefined ? '' : normalizeIdPart(suffix);
  return [cleanPrefix, stamp, cleanSuffix].filter(Boolean).join(':');
}
