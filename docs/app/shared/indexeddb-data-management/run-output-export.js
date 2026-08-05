import {
  getOutputMimeTypeForExtension,
  getPreferredExtensionForMimeType,
  normalizeSupportedMimeType
} from '../format-registry/index.js';
import {
  createSafeFilenameBase,
  stripFileExtension
} from '../browser-file-io/index.js';
import {
  createRdfDataset,
  parseRdfTextWithAdapters,
  serializeRdfGraphExport
} from '../rdf-io/index.js';
import { StorageError } from './storage-error.js';

/**
 * Resolves the transformed output run that preview/download controls should use.
 *
 * Apps often rebuild an input preview after creating an output run. This helper
 * keeps that UI flow from losing the actual output by checking the active run,
 * the selected run, then the newest output child of the selected/input run.
 *
 * @param {object} options
 * @param {string|null} [options.activeOutputRunId=null] Known active output run id.
 * @param {string|null} [options.selectedRunId=null] Run id selected in the UI.
 * @param {string|null} [options.inputRunId=null] Known source/input run id.
 * @param {(runId: string) => Promise<object|null>} options.readRun Reads a run payload or run record.
 * @param {() => Promise<object[]>} options.listRuns Lists run payloads or run records.
 * @param {(run: object) => boolean} [options.isOutputRun] Output predicate.
 * @param {(run: object) => string|null} [options.getParentRunId] Parent/source run id accessor.
 * @returns {Promise<{run: object, runId: string, parentRunId: string|null, source: string}|null>}
 */
export async function resolveOutputRunForExport({
  activeOutputRunId = null,
  selectedRunId = null,
  inputRunId = null,
  readRun,
  listRuns,
  isOutputRun = (run) => run?.kind === 'output',
  getParentRunId = (run) => run?.parentRunId || null
} = {}) {
  if (typeof readRun !== 'function') {
    throw new StorageError('resolveOutputRunForExport expected a readRun function.', { code: 'READ_RUN_REQUIRED' });
  }
  if (typeof listRuns !== 'function') {
    throw new StorageError('resolveOutputRunForExport expected a listRuns function.', { code: 'LIST_RUNS_REQUIRED' });
  }

  const active = await readRunIfPresent(activeOutputRunId, readRun);
  if (active && isOutputRun(active)) return createResolvedRun(active, 'active');

  const selected = await readRunIfPresent(selectedRunId, readRun);
  if (selected && isOutputRun(selected)) return createResolvedRun(selected, 'selected');

  const sourceRunId = selected && !isOutputRun(selected)
    ? getRunId(selected)
    : inputRunId;
  if (!sourceRunId) return null;

  const runs = await listRuns();
  const latest = runs
    .filter((run) => isOutputRun(run) && getParentRunId(run) === sourceRunId)
    .sort(compareDescendingCreatedAt)[0];

  return latest ? createResolvedRun(latest, 'latest-child') : null;
}

/**
 * Serializes a transformed run payload to the selected export MIME type.
 *
 * The canonical RDF run shape is `nquads` text. Query/text runs can pass
 * `textProperty`, or callers can provide a custom serializer for app-specific
 * payloads.
 *
 * @param {object} run Transformed output run payload or record.
 * @param {object} options
 * @param {string} options.mimeType Selected output MIME type.
 * @param {object} [options.runtime] RDF adapter runtimes.
 * @param {string} [options.baseIri=''] RDF base IRI.
 * @param {object} [options.prefixes] RDF prefixes.
 * @param {boolean} [options.usePrefixes=true] Whether to use run/options prefixes.
 * @param {string} [options.textProperty='queryText'] Text payload property.
 * @param {(run: object, options: object) => Promise<object>|object} [options.serializeRun] Custom serializer.
 * @returns {Promise<{text: string, mimeType: string, extension: string, fileName: string, run: object, warnings: object[]}>}
 */
export async function serializeRunOutputForExport(run, options = {}) {
  const payload = unwrapRunPayload(run);
  if (!payload) throw new StorageError('serializeRunOutputForExport expected a run payload.', { code: 'RUN_REQUIRED' });
  const mimeType = normalizeOutputMimeType(options.mimeType);

  if (typeof options.serializeRun === 'function') {
    const result = await options.serializeRun(payload, { ...options, mimeType });
    return normalizeSerializedRunOutput(payload, result, { ...options, mimeType });
  }

  if (typeof payload.nquads === 'string') {
    const parsed = await parseRdfTextWithAdapters(payload.nquads, {
      format: 'application/n-quads',
      baseIri: options.baseIri || '',
      runtime: options.runtime || {}
    });
    const dataset = createDatasetFromQuads(parsed.quads, options.runtime);
    const prefixes = options.usePrefixes === false ? {} : (options.prefixes || payload.prefixes || {});
    const context = options.context || prefixesToJsonLdContext(prefixes);
    const serialized = await serializeRdfGraphExport(dataset, {
      scope: options.scope || 'all',
      mimeType,
      baseIri: options.baseIri || '',
      prefixes,
      ...(context ? { context } : {}),
      runtime: options.runtime || {}
    });
    return normalizeSerializedRunOutput(payload, serialized, { ...options, mimeType });
  }

  const textProperty = options.textProperty || 'queryText';
  if (typeof payload[textProperty] === 'string') {
    return normalizeSerializedRunOutput(payload, {
      text: payload[textProperty],
      mimeType,
      warnings: []
    }, { ...options, mimeType });
  }

  throw new StorageError('Run payload does not contain a supported export payload.', { code: 'UNSUPPORTED_RUN_OUTPUT_PAYLOAD' });
}

