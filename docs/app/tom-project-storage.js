// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
  PROJECT_RECORD_JSONLD_CONTEXT,
  createProjectPortfolioStores,
  ensureProjectPortfolioProject,
  inspectLegacyIndexedDbDatabase,
  openProjectPortfolioDatabase,
  readLegacyObjectStoreRows,
  storeProjectArtifactData,
  storeProjectRunData
} from './shared/indexeddb-data-management/index.js';
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/index.js';
import {
  getMimeTypeForFormatKey,
  getPreferredExtensionForMimeType
} from './shared/format-registry/index.js';
import {
  ONTOLOGY_METADATA_PROFILE_SETTING_KEY,
  createOntologySettingsViewFromMetadataRecord,
  normalizeOntologyMetadataRecord
} from './shared/ontology-metadata/index.js';

const TOM_LEGACY_DB_NAME = 'TabularOntologyDB';
const TOM_LEGACY_RDF_STORE = 'rdfStore';
const TOM_LEGACY_WORKSPACE_STORE = 'workspaceStore';
const TOM_LEGACY_SETTINGS_STORE = 'ontologySettingsStore';

const TOM_APP_ID = 'tabular-ontology-maker';
const TOM_PROJECT_LABEL = 'Default Cross-App Workspace';
const TOM_WORKSPACE_ARTIFACT_KIND = 'tom-workspace-snapshot';
const TOM_RDF_ARTIFACT_KIND = 'ontology-rdf';
const TOM_LEGACY_SETTINGS_KEY = 'ontologySettings';
const TOM_SETTINGS_KEY = ONTOLOGY_METADATA_PROFILE_SETTING_KEY;
const JSON_LD_FORMAT_KEY = 'jsonLd';

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
  if (sharedValue) return readTomSettingsFromJsonLd(sharedValue);
  const legacySharedValue = await stores.settings.readSettingValue(TOM_LEGACY_SETTINGS_KEY, null);
  if (legacySharedValue) {
    const migrated = readTomSettingsFromJsonLd(legacySharedValue);
    await writeTomOntologySettings(migrated, { migratedFromLegacy: true });
    await stores.settings.deleteSettingRecord(TOM_LEGACY_SETTINGS_KEY);
    return migrated;
  }
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
  const metadataRecord = normalizeOntologyMetadataRecord(settings);
  await stores.settings.storeSettingRecord({
    scope: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    key: TOM_SETTINGS_KEY,
    value: convertTomSettingsToJsonLd(metadataRecord),
    appId: TOM_APP_ID,
    metadata: migratedFromLegacy
      ? {
        [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
        migratedFrom: { databaseName: TOM_LEGACY_DB_NAME, storeName: TOM_LEGACY_SETTINGS_STORE }
      }
      : {}
  });
  return createOntologySettingsViewFromMetadataRecord(metadataRecord);
}

/**
 * Deletes TOM ontology settings from the shared project settings store.
 *
 * @returns {Promise<boolean>} Delete result.
 */
export async function deleteTomOntologySettings() {
  const stores = await openTomProjectStores();
  const deleted = await stores.settings.deleteSettingRecord(TOM_SETTINGS_KEY);
  await stores.settings.deleteSettingRecord(TOM_LEGACY_SETTINGS_KEY);
  return deleted;
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
  const workspaceArtifact = await storeTomWorkspaceSnapshot(stores, workspaceSnapshot, {
    timestamp,
    source: createTomSourceMetadata()
  });
  const rdfArtifact = await storeTomGeneratedRdfArtifact(stores, {
    rdfData: rdfString,
    format,
    timestamp
  }, {
    timestamp,
    workspaceArtifactId: workspaceArtifact.artifactId,
    source: createTomSourceMetadata()
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
      [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID
    }
  });
  return {
    workspaceArtifact,
    rdfArtifact,
    run
  };
}

