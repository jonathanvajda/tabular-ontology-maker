import { createStableRecordId } from './id-generation.js';
import { StorageError } from './storage-error.js';

function nowIso(now = () => new Date().toISOString()) {
  return now();
}

function requireAdapter(adapter) {
  for (const name of ['get', 'put', 'delete', 'list']) {
    if (!adapter || typeof adapter[name] !== 'function') {
      throw new StorageError(`Project folder handle adapter must provide ${name}().`, { code: 'INVALID_PROJECT_FOLDER_HANDLE_ADAPTER' });
    }
  }
}

/**
 * Normalizes metadata for a browser-local File System Access project folder.
 *
 * @param {object} record Project folder handle record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} Normalized record.
 */
export function normalizeProjectFolderHandleRecord(record, { now } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new StorageError('Project folder handle record must be an object.', { code: 'INVALID_PROJECT_FOLDER_HANDLE_RECORD' });
  }
  if (!record.handle || typeof record.handle.getDirectoryHandle !== 'function') {
    throw new StorageError('Project folder handle record must include a directory handle.', { code: 'PROJECT_FOLDER_HANDLE_REQUIRED' });
  }
  const projectId = String(record.projectId || '').trim();
  const label = String(record.label || record.name || record.handle.name || 'Project folder').trim();
  if (!label) throw new StorageError('Project folder handle label is required.', { code: 'PROJECT_FOLDER_HANDLE_LABEL_REQUIRED' });
  const createdAt = record.createdAt || nowIso(now);
  return {
    handleId: String(record.handleId || record.id || createStableRecordId('fsa', [projectId, label, createdAt])).trim(),
    projectId: projectId || null,
    label,
    handle: record.handle,
    rootPath: record.rootPath || '',
    dataPath: record.dataPath || '',
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    metadata: record.metadata && typeof record.metadata === 'object' ? { ...record.metadata } : {}
  };
}

/**
 * Creates CRUD functions for browser-local File System Access folder handles.
 *
 * @param {object} adapter Minimal record adapter.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} Project folder handle store.
 */
export function createProjectFolderHandleStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async storeProjectFolderHandleRecord(record) {
      const normalized = normalizeProjectFolderHandleRecord(record, { now });
      await adapter.put(normalized.handleId, normalized);
      return normalized;
    },
    async readProjectFolderHandleRecord(handleId) {
      const record = await adapter.get(handleId);
      return record ? normalizeProjectFolderHandleRecord(record, { now }) : null;
    },
    async listProjectFolderHandleRecords(filter = {}) {
      const records = (await adapter.list()).map((record) => normalizeProjectFolderHandleRecord(record, { now }));
      return records
        .filter((record) => filter.projectId === undefined ? true : record.projectId === filter.projectId)
        .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)) * -1);
    },
    async updateProjectFolderHandleRecord(handleId, patch) {
      const existing = await adapter.get(handleId);
      if (!existing) throw new StorageError(`Project folder handle not found: ${handleId}`, { code: 'PROJECT_FOLDER_HANDLE_NOT_FOUND' });
      const updated = normalizeProjectFolderHandleRecord({
        ...existing,
        ...patch,
        handleId,
        updatedAt: nowIso(now)
      }, { now });
      await adapter.put(handleId, updated);
      return updated;
    },
    async deleteProjectFolderHandleRecord(handleId) {
      return adapter.delete(handleId);
    }
  };
}