/**
 * Downloads a transformed run output by composing run serialization with the
 * browser-file-io download side effect.
 *
 * @param {object} run Transformed output run payload or record.
 * @param {object} options
 * @param {string} options.mimeType Selected output MIME type.
 * @param {(fileName: string, text: string, options?: object) => unknown} options.downloadTextFile Download adapter.
 * @returns {Promise<{serialized: object, download: unknown}>}
 */
export async function downloadRunOutputForExport(run, options = {}) {
  if (typeof options.downloadTextFile !== 'function') {
    throw new StorageError('downloadRunOutputForExport expected a downloadTextFile function.', { code: 'DOWNLOAD_TEXT_FILE_REQUIRED' });
  }
  const serialized = await serializeRunOutputForExport(run, options);
  const download = options.downloadTextFile(serialized.fileName, serialized.text, {
    ...options.downloadOptions,
    mimeType: serialized.mimeType
  });
  return { serialized, download };
}

/**
 * Builds a download filename for a run output and selected MIME type.
 *
 * @param {object} run Run payload or record.
 * @param {object} options
 * @param {string} options.mimeType Selected output MIME type.
 * @param {string} [options.fallbackName='run-output'] Fallback filename base.
 * @returns {string} Filename with preferred extension.
 */
export function createRunOutputDownloadFileName(run, { mimeType, fallbackName = 'run-output' } = {}) {
  const payload = unwrapRunPayload(run) || {};
  const extension = getPreferredOutputExtension(mimeType);
  const sourceName = payload.fileName || payload.label || payload.runId || fallbackName;
  return `${createSafeFilenameBase(stripFileExtension(sourceName), { fallbackBase: fallbackName })}.${extension}`;
}

function readRunIfPresent(runId, readRun) {
  return runId ? readRun(runId).then(unwrapRunPayload) : Promise.resolve(null);
}

function createResolvedRun(run, source) {
  const payload = unwrapRunPayload(run);
  return {
    run: payload,
    runId: getRunId(payload),
    parentRunId: payload?.parentRunId || null,
    source
  };
}

function unwrapRunPayload(run) {
  return run?.payload && typeof run.payload === 'object' ? run.payload : run;
}

function getRunId(run) {
  return run?.runId || null;
}

function compareDescendingCreatedAt(left, right) {
  return String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
}

function normalizeOutputMimeType(mimeType) {
  const text = String(mimeType || '').trim();
  if (!text) throw new StorageError('Export MIME type is required.', { code: 'EXPORT_MIME_TYPE_REQUIRED' });
  const normalized = normalizeSupportedMimeType(text);
  return normalized.ok ? normalized.value.mimeType : text;
}

function getPreferredOutputExtension(mimeType) {
  const preferred = getPreferredExtensionForMimeType(mimeType);
  if (preferred.ok) return preferred.value;
  const fromExtension = getOutputMimeTypeForExtension(mimeType);
  if (fromExtension.ok) return fromExtension.value.extensions?.[0] || 'txt';
  return 'txt';
}

function normalizeSerializedRunOutput(run, serialized, options) {
  const mimeType = normalizeOutputMimeType(serialized?.mimeType || options.mimeType);
  return {
    text: String(serialized?.text ?? ''),
    mimeType,
    extension: getPreferredOutputExtension(mimeType),
    fileName: createRunOutputDownloadFileName(run, {
      mimeType,
      fallbackName: options.fallbackName || 'run-output'
    }),
    run,
    warnings: serialized?.warnings || []
  };
}

function createDatasetFromQuads(quads, runtime = {}) {
  const N3 = runtime?.N3;
  if (N3?.Store) {
    const store = new N3.Store();
    if (typeof store.addQuads === 'function') store.addQuads(quads);
    else quads.forEach((item) => store.addQuad(item));
    return store;
  }
  return createRdfDataset(quads);
}

function prefixesToJsonLdContext(prefixes) {
  const entries = Object.entries(prefixes || {})
    .filter(([key, value]) => key && value);
  if (!entries.length) return null;
  return {
    '@context': Object.fromEntries(entries)
  };
}