/**
 * Stores a TOM workspace snapshot as a staged project artifact.
 *
 * TOM's grid/session shape remains app-owned. The shared portfolio owns only
 * artifact identity, project scope, timestamps, source metadata, and payload
 * persistence.
 *
 * @param {object} stores Shared project portfolio stores.
 * @param {object} workspaceSnapshot TOM workspace snapshot payload.
 * @param {object} [options]
 * @param {string} [options.timestamp] Storage timestamp.
 * @param {object} [options.source] Artifact source metadata.
 * @returns {Promise<object>} Stored workspace artifact metadata.
 */
export function storeTomWorkspaceSnapshot(stores, workspaceSnapshot, {
  timestamp = new Date().toISOString(),
  source = createTomSourceMetadata()
} = {}) {
  const formatDetails = resolveJsonLdFormatDetails();
  return storeProjectArtifactData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    artifactKind: TOM_WORKSPACE_ARTIFACT_KIND,
    role: 'staged',
    label: 'TOM workspace snapshot',
    mediaType: formatDetails.mediaType,
    extension: formatDetails.extension,
    createdAt: timestamp,
    updatedAt: timestamp,
    source,
    summary: {
      [COMMON_NAMESPACE_IRIS.okea.documentCount]: Array.isArray(workspaceSnapshot?.rows) ? workspaceSnapshot.rows.length : 0,
      [COMMON_NAMESPACE_IRIS.okea.metadata]: {
        predicateCount: Array.isArray(workspaceSnapshot?.predicates) ? workspaceSnapshot.predicates.length : 0
      }
    }
  }, convertTomWorkspaceSnapshotToJsonLd(workspaceSnapshot, { timestamp }));
}

/**
 * Stores a generated TOM ontology RDF serialization as a project artifact.
 *
 * @param {object} stores Shared project portfolio stores.
 * @param {object} rdfRecord RDF payload with `rdfData` and `format`.
 * @param {object} [options]
 * @param {string} [options.timestamp] Storage timestamp.
 * @param {string} [options.workspaceArtifactId] Source workspace artifact id.
 * @param {object} [options.source] Artifact source metadata.
 * @returns {Promise<object>} Stored RDF artifact metadata.
 */
export function storeTomGeneratedRdfArtifact(stores, rdfRecord, {
  timestamp = new Date().toISOString(),
  workspaceArtifactId = '',
  source = createTomSourceMetadata()
} = {}) {
  const formatDetails = resolveRdfFormatDetails(rdfRecord?.format);
  const payloadFormat = rdfRecord?.format || formatDetails.format;
  return storeProjectArtifactData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    artifactKind: TOM_RDF_ARTIFACT_KIND,
    role: 'generated',
    label: `TOM generated ontology.${formatDetails.extension}`,
    mediaType: formatDetails.mediaType,
    extension: formatDetails.extension,
    createdAt: timestamp,
    updatedAt: timestamp,
    source,
    provenance: {
      derivedFrom: workspaceArtifactId ? [workspaceArtifactId] : []
    },
    summary: {
      [COMMON_NAMESPACE_IRIS.dcterms.format]: payloadFormat,
      [COMMON_NAMESPACE_IRIS.okea.metadata]: {
        byteLength: String(rdfRecord?.rdfData || '').length
      }
    }
  }, convertTomRdfPayloadToJsonLd({
    rdfData: rdfRecord?.rdfData || '',
    format: payloadFormat,
    timestamp
  }));
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
  const legacy = await readLatestLegacyTomSession();
  if (!legacy.latestWorkspace && !legacy.latestRdfRecord) return legacy;
  return migrateLegacyTomSessionToProjectStorage(legacy);
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
    latestWorkspace: readTomWorkspaceSnapshotFromJsonLd(latestWorkspaceArtifact?.payload) || null,
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

