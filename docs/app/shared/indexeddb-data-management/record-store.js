import { createScopedSettingKey, normalizeArtifactRecord, normalizeDatasetRecord, normalizeGraphRecord, normalizeProjectRecord, normalizeQuadRow, normalizeRunRecord, normalizeSettingRecord, normalizeWorkspaceInclusionRecord } from './records.js';
import { resolveIdbRequest, runObjectStoreTransaction } from './indexeddb-adapter.js';
import { StorageError } from './storage-error.js';

function compareDescendingBy(field) {
  return (left, right) => String(right[field] || '').localeCompare(String(left[field] || ''));
}

function filterByProject(records, projectId) {
  return projectId ? records.filter((record) => record.projectId === projectId) : records;
}

function requireAdapter(adapter) {
  const required = ['get', 'put', 'delete', 'list'];
  for (const name of required) {
    if (!adapter || typeof adapter[name] !== 'function') {
      throw new StorageError(`Record store adapter must provide ${name}().`, { code: 'INVALID_RECORD_STORE_ADAPTER' });
    }
  }
}

/**
 * Create an in-memory key-value adapter with the same minimal interface used by
 * the store factories. This is useful for Jest, demos, and app migrations before
 * wiring a real IndexedDB object store.
 *
 * @param {Iterable<[string, object]>} [entries] Initial records.
 * @returns {object} Minimal async record adapter.
 */
export function createMemoryRecordAdapter(entries = []) {
  const map = new Map(entries);
  return {
    async get(key) {
      return map.get(key) || null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      return map.delete(key);
    },
    async clear() {
      map.clear();
    },
    async list() {
      return [...map.values()];
    },
    snapshot() {
      return new Map(map);
    }
  };
}

/**
 * Create a minimal record adapter for one IndexedDB object store. The adapter
 * provides the `get`, `put`, `delete`, `list`, and `clear` methods consumed by
 * the project, artifact, dataset, settings, run, and quad store factories.
 *
 * @param {IDBDatabase} db Open IndexedDB database.
 * @param {string} storeName Object store name.
 * @param {object} [options]
 * @param {string} [options.keyPath] Key path used by the object store, if any.
 * @returns {object} Minimal async record adapter backed by IndexedDB.
 */
export function createIndexedDbRecordAdapter(db, storeName, { keyPath } = {}) {
  if (!storeName || typeof storeName !== 'string') {
    throw new StorageError('createIndexedDbRecordAdapter expected a store name.', { code: 'INVALID_STORE_NAME' });
  }
  return {
    async get(key) {
      return runObjectStoreTransaction(db, storeName, 'readonly', (store) => resolveIdbRequest(store.get(key)));
    },
    async put(key, value) {
      const record = keyPath && value && typeof value === 'object' && value[keyPath] === undefined
        ? { ...value, [keyPath]: key }
        : value;
      await runObjectStoreTransaction(db, storeName, 'readwrite', (store) => {
        const request = keyPath ? store.put(record) : store.put(record, key);
        return resolveIdbRequest(request);
      });
      return record;
    },
    async delete(key) {
      await runObjectStoreTransaction(db, storeName, 'readwrite', (store) => resolveIdbRequest(store.delete(key)));
      return true;
    },
    async clear() {
      await runObjectStoreTransaction(db, storeName, 'readwrite', (store) => resolveIdbRequest(store.clear()));
    },
    async list() {
      return runObjectStoreTransaction(db, storeName, 'readonly', (store) => resolveIdbRequest(store.getAll()));
    }
  };
}

/**
 * Create a project CRUD store over an injected record adapter.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Project store API.
 */
