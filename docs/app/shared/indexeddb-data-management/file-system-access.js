import { StorageError } from './storage-error.js';
import {
  createProjectFileLockKey,
  guardWritableProjectPath,
  sanitizeProjectFileName,
  splitProjectRelativePath
} from './project-file-paths.js';
import { runWithProjectFileLock } from './project-file-locks.js';

function encodeText(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

function decodeText(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function createTempName(name, randomSuffix) {
  return `.${name}.${randomSuffix}.tmp`;
}

function randomSuffix() {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    cryptoRef.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function isAbortError(error) {
  return error && typeof error === 'object' && error.name === 'AbortError';
}

/**
 * Detects whether the current browser exposes File System Access folder picks.
 *
 * @param {object} [runtime]
 * @param {Window} [runtime.windowRef=globalThis.window] Browser window.
 * @returns {{ok: boolean, value: object|null, error: object|null}} Structured support result.
 */
export function detectFileSystemAccessSupport({ windowRef = globalThis.window } = {}) {
  const supported = !!windowRef && typeof windowRef.showDirectoryPicker === 'function';
  return supported
    ? { ok: true, value: { api: 'file-system-access', directoryPicker: true }, error: null }
    : { ok: false, value: null, error: { code: 'FILE_SYSTEM_ACCESS_UNAVAILABLE' } };
}

/**
 * Opens the browser directory picker. This must be called from a user gesture
 * in real browsers.
 *
 * @param {object} [options]
 * @param {Window} [options.windowRef=globalThis.window] Browser window.
 * @param {string} [options.id='project-folder'] Picker id.
 * @param {string} [options.startIn='documents'] Suggested start location.
 * @returns {Promise<{ok: true, value: FileSystemDirectoryHandle}|{ok: false, value: null, error: object}>}
 */
export async function selectProjectFolder({ windowRef = globalThis.window, id = 'project-folder', startIn = 'documents' } = {}) {
  if (!windowRef || typeof windowRef.showDirectoryPicker !== 'function') {
    return { ok: false, value: null, error: { code: 'FILE_SYSTEM_ACCESS_UNAVAILABLE' } };
  }
  try {
    const handle = await windowRef.showDirectoryPicker({ id, mode: 'readwrite', startIn });
    return { ok: true, value: handle, error: null };
  } catch (error) {
    if (isAbortError(error)) return { ok: false, value: null, error: { code: 'PROJECT_FOLDER_PICK_CANCELLED' } };
    throw error;
  }
}

/**
 * Reads current read/write permission from a folder handle.
 *
 * @param {object} handleRecord Record containing a `handle`.
 * @returns {Promise<'granted'|'denied'|'prompt'|'unknown'>} Permission state.
 */
export async function readProjectFolderPermission(handleRecord) {
  const handle = handleRecord?.handle || handleRecord;
  if (!handle || typeof handle.queryPermission !== 'function') return 'unknown';
  return handle.queryPermission({ mode: 'readwrite' });
}

/**
 * Requests read/write permission from a folder handle.
 *
 * @param {object} handleRecord Record containing a `handle`.
 * @returns {Promise<'granted'>} Granted state.
 */
export async function requestProjectFolderPermission(handleRecord) {
  const handle = handleRecord?.handle || handleRecord;
  if (!handle || typeof handle.requestPermission !== 'function') {
    throw new StorageError('Project folder handle is not available.', { code: 'PROJECT_FOLDER_HANDLE_UNAVAILABLE' });
  }
  let result;
  try {
    result = await handle.requestPermission({ mode: 'readwrite' });
  } catch (error) {
    if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
      throw new StorageError('Project folder permission requires a user gesture.', { code: 'PROJECT_FOLDER_GESTURE_REQUIRED', cause: error });
    }
    throw error;
  }
  if (result !== 'granted') {
    throw new StorageError('Project folder permission was denied.', { code: 'PROJECT_FOLDER_PERMISSION_DENIED' });
  }
  return result;
}

/**
 * Creates a project folder store over a FileSystemDirectoryHandle.
 *
 * @param {FileSystemDirectoryHandle} rootHandle Root folder handle.
 * @param {object} [options]
 * @param {string} [options.dataPath=''] Optional subfolder used as the logical project root.
 * @param {string} [options.reservedRoot='.app'] Reserved metadata directory name.
 * @returns {object} Project folder store.
 */
export function createProjectFolderStore(rootHandle, { dataPath = '', reservedRoot = '.app' } = {}) {
  if (!rootHandle || typeof rootHandle.getDirectoryHandle !== 'function') {
    throw new StorageError('createProjectFolderStore expected a FileSystemDirectoryHandle-like root.', { code: 'INVALID_PROJECT_FOLDER_HANDLE' });
  }
  let ready = false;
  const baseSegments = dataPath ? splitProjectRelativePath(dataPath) : [];

  async function baseDir({ create = true } = {}) {
    let dir = rootHandle;
    for (const segment of baseSegments) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  }

  async function resolveDir(path = '', { create = false } = {}) {
    let dir = await baseDir({ create });
    if (!path) return dir;
    for (const segment of splitProjectRelativePath(path)) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch (error) {
        if (error?.name === 'NotFoundError') throw new StorageError('Project folder path was not found.', { code: 'PROJECT_FILE_SOURCE_NOT_FOUND', cause: error });
        if (error?.name === 'TypeMismatchError') throw new StorageError('Project folder path collides with a file.', { code: 'PROJECT_FILE_PATH_COLLISION', cause: error });
        throw error;
      }
    }
    return dir;
  }

  async function resolveParent(path, { create = false } = {}) {
    const segments = splitProjectRelativePath(path);
    const name = segments.pop();
    const dir = await resolveDir(segments.join('/'), { create });
    return { dir, name };
  }

  async function copyFile(tempHandle, dir, targetName) {
    const target = await dir.getFileHandle(targetName, { create: true });
    const writable = await target.createWritable({ keepExistingData: false });
    try {
      await writable.write(await tempHandle.getFile());
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch {}
      throw error;
    }
  }

  async function probeEntry(dir, name) {
    try {
      await dir.getFileHandle(name, { create: false });
      return 'file';
    } catch (error) {
      if (error?.name !== 'NotFoundError' && error?.name !== 'TypeMismatchError') throw error;
    }
    try {
      await dir.getDirectoryHandle(name, { create: false });
      return 'directory';
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function writeBytesInternal(path, bytes, { ifAbsent = false } = {}) {
    const { dir, name } = await resolveParent(path, { create: true });
    const safeName = sanitizeProjectFileName(name);
    if (ifAbsent && await probeEntry(dir, safeName)) {
      throw new StorageError('Project file already exists.', { code: 'PROJECT_FILE_TARGET_EXISTS' });
    }
    const tempName = createTempName(safeName, randomSuffix());
    const tempHandle = await dir.getFileHandle(tempName, { create: true });
    let writable;
    try {
      writable = await tempHandle.createWritable({ keepExistingData: false });
      await writable.write(bytes);
      await writable.close();
      writable = null;
      if (typeof tempHandle.move === 'function') {
        await tempHandle.move(dir, safeName);
      } else {
        await copyFile(tempHandle, dir, safeName);
        try { await dir.removeEntry(tempName); } catch {}
      }
    } catch (error) {
      if (writable) try { await writable.abort(); } catch {}
      try { await dir.removeEntry(tempName); } catch {}
      throw error;
    }
  }

  const store = {
    async initialize() {
      await baseDir({ create: true });
      ready = true;
      return store;
    },
    isReady() {
      return ready;
    },
    async listProjectFolderEntries(path = '', { includeHidden = false } = {}) {
      const dir = await resolveDir(path);
      const entries = [];
      for await (const entry of dir.values()) {
        if (!includeHidden && entry.name.startsWith('.')) continue;
        let size;
        let modified;
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            size = file.size;
            modified = file.lastModified;
          } catch {}
        }
        entries.push({ name: entry.name, kind: entry.kind, size, modified });
      }
      return entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    },
    async readProjectFileBytes(path) {
      const { dir, name } = await resolveParent(path);
      try {
        const handle = await dir.getFileHandle(sanitizeProjectFileName(name), { create: false });
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        if (error?.name === 'NotFoundError') throw new StorageError('Project file was not found.', { code: 'PROJECT_FILE_SOURCE_NOT_FOUND', cause: error });
        throw error;
      }
    },
    async readProjectFileText(path) {
      return decodeText(await store.readProjectFileBytes(path));
    },
    async writeProjectFileBytes(path, bytes, options = {}) {
      guardWritableProjectPath(path, { reservedRoot });
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return runWithProjectFileLock(createProjectFileLockKey(path), () => writeBytesInternal(path, data, options));
    },
    async writeProjectFileText(path, text, options = {}) {
      return store.writeProjectFileBytes(path, encodeText(text), options);
    },
    async createProjectDirectory(path) {
      guardWritableProjectPath(path, { reservedRoot });
      await runWithProjectFileLock(createProjectFileLockKey(path), () => resolveDir(path, { create: true }));
    },
    async renameProjectFileEntry(path, newName) {
      guardWritableProjectPath(path, { reservedRoot });
      const safeNew = sanitizeProjectFileName(newName);
      if (safeNew === reservedRoot) {
        throw new StorageError('Project metadata path is reserved.', { code: 'RESERVED_PROJECT_FILE_PATH' });
      }
      const parts = splitProjectRelativePath(path);
      const oldName = parts.pop();
      const parentPath = parts.join('/');
      const oldPath = [...parts, oldName].join('/');
      const newPath = [...parts, safeNew].join('/');
      const first = createProjectFileLockKey(oldPath);
      const second = createProjectFileLockKey(newPath);
      const [lockA, lockB] = first < second ? [first, second] : [second, first];
      return runWithProjectFileLock(lockA, () => runWithProjectFileLock(lockB, async () => {
        const dir = await resolveDir(parentPath);
        if (await probeEntry(dir, safeNew)) throw new StorageError('Project file target already exists.', { code: 'PROJECT_FILE_TARGET_EXISTS' });
        let handle;
        let kind = 'file';
        try {
          handle = await dir.getFileHandle(oldName, { create: false });
        } catch (error) {
          if (error?.name !== 'NotFoundError' && error?.name !== 'TypeMismatchError') throw error;
          try {
            handle = await dir.getDirectoryHandle(oldName, { create: false });
            kind = 'directory';
          } catch (innerError) {
            if (innerError?.name === 'NotFoundError') throw new StorageError('Project file source was not found.', { code: 'PROJECT_FILE_SOURCE_NOT_FOUND', cause: innerError });
            throw innerError;
          }
        }
        if (typeof handle.move === 'function') {
          await handle.move(dir, safeNew);
        } else if (kind === 'file') {
          await writeBytesInternal(newPath, new Uint8Array(await (await handle.getFile()).arrayBuffer()), { ifAbsent: true });
          try {
            await dir.removeEntry(oldName);
          } catch (error) {
            throw new StorageError('Project file rename copied but could not remove source.', { code: 'PROJECT_FILE_RENAME_ORPHAN', cause: error });
          }
        } else {
          throw new StorageError('Directory rename is unsupported in this browser.', { code: 'PROJECT_DIRECTORY_MOVE_UNSUPPORTED' });
        }
        return newPath;
      }));
    },
    async deleteProjectFileEntry(path, { recursive = false } = {}) {
      guardWritableProjectPath(path, { reservedRoot });
      return runWithProjectFileLock(createProjectFileLockKey(path), async () => {
        const { dir, name } = await resolveParent(path);
        try {
          await dir.removeEntry(sanitizeProjectFileName(name), { recursive });
        } catch (error) {
          if (error?.name === 'NotFoundError') throw new StorageError('Project file source was not found.', { code: 'PROJECT_FILE_SOURCE_NOT_FOUND', cause: error });
          if (error?.name === 'InvalidModificationError') throw new StorageError('Project directory is not empty.', { code: 'PROJECT_DIRECTORY_NOT_EMPTY', cause: error });
          throw error;
        }
      });
    }
  };
  return store;
}

/**
 * Initializes project folder access from an existing handle record.
 *
 * @param {object} handleRecord Record containing a `handle`.
 * @param {object} [options]
 * @returns {Promise<object>} Initialized project folder store.
 */
export async function initializeProjectFolderAccess(handleRecord, options = {}) {
  const permission = await readProjectFolderPermission(handleRecord);
  if (permission !== 'granted') {
    throw new StorageError('Project folder permission is not granted.', { code: 'PROJECT_FOLDER_PERMISSION_NOT_GRANTED' });
  }
  return createProjectFolderStore(handleRecord.handle || handleRecord, options).initialize();
}
