import { StorageError } from './storage-error.js';

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

export const PROJECT_FILE_MAX_SEGMENT_LENGTH = 200;
export const PROJECT_FILE_MAX_PATH_LENGTH = 380;

/**
 * Sanitizes one file or folder name for a user-designated project folder.
 *
 * @param {string} name File or folder segment.
 * @returns {string} NFC-normalized safe segment.
 */
export function sanitizeProjectFileName(name) {
  if (typeof name !== 'string') throw new StorageError('Project file name must be a string.', { code: 'BAD_PROJECT_FILE_NAME' });
  let text = name.normalize('NFC');
  if (/[\x00-\x1f\x7f]/.test(text)) throw new StorageError('Project file name contains a control character.', { code: 'PROJECT_FILE_CONTROL_CHARACTER' });
  if (text.includes('/') || text.includes('\\')) throw new StorageError('Project file name must not contain path separators.', { code: 'PROJECT_FILE_SEPARATOR' });
  if (text === '.' || text === '..') throw new StorageError('Project file name must not traverse directories.', { code: 'PROJECT_FILE_TRAVERSAL' });
  if (/[<>:"|?*]/.test(text)) throw new StorageError('Project file name contains a forbidden character.', { code: 'PROJECT_FILE_FORBIDDEN_CHARACTER' });
  text = text.replace(/[. ]+$/g, '');
  if (!text) throw new StorageError('Project file name must not be empty.', { code: 'EMPTY_PROJECT_FILE_NAME' });
  if (WINDOWS_RESERVED_NAMES.has(text.split('.')[0].toUpperCase())) {
    throw new StorageError('Project file name uses a reserved Windows device name.', { code: 'PROJECT_FILE_RESERVED_NAME' });
  }
  if (text.length > PROJECT_FILE_MAX_SEGMENT_LENGTH) {
    throw new StorageError('Project file name is too long.', { code: 'PROJECT_FILE_NAME_TOO_LONG' });
  }
  return text;
}

/**
 * Splits and sanitizes a project-relative path.
 *
 * @param {string} path Project-relative path using `/` separators.
 * @returns {string[]} Safe path segments.
 */
export function splitProjectRelativePath(path) {
  if (typeof path !== 'string') throw new StorageError('Project path must be a string.', { code: 'BAD_PROJECT_FILE_PATH' });
  if (!path) throw new StorageError('Project path must not be empty.', { code: 'EMPTY_PROJECT_FILE_PATH' });
  const rawSegments = path.split('/');
  if (rawSegments.some((segment) => segment === '')) {
    throw new StorageError('Project path must not contain empty segments.', { code: 'EMPTY_PROJECT_FILE_PATH_SEGMENT' });
  }
  const segments = rawSegments.map(sanitizeProjectFileName);
  const totalLength = segments.reduce((total, segment) => total + segment.length + 1, 0) - 1;
  if (totalLength > PROJECT_FILE_MAX_PATH_LENGTH) {
    throw new StorageError('Project path is too long.', { code: 'PROJECT_FILE_PATH_TOO_LONG' });
  }
  return segments;
}

/**
 * Creates a stable Web Lock key for a project-relative path.
 *
 * @param {string} path Project-relative path.
 * @returns {string} Lock key.
 */
export function createProjectFileLockKey(path) {
  return `project-file:${splitProjectRelativePath(path).join('/')}`;
}

/**
 * Rejects public writes into reserved package metadata paths.
 *
 * @param {string} path Project-relative path.
 * @param {object} [options]
 * @param {string} [options.reservedRoot='.app'] Reserved metadata directory.
 * @returns {void}
 */
export function guardWritableProjectPath(path, { reservedRoot = '.app' } = {}) {
  if (typeof path !== 'string') throw new StorageError('Project path must be a string.', { code: 'BAD_PROJECT_FILE_PATH' });
  if (path.split('/')[0] === reservedRoot) {
    throw new StorageError('Project metadata path is reserved.', { code: 'RESERVED_PROJECT_FILE_PATH', details: { reservedRoot } });
  }
}
