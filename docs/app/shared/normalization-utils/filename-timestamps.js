import { getLocalDateTimeParts, getUtcDateTimeParts } from './date-parts.js';

/**
 * Formats date/time parts as a filename-safe timestamp.
 *
 * @param {{year: string, month: string, day: string, hour?: string, minute?: string, second?: string}} parts
 * @returns {string} Timestamp such as `2026-08-08_09-15-30`.
 */
export function formatDatePartsForFilename(parts) {
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour == null || parts.minute == null || parts.second == null) return date;
  return `${date}_${parts.hour}-${parts.minute}-${parts.second}`;
}

/**
 * Returns a filename-safe timestamp in local time or UTC.
 *
 * @param {Date} [date] - Source date. Defaults to the current date.
 * @param {object} [options]
 * @param {boolean} [options.utc=false] Use UTC parts instead of local parts.
 * @returns {string} Filename-safe timestamp.
 */
export function getTimestampForFilename(date = new Date(), { utc = false } = {}) {
  const parts = utc ? getUtcDateTimeParts(date) : getLocalDateTimeParts(date);
  return formatDatePartsForFilename(parts);
}

/**
 * Appends a timestamp before the final filename extension.
 *
 * @param {string} filename - Filename or basename.
 * @param {object} [options]
 * @param {Date} [options.date] Source date.
 * @param {boolean} [options.utc=false] Use UTC timestamp.
 * @param {string} [options.separator='_'] Separator before the timestamp.
 * @returns {string} Timestamped filename.
 */
export function appendTimestampToFilename(filename, { date = new Date(), utc = false, separator = '_' } = {}) {
  const text = String(filename || 'artifact').trim() || 'artifact';
  const match = text.match(/^(.*?)(\.[A-Za-z0-9_-]{1,12})?$/);
  const base = match?.[1] || text;
  const extension = match?.[2] || '';
  return `${base}${separator}${getTimestampForFilename(date, { utc })}${extension}`;
}
