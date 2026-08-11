import {
  getMimeTypeForFormatKey,
  getPreferredExtensionForMimeType,
  normalizeSupportedMimeType
} from '../format-registry/index.js';
import {
  createSafeFilenameBase,
  normalizeFileExtension,
  stripFileExtension
} from '../browser-file-io/index.js';
import { appendTimestampToFilename } from '../normalization-utils/index.js';
import { createReportValidationError } from './report-error.js';

/**
 * Creates a text export descriptor for a serialized report.
 *
 * @param {object} options
 * @param {string} options.text Serialized report text.
 * @param {string} [options.formatKey] Shared format-registry key such as `html`, `yaml`, or `json`.
 * @param {string} [options.mimeType] Explicit MIME type. Overrides format-key MIME when recognized.
 * @param {string} [options.extension] Explicit extension. Overrides MIME-derived extension.
 * @param {string} [options.baseFileName='report'] Download basename.
 * @param {Date} [options.date] Timestamp source.
 * @param {boolean} [options.includeTimestamp=true] Whether to append a filename timestamp.
 * @param {boolean} [options.utc=false] Use UTC timestamp.
 * @returns {{text: string, fileName: string, mimeType: string, extension: string}}
 */
export function createReportTextExportDescriptor({
  text,
  formatKey,
  mimeType,
  extension,
  baseFileName = 'report',
  date = new Date(),
  includeTimestamp = true,
  utc = false
} = {}) {
  if (text == null) throw createReportValidationError('createReportTextExportDescriptor expected text.');

  const descriptorResult = formatKey ? getMimeTypeForFormatKey(formatKey) : null;
  const descriptor = descriptorResult?.ok ? descriptorResult.value : null;
  const normalizedMime = mimeType ? normalizeSupportedMimeType(mimeType) : null;
  const resolvedMimeType = normalizedMime?.ok
    ? normalizedMime.value.mimeType
    : descriptor?.mimeType || String(mimeType || 'text/plain').trim();
  const preferredExtension = normalizedMime?.ok
    ? getPreferredExtensionForMimeType(normalizedMime.value.mimeType)
    : null;
  const resolvedExtension = normalizeFileExtension(extension || (preferredExtension?.ok ? preferredExtension.value : descriptor?.extensions?.[0] || 'txt'));
  const base = createSafeFilenameBase(stripFileExtension(baseFileName || 'report'));
  const timestamped = includeTimestamp
    ? appendTimestampToFilename(`${base}.${resolvedExtension}`, { date, utc })
    : `${base}.${resolvedExtension}`;

  return {
    text: String(text),
    fileName: timestamped,
    mimeType: resolvedMimeType,
    extension: resolvedExtension
  };
}
