import {
  getFilenameExtension,
  getSupportedMimeTypeForFilename
} from '../format-registry/index.js';
import {
  createArtifactDownloadBlob,
  createArtifactDownloadFileName,
  resolveArtifactDownloadFormat
} from './project-export.js';
import {
  PROJECT_ARCHIVE_MANIFEST_FILE,
  createProjectExportManifest,
  normalizeProjectImportManifest
} from './project-manifest.js';
import { normalizeArtifactRecord } from './records.js';
import { createValidationError } from './storage-error.js';

export const PROJECT_FOLDER_SYNC_STATUSES = Object.freeze({
  synced: 'synced',
  folderNewer: 'folder-newer',
  indexedDbNewer: 'indexeddb-newer',
  conflict: 'conflict',
  discovered: 'discovered',
  missingFolderFile: 'missing-folder-file',
  missingIndexedDbRecord: 'missing-indexeddb-record',
  staleDerivedOutput: 'stale-derived-output'
});

const QUERY_KINDS = new Set(['sparql-query', 'sparql-update', 'sql-query', 'nosql-query']);
const REPORT_KINDS = new Set(['diagnostic-report']);
const DIAGRAM_KINDS = new Set(['mermaid-diagram']);
const MAPPING_KINDS = new Set(['iri-mapping-table', 'r2rml-mapping']);
const GRAPH_KINDS = new Set(['quad-rows']);
const GENERATED_ROLES = new Set(['generated', 'transformed', 'inferred', 'export']);

/**
 * Creates a stable project-folder path for an artifact using the shared format
 * registry and browser filename utilities through the artifact download helpers.
 *
 * @param {object} artifact Artifact metadata.
 * @param {object} [options]
 * @param {string} [options.artifactsRoot='artifacts'] Root artifact directory.
 * @returns {string} Project-relative folder path.
 */
export function createProjectArtifactFolderPath(artifact, { artifactsRoot = 'artifacts' } = {}) {
  const normalized = normalizeArtifactRecord({
    projectId: artifact?.projectId || 'project:folder-path',
    artifactKind: artifact?.artifactKind || 'artifact',
    label: artifact?.label || artifact?.artifactId || 'artifact',
    ...artifact
  });
  return `${artifactsRoot}/${selectArtifactFolderSegment(normalized)}/${createArtifactDownloadFileName(normalized)}`;
}

/**
 * Writes a project archive/import manifest into the selected project folder.
 *
 * @param {object} folderStore Project folder store from `createProjectFolderStore`.
 * @param {object} manifest Manifest object.
 * @param {object} [options]
 * @param {string} [options.path='project-manifest.json'] Manifest path.
 * @returns {Promise<object>} Write result.
 */
export async function writeProjectManifestToFolder(folderStore, manifest, { path = PROJECT_ARCHIVE_MANIFEST_FILE } = {}) {
  requireFolderStore(folderStore);
  await folderStore.writeProjectFileText(path, JSON.stringify(manifest, null, 2));
  return { path, manifest };
}

/**
 * Reads and validates a project manifest from the selected project folder.
 *
 * @param {object} folderStore Project folder store from `createProjectFolderStore`.
 * @param {object} [options]
 * @param {string} [options.path='project-manifest.json'] Manifest path.
 * @returns {Promise<object|null>} Normalized manifest, or null when absent.
 */
export async function readProjectManifestFromFolder(folderStore, { path = PROJECT_ARCHIVE_MANIFEST_FILE } = {}) {
  requireFolderStore(folderStore);
  try {
    const text = await folderStore.readProjectFileText(path);
    return normalizeProjectImportManifest(JSON.parse(text));
  } catch (error) {
    if (error?.code === 'PROJECT_FILE_SOURCE_NOT_FOUND') return null;
    throw error;
  }
}

/**
 * Creates a folder manifest for a project and its artifacts. Artifact files are
 * resolved from existing storage refs when present or from package path rules.
 *
 * @param {object} input Project records.
 * @param {object} input.project ProjectRecord.
 * @param {object[]} [input.artifacts=[]] ArtifactRecords.
 * @param {object[]} [input.runs=[]] RunRecords.
 * @param {object[]} [input.workspaceInclusions=[]] WorkspaceInclusionRecords.
 * @param {object[]} [input.settings=[]] SettingRecords.
 * @param {object} [options]
 * @returns {object} Project folder manifest.
 */