/**
 * Copies the latest legacy TOM session into the shared project portfolio.
 *
 * This intentionally does not delete `TabularOntologyDB`; deletion requires a
 * separate user-confirmed cleanup after manual export/restore validation.
 *
 * @param {{latestWorkspace: object|null, latestRdfRecord: object|null}} legacySession Latest legacy data.
 * @returns {Promise<{latestWorkspace: object|null, latestRdfRecord: object|null, source: string}>}
 */
export async function migrateLegacyTomSessionToProjectStorage(legacySession) {
  const stores = await openTomProjectStores();
  const timestamp = latestSessionTimestamp(legacySession);
  const migratedSource = {
    [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
    origin: 'legacy-migration',
    databaseName: TOM_LEGACY_DB_NAME
  };
  const workspaceArtifact = legacySession.latestWorkspace
    ? await storeTomWorkspaceSnapshot(stores, legacySession.latestWorkspace, {
      timestamp,
      source: { ...migratedSource, storeName: TOM_LEGACY_WORKSPACE_STORE }
    })
    : null;
  const rdfArtifact = legacySession.latestRdfRecord
    ? await storeTomGeneratedRdfArtifact(stores, legacySession.latestRdfRecord, {
      timestamp,
      workspaceArtifactId: workspaceArtifact?.artifactId || '',
      source: { ...migratedSource, storeName: TOM_LEGACY_RDF_STORE }
    })
    : null;
  await storeProjectRunData(stores, {
    projectId: DEFAULT_PROJECT_PORTFOLIO_PROJECT_ID,
    runKind: 'migration',
    label: 'Migrate TOM legacy session',
    createdAt: timestamp,
    updatedAt: timestamp,
    inputArtifactIds: [],
    outputArtifactIds: [workspaceArtifact?.artifactId, rdfArtifact?.artifactId].filter(Boolean),
    metadata: {
      [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
      migratedFrom: {
        databaseName: TOM_LEGACY_DB_NAME,
        stores: [TOM_LEGACY_WORKSPACE_STORE, TOM_LEGACY_RDF_STORE]
      }
    }
  });
  return {
    latestWorkspace: legacySession.latestWorkspace || null,
    latestRdfRecord: normalizeSharedRdfPayload(rdfArtifact ? { ...rdfArtifact, payload: legacySession.latestRdfRecord } : null),
    source: 'legacy-migrated-to-shared-project-portfolio'
  };
}

async function readLegacyOntologySettings() {
  const status = await inspectLegacyIndexedDbDatabase(TOM_LEGACY_DB_NAME);
  if (!status.exists) return null;
  const rows = await safeReadLegacyRows(TOM_LEGACY_SETTINGS_STORE);
  const record = rows.find((row) => row?.key === TOM_LEGACY_SETTINGS_KEY || row?.key === TOM_SETTINGS_KEY);
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
  const payload = readTomRdfPayloadFromJsonLd(artifact.payload) || artifact.payload;
  if (payload && typeof payload === 'object' && typeof payload.rdfData === 'string') return payload;
  return {
    rdfData: typeof payload === 'string' ? payload : '',
    format: artifact.summary?.[COMMON_NAMESPACE_IRIS.dcterms.format] || artifact.summary?.format || artifact.extension || 'ttl',
    timestamp: artifact.updatedAt || artifact.createdAt || ''
  };
}

function latestSessionTimestamp(session) {
  const candidates = [session?.latestWorkspace, session?.latestRdfRecord]
    .map((record) => record?.updatedAt || record?.timestamp || record?.createdAt)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return candidates[0] || new Date().toISOString();
}

function resolveRdfFormatDetails(format) {
  const result = getMimeTypeForFormatKey(format || 'turtle');
  const descriptor = result.ok ? result.value : getMimeTypeForFormatKey('turtle').value;
  const extension = getPreferredExtensionForMimeType(descriptor.mimeType);
  return {
    format: descriptor.id,
    mediaType: descriptor.mimeType,
    extension: extension.ok ? extension.value : descriptor.extensions[0]
  };
}

function resolveJsonLdFormatDetails() {
  const result = getMimeTypeForFormatKey(JSON_LD_FORMAT_KEY);
  const descriptor = result.ok ? result.value : getMimeTypeForFormatKey('json').value;
  const extension = getPreferredExtensionForMimeType(descriptor.mimeType);
  return {
    mediaType: descriptor.mimeType,
    extension: extension.ok ? extension.value : descriptor.extensions[0]
  };
}

function createTomSourceMetadata() {
  return { [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID };
}

function createJsonLdStringLiteral(value) {
  return { '@value': String(value ?? ''), '@type': COMMON_NAMESPACE_IRIS.xsd.string };
}

function createJsonLdDateTimeLiteral(value) {
  return { '@value': value, '@type': COMMON_NAMESPACE_IRIS.xsd.dateTime };
}

function convertTomSettingsToJsonLd(settings) {
  const metadataRecord = normalizeOntologyMetadataRecord(settings);
  return {
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@type': COMMON_NAMESPACE_IRIS.okea.Setting,
    [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
    [COMMON_NAMESPACE_IRIS.okea.settingKey]: TOM_SETTINGS_KEY,
    [COMMON_NAMESPACE_IRIS.rdf.value]: metadataRecord
  };
}

function readTomSettingsFromJsonLd(value) {
  if (value && typeof value === 'object' && COMMON_NAMESPACE_IRIS.rdf.value in value) {
    return createOntologySettingsViewFromMetadataRecord(normalizeOntologyMetadataRecord(value[COMMON_NAMESPACE_IRIS.rdf.value])) || null;
  }
  return createOntologySettingsViewFromMetadataRecord(normalizeOntologyMetadataRecord(value)) || value;
}

function convertTomWorkspaceSnapshotToJsonLd(workspaceSnapshot, { timestamp = new Date().toISOString() } = {}) {
  return {
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@type': COMMON_NAMESPACE_IRIS.cco2.informationContentEntity,
    [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
    [COMMON_NAMESPACE_IRIS.okea.artifactKind]: TOM_WORKSPACE_ARTIFACT_KIND,
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createJsonLdDateTimeLiteral(timestamp),
    [COMMON_NAMESPACE_IRIS.rdf.value]: workspaceSnapshot || {}
  };
}

function readTomWorkspaceSnapshotFromJsonLd(value) {
  if (value && typeof value === 'object' && COMMON_NAMESPACE_IRIS.rdf.value in value) {
    return value[COMMON_NAMESPACE_IRIS.rdf.value] || null;
  }
  return value || null;
}

function convertTomRdfPayloadToJsonLd(rdfRecord) {
  return {
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@type': COMMON_NAMESPACE_IRIS.cco2.informationContentEntity,
    [COMMON_NAMESPACE_IRIS.okea.appId]: TOM_APP_ID,
    [COMMON_NAMESPACE_IRIS.okea.artifactKind]: TOM_RDF_ARTIFACT_KIND,
    [COMMON_NAMESPACE_IRIS.dcterms.format]: rdfRecord.format,
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createJsonLdDateTimeLiteral(rdfRecord.timestamp || new Date().toISOString()),
    [COMMON_NAMESPACE_IRIS.rdf.value]: createJsonLdStringLiteral(rdfRecord.rdfData || '')
  };
}

function readTomRdfPayloadFromJsonLd(value) {
  if (!value || typeof value !== 'object' || !(COMMON_NAMESPACE_IRIS.rdf.value in value)) return null;
  const textValue = value[COMMON_NAMESPACE_IRIS.rdf.value];
  return {
    rdfData: textValue && typeof textValue === 'object' && '@value' in textValue ? textValue['@value'] : String(textValue ?? ''),
    format: value[COMMON_NAMESPACE_IRIS.dcterms.format] || 'turtle',
    timestamp: value[COMMON_NAMESPACE_IRIS.dcterms.modified]?.['@value'] || ''
  };
}
