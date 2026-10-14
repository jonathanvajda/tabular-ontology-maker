import { StorageError } from './storage-error.js';
import {
  getMimeTypeForFormatKey,
  getOutputMimeTypeForExtension,
  getPreferredExtensionForMimeType,
  normalizeSupportedMimeType
} from '../format-registry/index.js';
import {
  createSafeFilenameBase,
  isBlobLike,
  normalizeFileExtension,
  stripFileExtension
} from '../browser-file-io/index.js';
import { PROJECT_ARCHIVE_MANIFEST_FILE, createProjectExportManifest } from './project-manifest.js';

const DEFAULT_ARTIFACT_FORMAT_KEY = 'json';
const DEFAULT_PROJECT_ARCHIVE_FORMAT_KEY = 'zip';

const ARTIFACT_KIND_DEFAULTS = Object.freeze({
  'mermaid-diagram': 'mermaid',
  'sparql-query': 'sparqlQuery',
  'sparql-update': 'sparqlUpdate',
  'sql-query': 'sql',
  'nosql-query': 'json',
  'ontology-rdf': 'turtle',
  'ontology-table': 'csv',
  'rdf-file': 'turtle',
  'rdf-dataset': 'jsonLd',
  'quad-rows': 'nQuads',
  'tabular-file': 'csv',
  'tabular-records': 'csv',
  'iri-mapping-table': 'csv',
  'shacl-shapes': 'turtle',
  'r2rml-mapping': 'turtle',
  'diagnostic-report': 'json',
  'ontology-slim': 'turtle',
  'search-index': 'json',
  'jsonld-graph': 'jsonLd',
  'ontology-documents': 'json'
});

/**
 * Stores a project artifact through the portfolio artifact store.
 *
 * @param {object} stores Store set returned by `createProjectPortfolioStores`.
 * @param {object} record Artifact metadata record.
 * @param {unknown} [payload=null] Artifact payload.
 * @returns {Promise<object>} Stored artifact metadata.
 */
export function storeProjectArtifactData(stores, record, payload = null) {
  if (!stores?.artifacts?.storeProjectArtifact) {
    throw new StorageError('storeProjectArtifactData expected portfolio artifact stores.', { code: 'INVALID_PROJECT_PORTFOLIO_STORES' });
  }
  return stores.artifacts.storeProjectArtifact(record, payload);
}

/**
 * Stores a project run through the portfolio run store.
 *
 * @param {object} stores Store set returned by `createProjectPortfolioStores`.
 * @param {object} record Run record.
 * @returns {Promise<object>} Stored run record.
 */
export function storeProjectRunData(stores, record) {
  if (!stores?.runs?.storeRunRecord) {
    throw new StorageError('storeProjectRunData expected portfolio run stores.', { code: 'INVALID_PROJECT_PORTFOLIO_STORES' });
  }
  return stores.runs.storeRunRecord(record);
}

/**
 * Resolves the preferred download extension and MIME type for an artifact.
 *
 * Explicit artifact `extension` and `mediaType` values win. When those are not
 * present, artifact kind defaults cover common RDF, tabular, query, Mermaid,
 * mapping, report, and JSON-LD cases.
 *
 * @param {object} artifact Artifact metadata or metadata plus payload.
 * @returns {{extension: string, mimeType: string}} Download format details.
 */
export function resolveArtifactDownloadFormat(artifact) {
  const explicitExtension = normalizeFileExtension(artifact?.extension);
  const explicitMediaType = normalizeMimeType(artifact?.mediaType);
  if (explicitMediaType) {
    return {
      extension: explicitExtension || getPreferredExtension(explicitMediaType),
      mimeType: explicitMediaType
    };
  }

  if (explicitExtension) {
    return {
      extension: explicitExtension,
      mimeType: getMimeTypeForExtension(explicitExtension)
    };
  }

  const defaults = getDescriptorForFormatKey(ARTIFACT_KIND_DEFAULTS[artifact?.artifactKind] || DEFAULT_ARTIFACT_FORMAT_KEY);
  return {
    extension: defaults.extensions[0],
    mimeType: defaults.mimeType
  };
}

/**
 * Builds a safe artifact filename from label/id plus resolved extension.
 *
 * @param {object} artifact Artifact metadata or metadata plus payload.
 * @param {object} [options]
 * @param {string} [options.fallbackName='artifact'] Fallback basename.
 * @returns {string} Filename with extension.
 */
export function createArtifactDownloadFileName(artifact, { fallbackName = 'artifact' } = {}) {
  const { extension } = resolveArtifactDownloadFormat(artifact);
  const sourceName = artifact?.source?.fileName || artifact?.label || artifact?.artifactId || fallbackName;
  const safeBase = createSafeFilenameBase(stripFileExtension(sourceName), { fallbackBase: fallbackName });
  return `${safeBase}.${extension}`;
}

/**
 * Creates a browser Blob for an artifact payload.
 *
 * @param {object} artifact Artifact metadata or metadata plus payload.
 * @param {object} [options]
 * @param {typeof Blob} [options.BlobConstructor=globalThis.Blob] Blob constructor.
 * @returns {Blob} Artifact blob.
 */
export function createArtifactDownloadBlob(artifact, { BlobConstructor = globalThis.Blob } = {}) {
  if (typeof BlobConstructor !== 'function') {
    throw new StorageError('Blob is not available for artifact download.', { code: 'BLOB_UNAVAILABLE' });
  }
  const { mimeType } = resolveArtifactDownloadFormat(artifact);
  const payload = artifact?.payload ?? artifact?.content ?? artifact?.text ?? artifact ?? {};
  if (isBlobLike(payload)) return payload;
  return new BlobConstructor([serializeArtifactPayload(payload)], { type: mimeType });
}

