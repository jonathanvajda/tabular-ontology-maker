/**
 * @file Pure date-part helpers for local and UTC date/time naming.
 */

/**
 * Returns local date parts using the host timezone.
 *
 * @param {Date} [date] - Source date. Defaults to the current date.
 * @returns {{year: string, month: string, day: string}}
 */
export function getLocalDateParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date();
  return {
    year: String(value.getFullYear()).padStart(4, '0'),
    month: String(value.getMonth() + 1).padStart(2, '0'),
    day: String(value.getDate()).padStart(2, '0')
  };
}

/**
 * Returns UTC date parts.
 *
 * @param {Date} [date] - Source date. Defaults to the current date.
 * @returns {{year: string, month: string, day: string}}
 */
export function getUtcDateParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date();
  return {
    year: String(value.getUTCFullYear()).padStart(4, '0'),
    month: String(value.getUTCMonth() + 1).padStart(2, '0'),
    day: String(value.getUTCDate()).padStart(2, '0')
  };
}

/**
 * Returns local date and time parts using the host timezone.
 *
 * @param {Date} [date] - Source date. Defaults to the current date.
 * @returns {{year: string, month: string, day: string, hour: string, minute: string, second: string}}
 */
export function getLocalDateTimeParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date();
  return {
    ...getLocalDateParts(value),
    hour: String(value.getHours()).padStart(2, '0'),
    minute: String(value.getMinutes()).padStart(2, '0'),
    second: String(value.getSeconds()).padStart(2, '0')
  };
}

/**
 * Returns UTC date and time parts.
 *
 * @param {Date} [date] - Source date. Defaults to the current date.
 * @returns {{year: string, month: string, day: string, hour: string, minute: string, second: string}}
 */
export function getUtcDateTimeParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date();
  return {
    ...getUtcDateParts(value),
    hour: String(value.getUTCHours()).padStart(2, '0'),
    minute: String(value.getUTCMinutes()).padStart(2, '0'),
    second: String(value.getUTCSeconds()).padStart(2, '0')
  };
}
