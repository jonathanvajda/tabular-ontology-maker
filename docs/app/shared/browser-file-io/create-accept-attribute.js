/**
 * @file Pure helpers for browser file input accept attributes.
 */
import { normalizeFileExtension } from './filename-utils.js';

/**
 * @typedef {Readonly<{
 *   extensions?: ReadonlyArray<string>,
 *   mimeType?: string,
 *   category?: string
 * }>} AcceptDescriptor
 */

/**
 * @typedef {Object} CreateAcceptAttributeOptions
 * @property {string} [category] - Optional descriptor category filter.
 * @property {boolean} [includeMimeTypes=false] - Include MIME types alongside extensions.
 */

/**
 * Creates a stable HTML file input `accept` attribute.
 *
 * The input can be raw extensions, MIME strings, or registry-like descriptors.
 * This keeps browser UI string construction separate from the MIME registry
 * itself while allowing apps to pass registry descriptors when useful.
 *
 * @param {ReadonlyArray<string | AcceptDescriptor>} entries - Extensions, MIME strings, or descriptors.
 * @param {CreateAcceptAttributeOptions} [options] - Filtering and MIME inclusion options.
 * @returns {string} Comma-separated accept attribute value.
 */
export function createAcceptAttribute(entries, options = {}) {
  const values = [];
  const seen = new Set();

  for (const entry of entries || []) {
    const descriptor = typeof entry === 'string' ? null : entry;
    if (descriptor && options.category && descriptor.category !== options.category) continue;

    const extensions = descriptor ? descriptor.extensions || [] : [entry];
    for (const extension of extensions) {
      addAcceptValue(values, seen, normalizeAcceptExtension(extension));
    }

    if (options.includeMimeTypes && descriptor?.mimeType) {
      addAcceptValue(values, seen, normalizeMimeType(descriptor.mimeType));
    } else if (options.includeMimeTypes && typeof entry === 'string' && entry.includes('/')) {
      addAcceptValue(values, seen, normalizeMimeType(entry));
    }
  }

  return values.join(',');
}

function addAcceptValue(values, seen, value) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  values.push(value);
}

function normalizeAcceptExtension(extension) {
  const value = String(extension || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('/')) return normalizeMimeType(value);
  return `.${normalizeFileExtension(value)}`;
}

function normalizeMimeType(mimeType) {
  return String(mimeType || '').trim().toLowerCase();
}