export function createProjectFolderManifest({
  project,
  artifacts = [],
  runs = [],
  workspaceInclusions = [],
  settings = []
}, options = {}) {
  const archiveFiles = artifacts.map((artifact) => ({
    path: artifact?.storageRef?.path || createProjectArtifactFolderPath(artifact),
    artifactId: artifact?.artifactId || null,
    artifactKind: artifact?.artifactKind || '',
    role: artifact?.role || '',
    mediaType: resolveArtifactDownloadFormat(artifact).mimeType,
    extension: resolveArtifactDownloadFormat(artifact).extension,
    size: artifact?.storageRef?.size ?? null,
    modified: artifact?.storageRef?.modified ?? null,
    syncStatus: artifact?.storageRef?.syncStatus || PROJECT_FOLDER_SYNC_STATUSES.synced
  }));
  return createProjectExportManifest({
    project,
    artifacts,
    runs,
    workspaceInclusions,
    settings
  }, {
    ...options,
    archiveFiles
  });
}

/**
 * Writes one artifact payload to its project-folder path and returns metadata
 * suitable for the artifact `storageRef`.
 *
 * @param {object} folderStore Project folder store.
 * @param {object} artifact Artifact metadata.
 * @param {unknown} [payload] Payload override. Defaults to artifact payload.
 * @param {object} [options]
 * @param {string} [options.path] Explicit project-relative path.
 * @param {() => string} [options.now] Clock function for sync timestamps.
 * @returns {Promise<{artifact: object, file: object}>} Updated artifact and file metadata.
 */
export async function writeProjectArtifactToFolder(folderStore, artifact, payload = artifact?.payload, { path, now = () => new Date().toISOString() } = {}) {
  requireFolderStore(folderStore);
  const targetPath = path || artifact?.storageRef?.path || createProjectArtifactFolderPath(artifact);
  const blob = createArtifactDownloadBlob({ ...artifact, payload });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await folderStore.writeProjectFileBytes(targetPath, bytes);
  const file = {
    path: targetPath,
    artifactId: artifact?.artifactId || null,
    artifactKind: artifact?.artifactKind || '',
    role: artifact?.role || '',
    mediaType: blob.type || resolveArtifactDownloadFormat(artifact).mimeType,
    extension: resolveArtifactDownloadFormat(artifact).extension,
    size: bytes.byteLength,
    modified: null,
    syncedAt: now(),
    syncStatus: PROJECT_FOLDER_SYNC_STATUSES.synced
  };
  return {
    artifact: {
      ...artifact,
      storageRef: {
        backend: 'file-system-access',
        path: targetPath,
        size: file.size,
        modified: file.modified,
        syncedAt: file.syncedAt,
        syncStatus: file.syncStatus
      }
    },
    file
  };
}

/**
 * Recursively scans a project folder and returns project-relative file entries.
 * Hidden entries are omitted by default, including the reserved `.app` folder.
 *
 * @param {object} folderStore Project folder store.
 * @param {object} [options]
 * @param {string} [options.path=''] Starting path.
 * @param {boolean} [options.recursive=true] Recurse into child directories.
 * @param {boolean} [options.includeHidden=false] Include dot-prefixed entries.
 * @returns {Promise<object[]>} Sorted folder file and directory entries.
 */
export async function scanProjectFolder(folderStore, { path = '', recursive = true, includeHidden = false } = {}) {
  requireFolderStore(folderStore);
  const entries = [];
  await scanInto(folderStore, normalizeScanPath(path), { recursive, includeHidden }, entries);
  return entries.sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: 'base' }));
}

/**
 * Compares folder files, manifest files, and IndexedDB artifact records without
 * mutating either storage backend.
 *
 * @param {object} input Reconciliation input.
 * @param {object|null} [input.manifest] Folder manifest.
 * @param {object[]} [input.artifacts=[]] IndexedDB artifact records.
 * @param {object[]} [input.folderEntries=[]] Results from `scanProjectFolder`.
 * @returns {object} Reconciliation summary.
 */
