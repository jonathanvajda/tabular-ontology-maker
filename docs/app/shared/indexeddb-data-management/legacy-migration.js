import { inspectIndexedDbDatabase, resolveIdbRequest } from './indexeddb-adapter.js';
import { createScopedSettingKey, normalizeQuadRow, normalizeSettingRecord } from './records.js';
import { StorageError } from './storage-error.js';

/**
 * Inspects whether a legacy IndexedDB database is present.
 *
 * @param {string} legacyDbName Legacy database name.
 * @param {object} [options]
 * @param {IDBFactory} [options.indexedDBRef=globalThis.indexedDB] IndexedDB factory.
 * @returns {Promise<object>} Legacy database status.
 */
export async function inspectLegacyIndexedDbDatabase(legacyDbName, options = {}) {
  return inspectIndexedDbDatabase(legacyDbName, options);
}

/**
 * Reads every row from a legacy object store without mutating it.
 *
 * @param {string} legacyDbName Legacy database name.
 * @param {string} storeName Object store name.
 * @param {object} [options]
 * @param {IDBFactory} [options.indexedDBRef=globalThis.indexedDB] IndexedDB factory.
 * @returns {Promise<object[]>} Store rows.
 */
export async function readLegacyObjectStoreRows(legacyDbName, storeName, { indexedDBRef = globalThis.indexedDB } = {}) {
  if (!indexedDBRef || typeof indexedDBRef.open !== 'function') {
    throw new StorageError('IndexedDB is not available for legacy migration.', { code: 'INDEXEDDB_UNAVAILABLE' });
  }
  const db = await resolveIdbRequest(indexedDBRef.open(legacyDbName));
  try {
    if (!db.objectStoreNames?.contains?.(storeName)) return [];
    const tx = db.transaction(storeName, 'readonly');
    const rows = await resolveIdbRequest(tx.objectStore(storeName).getAll());
    return rows || [];
  } finally {
    db.close?.();
  }
}

/**
 * Converts Axiolotl legacy triple rows to canonical QuadRows.
 *
 * @param {object[]} rows Legacy rows from `inferenceDB.triples`.
 * @param {object} options
 * @param {string|null} [options.projectId=null] Target project id.
 * @param {string|null} [options.graphId=null] Target graph id.
 * @param {string|null} [options.artifactId=null] Source artifact id.
 * @returns {object[]} Canonical QuadRows.
 */
export function convertLegacyTripleRowsToQuadRows(rows, {
  projectId = null,
  graphId = null,
  artifactId = null
} = {}) {
  return (rows || []).map((row) => normalizeQuadRow({
    projectId: row.projectId || projectId,
    graphId: row.graphId || graphId,
    artifactId: row.artifactId || artifactId,
    subject: row.subject ?? row.s,
    subjectType: row.subjectType ?? row.sType,
    predicate: row.predicate ?? row.p,
    predicateType: row.predicateType ?? row.pType,
    object: row.object ?? row.o,
    objectType: row.objectType ?? row.oType,
    objectLang: row.objectLang ?? row.lang,
    objectDatatype: row.objectDatatype ?? row.datatype,
    graph: row.graph ?? row.g ?? ''
  }));
}

/**
 * Converts app-local key/value setting rows into canonical SettingRecords.
 *
 * @param {object[]} rows Legacy setting rows.
 * @param {object} options
 * @param {string} options.scope Target canonical scope.
 * @param {string} [options.appId=''] Source app id.
 * @returns {object[]} Canonical SettingRecords.
 */
export function convertLegacySettingsToSettingRecords(rows, { scope, appId = '' } = {}) {
  return (rows || []).map((row) => normalizeSettingRecord({
    settingId: row.settingId || createScopedSettingKey(scope, row.key),
    scope,
    key: row.key,
    value: row.value,
    appId,
    metadata: {
      migratedFrom: row
    }
  }));
}

/**
 * Creates a non-destructive migration report for UI review before writes or
 * legacy database deletion.
 *
 * @param {object} input Migration draft.
 * @param {string} input.sourceApp Source app id.
 * @param {string[]} [input.legacyDatabases=[]] Legacy database names.
 * @param {object[]} [input.projects=[]] Project records to create.
 * @param {object[]} [input.artifacts=[]] Artifact records to create.
 * @param {object[]} [input.graphs=[]] Graph records to create.
 * @param {object[]} [input.quadRows=[]] Quad rows to create.
 * @param {object[]} [input.settings=[]] Setting records to create.
 * @param {object[]} [input.runs=[]] Run records to create.
 * @returns {object} Migration report.
 */
export function createLegacyMigrationReport({
  sourceApp,
  legacyDatabases = [],
  projects = [],
  artifacts = [],
  graphs = [],
  quadRows = [],
  settings = [],
  runs = []
}) {
  return {
    sourceApp: sourceApp || 'unknown',
    legacyDatabases: [...legacyDatabases],
    counts: {
      projects: projects.length,
      artifacts: artifacts.length,
      graphs: graphs.length,
      quadRows: quadRows.length,
      settings: settings.length,
      runs: runs.length
    },
    destructiveActions: [],
    requiresUserConfirmation: true
  };
}