export function createProjectStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async createProject(record) {
      const normalized = normalizeProjectRecord(record, { now });
      await adapter.put(normalized.projectId, normalized);
      return normalized;
    },
    async updateProject(projectId, patch) {
      const existing = await adapter.get(projectId);
      if (!existing) throw new StorageError(`Project not found: ${projectId}`, { code: 'PROJECT_NOT_FOUND' });
      const updated = normalizeProjectRecord({ ...existing, ...patch, projectId, updatedAt: now?.() || new Date().toISOString() }, { now });
      await adapter.put(projectId, updated);
      return updated;
    },
    async listProjects({ limit } = {}) {
      const records = (await adapter.list()).map((record) => normalizeProjectRecord(record, { now }));
      const sorted = records.sort(compareDescendingBy('updatedAt'));
      return Number.isInteger(limit) ? sorted.slice(0, limit) : sorted;
    },
    async getProject(projectId) {
      const record = await adapter.get(projectId);
      return record ? normalizeProjectRecord(record, { now }) : null;
    },
    async deleteProject(projectId) {
      return adapter.delete(projectId);
    }
  };
}

/**
 * Create an artifact store where every artifact belongs to a project and may
 * optionally carry an opaque payload beside its metadata.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Artifact store API.
 */
export function createArtifactStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async storeProjectArtifact(record, payload = null) {
      const metadata = normalizeArtifactRecord(record, { now });
      await adapter.put(metadata.artifactId, { ...metadata, payload });
      return metadata;
    },
    async getProjectArtifact(artifactId, { includePayload = true } = {}) {
      const record = await adapter.get(artifactId);
      if (!record) return null;
      const normalized = normalizeArtifactRecord(record, { now });
      return includePayload ? { ...normalized, payload: record.payload ?? null } : normalized;
    },
    async listProjectArtifacts(projectId, filter = {}) {
      const records = (await adapter.list()).map((record) => ({ ...normalizeArtifactRecord(record, { now }), payload: record.payload ?? null }));
      return filterByProject(records, projectId)
        .filter((record) => !filter.artifactKind || record.artifactKind === filter.artifactKind)
        .filter((record) => !filter.role || record.role === filter.role)
        .sort(compareDescendingBy('updatedAt'))
        .map((record) => filter.includePayload === false ? normalizeArtifactRecord(record, { now }) : record);
    },
    async deleteProjectArtifact(artifactId) {
      return adapter.delete(artifactId);
    }
  };
}

/**
 * Create a dataset metadata store for preload/user dataset enablement.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Dataset store API.
 */
export function createDatasetStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async storeDatasetRecord(record) {
      const normalized = normalizeDatasetRecord(record, { now });
      await adapter.put(normalized.datasetId, normalized);
      return normalized;
    },
    async listDatasetRecords(projectId = null, filter = {}) {
      const records = (await adapter.list()).map((record) => normalizeDatasetRecord(record, { now }));
      return filterByProject(records, projectId)
        .filter((record) => filter.source ? record.source === filter.source : true)
        .filter((record) => filter.enabledOnly ? record.enabled : true)
        .sort(compareDescendingBy('updatedAt'));
    },
    async setDatasetEnabled(datasetId, enabled) {
      const existing = await adapter.get(datasetId);
      if (!existing) return null;
      const updated = normalizeDatasetRecord({ ...existing, enabled: !!enabled, updatedAt: now?.() || new Date().toISOString() }, { now });
      await adapter.put(datasetId, updated);
      return updated;
    },
    async deleteDataset(datasetId) {
      return adapter.delete(datasetId);
    }
  };
}

/**
 * Create a key-value settings store for app-scoped or project-scoped settings.
 * Use `scope` to separate global app settings from project settings without
 * inventing app-specific database schemas.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {string} [options.scope='app'] Scope prefix, typically `app` or a project id.
 * @returns {object} Settings store API.
 */
