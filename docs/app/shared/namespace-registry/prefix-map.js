/**
 * @file Pure prefix-map validation, merging, and storage-adapter helpers.
 *
 * A prefix map is the shared package's neutral data shape for namespace
 * prefixes. UI controls, RDF imports, SPARQL imports, and project storage
 * should all normalize into this shape before other namespace helpers use it.
 */

/**
 * @typedef {Readonly<Record<string, string>>} PrefixMap
 */

/**
 * @typedef {Readonly<{ok: true, prefixes: PrefixMap, warnings: ReadonlyArray<string>}>} PrefixMapResult
 */

const PREFIX_NAME_PATTERN = /^[A-Za-z_][\w.-]*$/;
const ABSOLUTE_IRI_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/;

/**
 * Returns whether a value is an absolute IRI-like string.
 *
 * This is intentionally light validation. The namespace package only needs to
 * reject obvious non-IRIs; deeper URL/IRI conformance belongs at app validation
 * boundaries or RDF parser boundaries.
 *
 * @param {string | null | undefined} value - Candidate IRI value.
 * @returns {boolean}
 */
export function isAbsoluteIri(value) {
  return ABSOLUTE_IRI_PATTERN.test(String(value || ''));
}

/**
 * Returns whether a prefix label is allowed in this package's prefix maps.
 *
 * The empty prefix is allowed so RDF/XML and Turtle default-prefix declarations
 * can be preserved, even though not every downstream syntax can emit it.
 *
 * @param {string | null | undefined} prefix - Prefix label to validate.
 * @returns {boolean}
 */
export function isValidPrefixName(prefix) {
  const value = String(prefix ?? '').trim();
  return value === '' || PREFIX_NAME_PATTERN.test(value);
}

/**
 * Normalizes user-entered, file-extracted, or project-stored prefixes.
 *
 * Invalid entries are skipped and reported as warnings rather than thrown. This
 * keeps import and UI workflows deterministic: callers can decide whether a
 * warning is blocking, informational, or suitable for a toast.
 *
 * @param {Record<string, string> | null | undefined} prefixes - Prefix map-like
 * object whose keys are prefix labels and values are namespace IRIs.
 * @returns {PrefixMapResult} Frozen normalized prefix map and warnings.
 */
export function normalizePrefixMap(prefixes) {
  const out = {};
  const warnings = [];

  for (const [rawPrefix, rawIri] of Object.entries(prefixes || {})) {
    const prefix = String(rawPrefix ?? '').trim();
    const namespaceIri = String(rawIri ?? '').trim();

    if (!isValidPrefixName(prefix)) {
      warnings.push(`Ignored invalid prefix "${prefix}".`);
      continue;
    }
    if (!isAbsoluteIri(namespaceIri)) {
      warnings.push(`Ignored prefix "${prefix}" with invalid namespace IRI.`);
      continue;
    }
    out[prefix] = namespaceIri;
  }

  return Object.freeze({
    ok: true,
    prefixes: Object.freeze(out),
    warnings: Object.freeze(warnings)
  });
}

/**
 * Merges prefix maps from common defaults, user settings, RDF files, SPARQL
 * files, or project state into one normalized prefix map.
 *
 * Later maps override earlier maps. This lets apps use a predictable precedence
 * order such as common registry, project settings, then prefixes extracted from
 * the currently imported file.
 *
 * @param {...(Record<string, string> | null | undefined)} prefixMaps - Prefix
 * maps in increasing precedence order.
 * @returns {PrefixMapResult} Frozen merged prefix map and accumulated warnings.
 */
export function mergeProjectPrefixes(...prefixMaps) {
  const merged = {};
  const warnings = [];

  for (const prefixMap of prefixMaps) {
    const normalized = normalizePrefixMap(prefixMap);
    Object.assign(merged, normalized.prefixes);
    warnings.push(...normalized.warnings);
  }

  return Object.freeze({
    ok: true,
    prefixes: Object.freeze(merged),
    warnings: Object.freeze(warnings)
  });
}

/**
 * Saves normalized prefixes through an explicit storage adapter.
 *
 * The storage adapter is intentionally passed in. The namespace package does
 * not know about IndexedDB, File System Access, OPFS, or localStorage. Apps can
 * provide whichever adapter matches their project data management boundary.
 *
 * @param {{saveProjectPrefixes: (projectId: string, prefixes: PrefixMap) => Promise<unknown>}} storageAdapter
 * Adapter that persists project prefixes.
 * @param {string} projectId - Project/session identifier supplied by the app.
 * @param {Record<string, string>} prefixes - Prefixes to normalize and save.
 * @returns {Promise<PrefixMapResult>} Normalized prefixes after persistence.
 */
export async function saveProjectPrefixes(storageAdapter, projectId, prefixes) {
  const normalized = normalizePrefixMap(prefixes);
  if (!storageAdapter || typeof storageAdapter.saveProjectPrefixes !== 'function') {
    throw new TypeError('saveProjectPrefixes() requires a storage adapter with saveProjectPrefixes(projectId, prefixes).');
  }
  await storageAdapter.saveProjectPrefixes(String(projectId || ''), normalized.prefixes);
  return normalized;
}

/**
 * Internal helper used by extraction adapters to wrap prefix maps consistently.
 *
 * @param {Record<string, string>} prefixes - Raw extracted prefixes.
 * @param {Record<string, unknown>} [extra] - Additional result properties.
 * @returns {Readonly<{ok: true, prefixes: PrefixMap, warnings: ReadonlyArray<string>} & Record<string, unknown>>}
 */
export function okPrefixResult(prefixes, extra = {}) {
  const normalized = normalizePrefixMap(prefixes);
  return Object.freeze({
    ok: true,
    prefixes: normalized.prefixes,
    warnings: Object.freeze([...(extra.warnings || []), ...normalized.warnings]),
    ...extra
  });
}