export function reconcileProjectFolderScan({ manifest = null, artifacts = [], folderEntries = [] } = {}) {
  const fileEntries = folderEntries.filter((entry) => entry.kind === 'file');
  const folderByPath = new Map(fileEntries.map((entry) => [entry.path, entry]));
  const artifactById = new Map(artifacts.filter((artifact) => artifact?.artifactId).map((artifact) => [artifact.artifactId, artifact]));
  const manifestFiles = normalizeManifestFiles(manifest);
  const knownPaths = new Set(manifestFiles.map((file) => file.path).filter(Boolean));
  for (const artifact of artifacts) {
    if (artifact?.storageRef?.path) knownPaths.add(artifact.storageRef.path);
  }

  const results = [];
  for (const artifact of artifacts) {
    const path = artifact?.storageRef?.path || manifestFiles.find((file) => file.artifactId === artifact.artifactId)?.path || '';
    if (!path) continue;
    const folderEntry = folderByPath.get(path);
    results.push(createArtifactSyncResult(artifact, path, folderEntry));
  }

  for (const file of manifestFiles) {
    if (file.artifactId && artifactById.has(file.artifactId)) continue;
    const folderEntry = folderByPath.get(file.path);
    results.push({
      status: folderEntry ? PROJECT_FOLDER_SYNC_STATUSES.missingIndexedDbRecord : PROJECT_FOLDER_SYNC_STATUSES.missingFolderFile,
      path: file.path,
      artifactId: file.artifactId || null,
      artifact: null,
      folderEntry: folderEntry || null,
      reason: folderEntry ? 'manifest-file-without-indexeddb-artifact' : 'manifest-file-not-found-in-folder'
    });
  }

  for (const entry of fileEntries) {
    if (!knownPaths.has(entry.path) && entry.path !== PROJECT_ARCHIVE_MANIFEST_FILE) {
      results.push({
        status: PROJECT_FOLDER_SYNC_STATUSES.discovered,
        path: entry.path,
        artifactId: null,
        artifact: null,
        folderEntry: entry,
        reason: 'folder-file-not-in-manifest-or-indexeddb'
      });
    }
  }

  return {
    results,
    counts: countByStatus(results)
  };
}

/**
 * Builds a normalized artifact record from a discovered folder file. The caller
 * still decides whether to store the record.
 *
 * @param {string} projectId Project id.
 * @param {object} folderEntry Folder scan entry.
 * @param {object} [options]
 * @param {string} [options.role='source'] Artifact role.
 * @param {() => string} [options.now] Clock function.
 * @returns {object} ArtifactRecord candidate with folder storageRef.
 */
export function createArtifactRecordFromProjectFolderFile(projectId, folderEntry, { role = 'source', now } = {}) {
  if (!folderEntry?.path) throw createValidationError('Folder entry path is required.');
  const descriptor = getSupportedMimeTypeForFilename(folderEntry.path);
  const extension = getFilenameExtension(folderEntry.path);
  return normalizeArtifactRecord({
    projectId,
    artifactKind: inferArtifactKindFromFolderFile(folderEntry.path),
    role,
    label: folderEntry.name || folderEntry.path.split('/').pop(),
    mediaType: descriptor.ok ? descriptor.value.mimeType : '',
    extension,
    source: {
      type: 'file-system-access',
      fileName: folderEntry.name || folderEntry.path
    },
    storageRef: {
      backend: 'file-system-access',
      path: folderEntry.path,
      size: folderEntry.size ?? null,
      modified: folderEntry.modified ?? null,
      syncedAt: null,
      syncStatus: PROJECT_FOLDER_SYNC_STATUSES.discovered
    }
  }, { now });
}

/**
 * Returns transformed/generated artifacts that should be marked stale because
 * one of their source artifacts changed.
 *
 * @param {object[]} artifacts Artifact records.
 * @param {Iterable<string>} changedArtifactIds Source artifact ids.
 * @returns {object[]} Updated stale artifact records.
 */
export function markDerivedProjectArtifactsStale(artifacts, changedArtifactIds) {
  const changed = new Set(changedArtifactIds);
  return artifacts
    .filter((artifact) => artifact?.provenance?.derivedFrom?.some((id) => changed.has(id)))
    .map((artifact) => ({
      ...artifact,
      storageRef: {
        ...(artifact.storageRef || {}),
        syncStatus: PROJECT_FOLDER_SYNC_STATUSES.staleDerivedOutput
      }
    }));
}

function requireFolderStore(folderStore) {
  const required = ['listProjectFolderEntries', 'readProjectFileText', 'writeProjectFileText', 'writeProjectFileBytes'];
  for (const name of required) {
    if (!folderStore || typeof folderStore[name] !== 'function') {
      throw createValidationError(`Project folder store must provide ${name}().`);
    }
  }
}