export function createSettingsStore(adapter, { scope = 'app:default', appId = '' } = {}) {
  requireAdapter(adapter);
  const keyFor = (key) => {
    try {
      return createScopedSettingKey(scope, key);
    } catch (error) {
      throw new StorageError('Setting key must be a non-empty string.', { code: 'INVALID_SETTING_KEY', cause: error });
    }
  };
  return {
    async readSettingValue(key, fallbackValue = null) {
      const record = await adapter.get(keyFor(key));
      return record ? record.value : fallbackValue;
    },
    async writeSettingValue(key, value) {
      const settingId = keyFor(key);
      const record = normalizeSettingRecord({ settingId, scope, key: String(key).trim(), value, appId });
      await adapter.put(settingId, record);
      return value;
    },
    async storeSettingRecord(record) {
      const normalized = normalizeSettingRecord({ appId, ...record });
      await adapter.put(normalized.settingId, normalized);
      return normalized;
    },
    async readSettingRecord(key) {
      const record = await adapter.get(keyFor(key));
      return record ? normalizeSettingRecord(record) : null;
    },
    async deleteSettingRecord(key) {
      return adapter.delete(keyFor(key));
    },
    async listSettingRecords() {
      return (await adapter.list())
        .filter((record) => record && record.scope === scope)
        .sort((left, right) => String(left.key).localeCompare(String(right.key)))
        .map((record) => normalizeSettingRecord(record));
    }
  };
}

/**
 * Create a run-history store for diagnostics, transformations, imports, query
 * executions, and other operation records.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Run store API.
 */
export function createRunRecordStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  const lastRunByScope = new Map();
  return {
    async storeRunRecord(record) {
      const normalized = normalizeRunRecord(record, { now });
      await adapter.put(normalized.runId, normalized);
      lastRunByScope.set(`${normalized.projectId || ''}::${normalized.runKind}`, normalized.runId);
      return normalized;
    },
    async listRunRecords({ projectId = null, runKind = null, limit } = {}) {
      const records = (await adapter.list()).map((record) => normalizeRunRecord(record, { now }));
      const filtered = filterByProject(records, projectId)
        .filter((record) => runKind ? record.runKind === runKind : true)
        .sort(compareDescendingBy('createdAt'));
      return Number.isInteger(limit) ? filtered.slice(0, limit) : filtered;
    },
    async getRunRecord(runId) {
      const record = await adapter.get(runId);
      return record ? normalizeRunRecord(record, { now }) : null;
    },
    async deleteRunRecord(runId) {
      return adapter.delete(runId);
    },
    getLastRunId(projectId, runKind) {
      return lastRunByScope.get(`${projectId || ''}::${runKind}`) || null;
    },
    setLastRunId(projectId, runKind, runId) {
      lastRunByScope.set(`${projectId || ''}::${runKind}`, runId);
      return runId;
    }
  };
}

/**
 * Create a workspace inclusion store. Inclusions explicitly connect a project
 * to reference datasets or project artifacts that should participate in the
 * active workspace graph.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Workspace inclusion store API.
 */
export function createWorkspaceInclusionStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async storeWorkspaceInclusion(record) {
      const normalized = normalizeWorkspaceInclusionRecord(record, { now });
      await adapter.put(normalized.inclusionId, normalized);
      return normalized;
    },
    async getWorkspaceInclusion(inclusionId) {
      const record = await adapter.get(inclusionId);
      return record ? normalizeWorkspaceInclusionRecord(record, { now }) : null;
    },
    async listWorkspaceInclusions(projectId, filter = {}) {
      const records = (await adapter.list()).map((record) => normalizeWorkspaceInclusionRecord(record, { now }));
      return filterByProject(records, projectId)
        .filter((record) => filter.enabledOnly ? record.enabled : true)
        .filter((record) => filter.targetType ? record.targetType === filter.targetType : true)
        .filter((record) => filter.role ? record.role === filter.role : true)
        .sort(compareDescendingBy('updatedAt'));
    },
    async setWorkspaceInclusionEnabled(inclusionId, enabled) {
      const existing = await adapter.get(inclusionId);
      if (!existing) return null;
      const updated = normalizeWorkspaceInclusionRecord({ ...existing, enabled: !!enabled, updatedAt: now?.() || new Date().toISOString() }, { now });
      await adapter.put(inclusionId, updated);
      return updated;
    },
    async deleteWorkspaceInclusion(inclusionId) {
      return adapter.delete(inclusionId);
    }
  };
}

/**
 * Create a graph metadata store for materialized RDF graphs.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Graph metadata store API.
 */
