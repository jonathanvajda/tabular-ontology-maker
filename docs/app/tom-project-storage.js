// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
  createProjectPortfolioStores,
  ensureProjectPortfolioProject,
  inspectLegacyIndexedDbDatabase,
  openProjectPortfolioDatabase,
  readLegacyObjectStoreRows,
  storeProjectArtifactData,
  storeProjectRunData
} from './shared/indexeddb-data-management/index.js';

const TOM_LEGACY_DB_NAME = 'TabularOntologyDB';
const TOM_LEGACY_RDF_STORE = 'rdfStore';
const TOM_LEGACY_WORKSPACE_STORE = 'workspaceStore';
const TOM_LEGACY_SETTINGS_STORE = 'ontologySettingsStore';

const TOM_APP_ID = 'tabular-ontology-maker';
const TOM_PROJECT_LABEL = 'Default Cross-App Workspace';
const TOM_WORKSPACE_ARTIFACT_KIND = 'tom-workspace-snapshot';
const TOM_RDF_ARTIFACT_KIND = 'ontology-rdf';
const TOM_SETTINGS_KEY = 'ontologySettings';

let portfolioPromise = null;

/**
 * Clears the cached project store connection for deterministic tests.
 *
 * @returns {void}
 */
export function resetTomProjectStorageForTests() {
  portfolioPromise = null;
}

/**
 * Opens the shared project portfolio stores for TOM's active project.
 *
 * @returns {Promise<object>} Shared portfolio stores.
 */
export async function openTomProjectStores() {
  if (!portfolioPromise) {
    portfolioPromise = openProjectPortfolioDatabase()
      .then(async (db) => {
        const stores = createProjectPortfolioStores(db, {
          projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID
        });
        await ensureProjectPortfolioProject(stores, {
          projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
          label: TOM_PROJECT_LABEL,
          tags: ['cross-app', TOM_APP_ID]
        });
        return stores;
      });
  }
  return portfolioPromise;
}

/**
 * Reads TOM ontology settings from the shared project settings store, falling
 * back to the legacy TOM IndexedDB store for existing users.
 *
 * @returns {Promise<object|null>} Stored settings or null.
 */
export async function readTomOntologySettings() {
  const stores = await openTomProjectStores();
  const sharedValue = await stores.settings.readSettingValue(TOM_SETTINGS_KEY, null);
  if (sharedValue) return sharedValue;
  const legacy = await readLegacyOntologySettings();
  if (!legacy) return null;
  await writeTomOntologySettings(legacy, { migratedFromLegacy: true });
  return legacy;
}

/**
 * Writes TOM ontology settings to the shared project settings store.
 *
 * @param {object} settings Ontology settings.
 * @param {object} [options]
 * @returns {Promise<object>} Stored settings.
 */
export async function writeTomOntologySettings(settings, { migratedFromLegacy = false } = {}) {
  const stores = await openTomProjectStores();
  await stores.settings.storeSettingRecord({
    scope: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    key: TOM_SETTINGS_KEY,
    value: settings,
    appId: TOM_APP_ID,
    metadata: migratedFromLegacy
      ? { migratedFrom: { databaseName: TOM_LEGACY_DB_NAME, storeName: TOM_LEGACY_SETTINGS_STORE } }
      : {}
  });
  return settings;
}

/**
 * Deletes TOM ontology settings from the shared project settings store.
 *
 * @returns {Promise<boolean>} Delete result.
 */
export async function deleteTomOntologySettings() {
  const stores = await openTomProjectStores();
  return stores.settings.deleteSettingRecord(TOM_SETTINGS_KEY);
}

/**
 * Stores a TOM authoring session as project artifacts plus a run record.
 *
 * @param {object} input Session data.
 * @param {object} input.workspaceSnapshot Normalized TOM workspace snapshot.
 * @param {string} input.rdfString Generated RDF serialization.
 * @param {string} input.format RDF format key.
 * @param {string} [input.timestamp] Session timestamp.
 * @returns {Promise<object>} Stored artifact/run metadata.
 */
export async function storeTomAuthoringSession({
  workspaceSnapshot,
  rdfString,
  format,
  timestamp = new Date().toISOString()
}) {
  const stores = await openTomProjectStores();
  const workspaceArtifact = await storeProjectArtifactData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    artifactKind: TOM_WORKSPACE_ARTIFACT_KIND,
    role: 'staged',
    label: 'TOM workspace snapshot',
    mediaType: 'application/ld+json',
    extension: 'jsonld',
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      appId: TOM_APP_ID
    },
    summary: {
      rowCount: Array.isArray(workspaceSnapshot?.rows) ? workspaceSnapshot.rows.length : 0,
      predicateCount: Array.isArray(workspaceSnapshot?.predicates) ? workspaceSnapshot.predicates.length : 0
    }
  }, workspaceSnapshot);
  const rdfArtifact = await storeProjectArtifactData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    artifactKind: TOM_RDF_ARTIFACT_KIND,
    role: 'generated',
    label: `TOM generated ontology.${format || 'ttl'}`,
    mediaType: mediaTypeForRdfFormat(format),
    extension: extensionForRdfFormat(format),
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      appId: TOM_APP_ID
    },
    provenance: {
      derivedFrom: [workspaceArtifact.artifactId]
    },
    summary: {
      format: format || 'ttl',
      byteLength: String(rdfString || '').length
    }
  }, {
    rdfData: rdfString,
    format,
    timestamp
  });
  const run = await storeProjectRunData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    runKind: 'tom-save-session',
    label: 'TOM save session',
    createdAt: timestamp,
    updatedAt: timestamp,
    inputArtifactIds: [workspaceArtifact.artifactId],
    outputArtifactIds: [rdfArtifact.artifactId],
    metadata: {
      appId: TOM_APP_ID
    }
  });
  return {
    workspaceArtifact,
    rdfArtifact,
    run
  };
}