function selectArtifactFolderSegment(artifact) {
  if (QUERY_KINDS.has(artifact.artifactKind)) return 'queries';
  if (REPORT_KINDS.has(artifact.artifactKind)) return 'reports';
  if (DIAGRAM_KINDS.has(artifact.artifactKind)) return 'diagrams';
  if (MAPPING_KINDS.has(artifact.artifactKind)) return 'mappings';
  if (GRAPH_KINDS.has(artifact.artifactKind)) return 'graphs';
  if (GENERATED_ROLES.has(artifact.role)) return 'generated';
  if (artifact.role === 'staged') return 'staged';
  return 'source';
}

async function scanInto(folderStore, path, options, entries) {
  let children;
  try {
    children = await folderStore.listProjectFolderEntries(path, { includeHidden: options.includeHidden });
  } catch (error) {
    if (path && error?.code === 'PROJECT_FILE_SOURCE_NOT_FOUND') return;
    throw error;
  }
  for (const child of children) {
    const childPath = path ? `${path}/${child.name}` : child.name;
    const entry = { ...child, path: childPath };
    entries.push(entry);
    if (options.recursive && child.kind === 'directory') {
      await scanInto(folderStore, childPath, options, entries);
    }
  }
}

function normalizeScanPath(path) {
  return String(path || '').replace(/^\/+|\/+$/g, '');
}

function normalizeManifestFiles(manifest) {
  if (!manifest?.files) return [];
  return manifest.files
    .filter((file) => file && typeof file === 'object' && file.path)
    .map((file) => ({ ...file }));
}

function createArtifactSyncResult(artifact, path, folderEntry) {
  if (!folderEntry) {
    return {
      status: PROJECT_FOLDER_SYNC_STATUSES.missingFolderFile,
      path,
      artifactId: artifact.artifactId || null,
      artifact,
      folderEntry: null,
      reason: 'indexeddb-artifact-file-not-found-in-folder'
    };
  }

  const syncedAt = Date.parse(artifact?.storageRef?.syncedAt || '');
  const artifactUpdated = Date.parse(artifact?.updatedAt || artifact?.createdAt || '');
  const folderModified = Number.isFinite(folderEntry.modified) ? folderEntry.modified : NaN;
  const sizeChanged = Number.isFinite(folderEntry.size) && Number.isFinite(artifact?.storageRef?.size)
    ? folderEntry.size !== artifact.storageRef.size
    : false;
  const folderChanged = Number.isFinite(syncedAt) && Number.isFinite(folderModified)
    ? folderModified > syncedAt
    : sizeChanged;
  const indexedDbChanged = Number.isFinite(syncedAt) && Number.isFinite(artifactUpdated)
    ? artifactUpdated > syncedAt
    : false;
  let status = PROJECT_FOLDER_SYNC_STATUSES.synced;
  let reason = 'folder-and-indexeddb-match-last-sync';

  if (folderChanged && indexedDbChanged) {
    status = PROJECT_FOLDER_SYNC_STATUSES.conflict;
    reason = 'folder-and-indexeddb-changed-after-last-sync';
  } else if (folderChanged || sizeChanged) {
    status = PROJECT_FOLDER_SYNC_STATUSES.folderNewer;
    reason = 'folder-file-changed-after-last-sync';
  } else if (indexedDbChanged) {
    status = PROJECT_FOLDER_SYNC_STATUSES.indexedDbNewer;
    reason = 'indexeddb-artifact-changed-after-last-sync';
  }

  return {
    status,
    path,
    artifactId: artifact.artifactId || null,
    artifact,
    folderEntry,
    reason
  };
}

function countByStatus(results) {
  const counts = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
  }
  return counts;
}

function inferArtifactKindFromFolderFile(path) {
  const extension = getFilenameExtension(path);
  if (extension === 'rq') return 'sparql-query';
  if (extension === 'ru') return 'sparql-update';
  if (extension === 'mmd') return 'mermaid-diagram';
  if (['csv', 'tsv', 'xlsx'].includes(extension)) return 'tabular-file';
  if (['ttl', 'rdf', 'owl', 'jsonld', 'nt', 'nq', 'trig'].includes(extension)) return 'rdf-file';
  if (extension === 'json') return 'diagnostic-report';
  return 'artifact';
}