/**
 * Downloads a single project artifact through an injected browser download
 * function.
 *
 * @param {object} artifact Artifact metadata or metadata plus payload.
 * @param {object} options
 * @param {(fileName: string, blob: Blob, options?: object) => unknown} options.downloadBlob Browser download function.
 * @param {typeof Blob} [options.BlobConstructor=globalThis.Blob] Blob constructor.
 * @returns {unknown} Result returned by `downloadBlob`.
 */
export function downloadProjectArtifact(artifact, { downloadBlob, BlobConstructor = globalThis.Blob, ...downloadOptions } = {}) {
  if (typeof downloadBlob !== 'function') {
    throw new StorageError('downloadProjectArtifact expected a downloadBlob function.', { code: 'DOWNLOAD_FUNCTION_REQUIRED' });
  }
  return downloadBlob(createArtifactDownloadFileName(artifact), createArtifactDownloadBlob(artifact, { BlobConstructor }), downloadOptions);
}

/**
 * Creates a ZIP Blob for one project and its artifacts.
 *
 * @param {object} project Project metadata.
 * @param {object[]} artifacts Project artifacts, optionally with payloads.
 * @param {object} options
 * @param {typeof import('jszip')} [options.JSZipConstructor=globalThis.JSZip] JSZip constructor.
 * @returns {Promise<Blob>} ZIP blob.
 */
export async function createProjectArchiveBlob(project, artifacts, {
  JSZipConstructor = globalThis.JSZip,
  runs = [],
  workspaceInclusions = [],
  settings = [],
  now,
  appId,
  packageName
} = {}) {
  if (typeof JSZipConstructor !== 'function') {
    throw new StorageError('JSZip is not available for project archive creation.', { code: 'JSZIP_UNAVAILABLE' });
  }
  const zip = new JSZipConstructor();
  const artifactFiles = [];
  zip.file('project.json', JSON.stringify(project || {}, null, 2));
  for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
    const fileName = createArtifactDownloadFileName(artifact);
    const { extension, mimeType } = resolveArtifactDownloadFormat(artifact);
    const path = `artifacts/${fileName}`;
    artifactFiles.push({
      path,
      artifactId: artifact.artifactId || null,
      artifactKind: artifact.artifactKind || '',
      role: artifact.role || '',
      mediaType: mimeType,
      extension
    });
    zip.file(path, serializeArtifactPayload(artifact?.payload ?? artifact));
  }
  zip.file(PROJECT_ARCHIVE_MANIFEST_FILE, JSON.stringify(createProjectExportManifest({
    project: project || {},
    artifacts: Array.isArray(artifacts) ? artifacts : [],
    runs,
    workspaceInclusions,
    settings
  }, {
    now,
    appId,
    packageName,
    archiveFiles: artifactFiles
  }), null, 2));
  return zip.generateAsync({ type: 'blob', mimeType: getDescriptorForFormatKey(DEFAULT_PROJECT_ARCHIVE_FORMAT_KEY).mimeType });
}

/**
 * Downloads a whole project as a ZIP file.
 *
 * @param {object} project Project metadata.
 * @param {object[]} artifacts Project artifacts, optionally with payloads.
 * @param {object} options
 * @param {typeof import('jszip')} [options.JSZipConstructor=globalThis.JSZip] JSZip constructor.
 * @param {(fileName: string, blob: Blob, options?: object) => unknown} options.downloadBlob Browser download function.
 * @returns {Promise<unknown>} Result returned by `downloadBlob`.
 */
export async function downloadProjectArchive(project, artifacts, { JSZipConstructor = globalThis.JSZip, downloadBlob, ...downloadOptions } = {}) {
  if (typeof downloadBlob !== 'function') {
    throw new StorageError('downloadProjectArchive expected a downloadBlob function.', { code: 'DOWNLOAD_FUNCTION_REQUIRED' });
  }
  const blob = await createProjectArchiveBlob(project, artifacts, { JSZipConstructor });
  const fileName = `${createSafeFilenameBase(project?.label || project?.projectId || 'project', { fallbackBase: 'project' })}.zip`;
  return downloadBlob(fileName, blob, downloadOptions);
}

function serializeArtifactPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) return payload;
  return JSON.stringify(payload ?? {}, null, 2);
}

function normalizeMimeType(mimeType) {
  const text = String(mimeType || '').trim();
  const result = normalizeSupportedMimeType(text);
  return result.ok ? result.value.mimeType : text;
}

function getDescriptorForFormatKey(formatKey) {
  const result = getMimeTypeForFormatKey(formatKey);
  return result.ok
    ? result.value
    : getMimeTypeForFormatKey(DEFAULT_ARTIFACT_FORMAT_KEY).value;
}

function getPreferredExtension(mimeType) {
  const result = getPreferredExtensionForMimeType(mimeType);
  return result.ok ? result.value : getDescriptorForFormatKey(DEFAULT_ARTIFACT_FORMAT_KEY).extensions[0];
}

function getMimeTypeForExtension(extension) {
  const result = getOutputMimeTypeForExtension(extension);
  return result.ok ? result.value.mimeType : getDescriptorForFormatKey('binary').mimeType;
}
