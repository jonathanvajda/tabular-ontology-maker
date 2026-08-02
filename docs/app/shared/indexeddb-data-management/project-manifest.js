import { createValidationError } from './storage-error.js';

export const PROJECT_ARCHIVE_MANIFEST_FILE = 'project-manifest.json';
export const PROJECT_MANIFEST_KIND = 'ontoeagle-project-archive';
export const PROJECT_MANIFEST_SCHEMA_VERSION = 1;

/**
 * Creates the canonical manifest stored in exported project archives.
 *
 * The manifest is intentionally metadata-first. Artifact payload bytes live in
 * archive files; this manifest records which project records were exported,
 * where artifact payloads are stored in the archive, and which app/package
 * produced the bundle.
 *
 * @param {object} input Project portfolio records to describe.
 * @param {object} input.project ProjectRecord.
 * @param {object[]} [input.artifacts=[]] ArtifactRecords, optionally including payloads.
 * @param {object[]} [input.runs=[]] RunRecords.
 * @param {object[]} [input.workspaceInclusions=[]] WorkspaceInclusionRecords.
 * @param {object[]} [input.settings=[]] Project/app setting records.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for deterministic tests.
 * @param {string} [options.appId='indexeddb-data-management'] Exporting app id.
 * @param {string} [options.packageName='@ontoeagle/indexeddb-data-management'] Exporting package id.
 * @param {object[]} [options.archiveFiles=[]] File entries written into the archive.
 * @returns {object} Project archive manifest.
 */
export function createProjectExportManifest({
  project,
  artifacts = [],
  runs = [],
  workspaceInclusions = [],
  settings = []
}, {
  now = () => new Date().toISOString(),
  appId = 'indexeddb-data-management',
  packageName = '@ontoeagle/indexeddb-data-management',
  archiveFiles = []
} = {}) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw createValidationError('Project export manifest expected a project record.');
  }

  const filesByArtifactId = new Map(
    archiveFiles
      .filter((file) => file?.artifactId)
      .map((file) => [file.artifactId, file])
  );

  return {
    manifestKind: PROJECT_MANIFEST_KIND,
    manifestVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    exportedAt: now(),
    generator: {
      appId,
      packageName
    },
    project: stripPayload(project),
    contents: {
      artifacts: artifacts.map((artifact) => {
        const file = filesByArtifactId.get(artifact.artifactId);
        return {
          ...stripPayload(artifact),
          archivePath: file?.path || null
        };
      }),
      runs: runs.map(stripPayload),
      workspaceInclusions: workspaceInclusions.map(stripPayload),
      settings: settings.map(stripPayload)
    },
    files: archiveFiles.map((file) => ({ ...file }))
  };
}

/**
 * Normalizes a project archive manifest read from an imported ZIP.
 *
 * This does not write IndexedDB records. Import callers can validate the
 * returned shape, resolve archive files, then decide whether to create a new
 * project, merge into an existing project, or stage the import for review.
 *
 * @param {object} manifest Parsed project archive manifest.
 * @returns {object} Normalized manifest with arrays present.
 */
export function normalizeProjectImportManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw createValidationError('Project import manifest must be an object.');
  }
  if (manifest.manifestKind !== PROJECT_MANIFEST_KIND) {
    throw createValidationError('Project import manifest has unsupported kind.', { manifestKind: manifest.manifestKind });
  }
  if (manifest.manifestVersion !== PROJECT_MANIFEST_SCHEMA_VERSION) {
    throw createValidationError('Project import manifest has unsupported version.', { manifestVersion: manifest.manifestVersion });
  }
  if (!manifest.project || typeof manifest.project !== 'object' || Array.isArray(manifest.project)) {
    throw createValidationError('Project import manifest must include a project record.');
  }

  return {
    manifestKind: PROJECT_MANIFEST_KIND,
    manifestVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    exportedAt: manifest.exportedAt || '',
    generator: manifest.generator && typeof manifest.generator === 'object' ? { ...manifest.generator } : {},
    project: { ...manifest.project },
    contents: {
      artifacts: normalizeArray(manifest.contents?.artifacts, 'manifest.contents.artifacts'),
      runs: normalizeArray(manifest.contents?.runs, 'manifest.contents.runs'),
      workspaceInclusions: normalizeArray(manifest.contents?.workspaceInclusions, 'manifest.contents.workspaceInclusions'),
      settings: normalizeArray(manifest.contents?.settings, 'manifest.contents.settings')
    },
    files: normalizeArray(manifest.files, 'manifest.files')
  };
}

function normalizeArray(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw createValidationError(`${name} must be an array.`);
  return value.map((entry) => entry && typeof entry === 'object' ? { ...entry } : entry);
}

function stripPayload(record) {
  if (!record || typeof record !== 'object') return record;
  const { payload, content, text, ...metadata } = record;
  return metadata;
}