/**
 * Reports whether a TOM session exists in shared project storage or legacy TOM
 * storage.
 *
 * @returns {Promise<boolean>} True when a reloadable session exists.
 */
export async function hasTomSavedSession() {
  const latest = await readLatestTomSavedSession();
  return !!(latest.latestWorkspace || latest.latestRdfRecord);
}

/**
 * Reads the newest TOM workspace/RDF session from shared storage, then falls
 * back to read-only legacy TOM IndexedDB data for existing browser sessions.
 *
 * @returns {Promise<{latestWorkspace: object|null, latestRdfRecord: object|null, source: string}>}
 */
export async function readLatestTomSavedSession() {
  const shared = await readLatestSharedTomSession();
  if (shared.latestWorkspace || shared.latestRdfRecord) return shared;
  return readLatestLegacyTomSession();
}

async function readLatestSharedTomSession() {
  const stores = await openTomProjectStores();
  const [workspaceArtifacts, rdfArtifacts] = await Promise.all([
    stores.artifacts.listProjectArtifacts(DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID, {
      artifactKind: TOM_WORKSPACE_ARTIFACT_KIND
    }),
    stores.artifacts.listProjectArtifacts(DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID, {
      artifactKind: TOM_RDF_ARTIFACT_KIND
    })
  ]);
  const latestWorkspaceArtifact = selectLatestArtifact(workspaceArtifacts);
  const latestRdfArtifact = selectLatestArtifact(rdfArtifacts);
  return {
    latestWorkspace: latestWorkspaceArtifact?.payload || null,
    latestRdfRecord: normalizeSharedRdfPayload(latestRdfArtifact),
    source: 'shared-project-portfolio'
  };
}

async function readLatestLegacyTomSession() {
  const status = await inspectLegacyIndexedDbDatabase(TOM_LEGACY_DB_NAME);
  if (!status.exists) {
    return { latestWorkspace: null, latestRdfRecord: null, source: 'legacy-indexeddb' };
  }
  const [workspaceRows, rdfRows] = await Promise.all([
    safeReadLegacyRows(TOM_LEGACY_WORKSPACE_STORE),
    safeReadLegacyRows(TOM_LEGACY_RDF_STORE)
  ]);
  return {
    latestWorkspace: selectLatestLegacyRecord(workspaceRows),
    latestRdfRecord: selectLatestLegacyRecord(rdfRows),
    source: 'legacy-indexeddb'
  };
}

async function readLegacyOntologySettings() {
  const status = await inspectLegacyIndexedDbDatabase(TOM_LEGACY_DB_NAME);
  if (!status.exists) return null;
  const rows = await safeReadLegacyRows(TOM_LEGACY_SETTINGS_STORE);
  const record = rows.find((row) => row?.key === TOM_SETTINGS_KEY);
  return record?.value || null;
}

async function safeReadLegacyRows(storeName) {
  try {
    return await readLegacyObjectStoreRows(TOM_LEGACY_DB_NAME, storeName);
  } catch {
    return [];
  }
}

function selectLatestArtifact(artifacts) {
  return (Array.isArray(artifacts) ? artifacts : []).reduce((latest, current) => {
    if (!latest) return current;
    return recordTime(current) >= recordTime(latest) ? current : latest;
  }, null);
}

function selectLatestLegacyRecord(records) {
  return (Array.isArray(records) ? records : []).reduce((latest, current) => {
    if (!latest) return current;
    return recordTime(current) >= recordTime(latest) ? current : latest;
  }, null);
}

function recordTime(record) {
  const parsed = Date.parse(record?.updatedAt || record?.timestamp || record?.createdAt || '');
  if (Number.isFinite(parsed)) return parsed;
  return typeof record?.id === 'number' ? record.id : -1;
}

function normalizeSharedRdfPayload(artifact) {
  if (!artifact) return null;
  const payload = artifact.payload;
  if (payload && typeof payload === 'object' && typeof payload.rdfData === 'string') return payload;
  return {
    rdfData: typeof payload === 'string' ? payload : '',
    format: artifact.summary?.format || artifact.extension || 'ttl',
    timestamp: artifact.updatedAt || artifact.createdAt || ''
  };
}

function mediaTypeForRdfFormat(format) {
  switch (String(format || '').toLowerCase()) {
    case 'jsonld':
      return 'application/ld+json';
    case 'rdf':
    case 'xml':
      return 'application/rdf+xml';
    case 'nt':
      return 'application/n-triples';
    case 'nquads':
    case 'nq':
      return 'application/n-quads';
    case 'trig':
      return 'application/trig';
    case 'ttl':
    default:
      return 'text/turtle';
  }
}

function extensionForRdfFormat(format) {
  switch (String(format || '').toLowerCase()) {
    case 'jsonld':
      return 'jsonld';
    case 'rdf':
    case 'xml':
      return 'rdf';
    case 'nt':
      return 'nt';
    case 'nquads':
    case 'nq':
      return 'nq';
    case 'trig':
      return 'trig';
    case 'ttl':
    default:
      return 'ttl';
  }
}