export function createGraphStore(adapter, { now } = {}) {
  requireAdapter(adapter);
  return {
    async storeGraphRecord(record) {
      const normalized = normalizeGraphRecord(record, { now });
      await adapter.put(normalized.graphId, normalized);
      return normalized;
    },
    async getGraphRecord(graphId) {
      const record = await adapter.get(graphId);
      return record ? normalizeGraphRecord(record, { now }) : null;
    },
    async listGraphRecords(projectId, filter = {}) {
      const records = (await adapter.list()).map((record) => normalizeGraphRecord(record, { now }));
      return filterByProject(records, projectId)
        .filter((record) => filter.graphIri === undefined ? true : record.graphIri === filter.graphIri)
        .filter((record) => filter.artifactId ? record.artifactId === filter.artifactId : true)
        .filter((record) => filter.role ? record.role === filter.role : true)
        .filter((record) => filter.materializationStatus ? record.materialization.status === filter.materializationStatus : true)
        .sort(compareDescendingBy('updatedAt'));
    },
    async updateGraphMaterialization(graphId, patch = {}) {
      const existing = await adapter.get(graphId);
      if (!existing) throw new StorageError(`Graph not found: ${graphId}`, { code: 'GRAPH_NOT_FOUND' });
      const updated = normalizeGraphRecord({
        ...existing,
        materialization: {
          ...(existing.materialization || {}),
          ...patch
        },
        updatedAt: now?.() || new Date().toISOString()
      }, { now });
      await adapter.put(graphId, updated);
      return updated;
    },
    async deleteGraphRecord(graphId) {
      return adapter.delete(graphId);
    }
  };
}

/**
 * Create a quad-row store with default-graph normalization.
 *
 * @param {object} adapter Minimal async adapter with get/put/delete/list.
 * @returns {object} Quad store API.
 */
export function createQuadRowStore(adapter) {
  requireAdapter(adapter);
  const keyFor = (row) => [
    row.projectId || '',
    row.graphId || '',
    row.subjectType,
    row.subject,
    row.predicateType,
    row.predicate,
    row.objectType,
    row.object,
    row.objectLang,
    row.objectDatatype,
    row.graph || ''
  ].join('\u001f');
  const api = {
    async upsertQuadRows(rows) {
      const normalizedRows = rows.map(normalizeQuadRow);
      for (const row of normalizedRows) await adapter.put(keyFor(row), row);
      return normalizedRows.length;
    },
    async listQuadRows(filter = {}) {
      return (await adapter.list())
        .map(normalizeQuadRow)
        .filter((row) => filter.projectId === undefined ? true : row.projectId === filter.projectId)
        .filter((row) => filter.graphId === undefined ? true : row.graphId === filter.graphId)
        .filter((row) => filter.artifactId === undefined ? true : row.artifactId === filter.artifactId)
        .filter((row) => filter.graph === undefined ? true : row.graph === filter.graph)
        .filter((row) => filter.graphIri === undefined ? true : row.graphIri === filter.graphIri)
        .filter((row) => filter.subject === undefined ? true : row.subject === filter.subject)
        .filter((row) => filter.predicate === undefined ? true : row.predicate === filter.predicate);
    },
    async listNamedGraphs(filter = {}) {
      const graphs = (await api.listQuadRows(filter)).map((row) => row.graph).filter(Boolean);
      return [...new Set(graphs)].sort();
    },
    async countQuadRows(filter = {}) {
      return (await api.listQuadRows(filter)).length;
    },
    async deleteQuadRows(rows) {
      let count = 0;
      for (const row of rows.map(normalizeQuadRow)) {
        if (await adapter.delete(keyFor(row))) count += 1;
      }
      return count;
    },
    async clearQuadRows(filter = {}) {
      if (Object.keys(filter).length === 0 && typeof adapter.clear === 'function') {
        const count = (await adapter.list()).length;
        await adapter.clear();
        return count;
      }
      const rows = await api.listQuadRows(filter);
      return api.deleteQuadRows(rows);
    }
  };
  return api;
}
