import { createStableRecordId } from './id-generation.js';
import { createValidationError } from './storage-error.js';

const DEFAULT_GRAPH = null;
const STRING_TERM_TYPES = new Set(['NamedNode', 'BlankNode', 'Literal', 'DefaultGraph']);

function nowIso(now = () => new Date().toISOString()) {
  return now();
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createValidationError(`${name} must be an object.`);
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createValidationError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeStringArray(values, name) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw createValidationError(`${name} must be an array.`);
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function normalizeMetadata(value) {
  if (value == null) return {};
  requireObject(value, 'metadata');
  return { ...value };
}

/**
 * Normalize a project record used by TOM-style single projects, Mermaid-style
 * project portfolios, and future OntoEagle/Axiolotl workspaces.
 *
 * @param {object} record Project-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized ProjectRecord.
 */
export function normalizeProjectRecord(record, { now } = {}) {
  requireObject(record, 'project record');
  const label = requireString(record.label ?? 'Untitled project', 'project.label');
  const projectId = String(record.projectId || createStableRecordId('project', [label])).trim();
  requireString(projectId, 'project.projectId');
  const createdAt = record.createdAt || nowIso(now);
  const updatedAt = record.updatedAt || createdAt;
  return {
    projectId,
    label,
    createdAt,
    updatedAt,
    storageBackend: record.storageBackend || 'indexeddb',
    activeArtifactId: record.activeArtifactId || null,
    tags: normalizeStringArray(record.tags, 'project.tags'),
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Normalize an artifact record representing source, loaded, staged,
 * transformed, report, query, mapping, or diagram data within a project.
 *
 * @param {object} record Artifact-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized ArtifactRecord.
 */
export function normalizeArtifactRecord(record, { now } = {}) {
  requireObject(record, 'artifact record');
  const projectId = requireString(record.projectId, 'artifact.projectId');
  const artifactKind = requireString(record.artifactKind, 'artifact.artifactKind');
  const role = requireString(record.role || 'source', 'artifact.role');
  const label = requireString(record.label || artifactKind, 'artifact.label');
  const artifactId = String(record.artifactId || createStableRecordId('artifact', [projectId, role, artifactKind, label])).trim();
  const createdAt = record.createdAt || nowIso(now);
  const updatedAt = record.updatedAt || createdAt;
  return {
    artifactId,
    projectId,
    artifactKind,
    role,
    label,
    mediaType: record.mediaType || '',
    extension: record.extension || '',
    createdAt,
    updatedAt,
    source: record.source && typeof record.source === 'object' ? { ...record.source } : {},
    storageRef: record.storageRef && typeof record.storageRef === 'object' ? { ...record.storageRef } : null,
    provenance: record.provenance && typeof record.provenance === 'object'
      ? { ...record.provenance, derivedFrom: normalizeStringArray(record.provenance.derivedFrom, 'artifact.provenance.derivedFrom') }
      : { derivedFrom: [] },
    summary: record.summary && typeof record.summary === 'object' ? { ...record.summary } : {}
  };
}

/**
 * Normalize dataset metadata used by OntoEagle-style built-in/user ontology
 * caches and any app that enables/disables loaded data sources.
 *
 * @param {object} record Dataset-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized DatasetRecord.
 */
export function normalizeDatasetRecord(record, { now } = {}) {
  requireObject(record, 'dataset record');
  const projectId = record.projectId ? requireString(record.projectId, 'dataset.projectId') : null;
  const label = requireString(record.label || record.fileName || 'Dataset', 'dataset.label');
  const source = record.source || 'user';
  const datasetId = String(record.datasetId || createStableRecordId('dataset', [projectId, source, label, record.fingerprint])).trim();
  return {
    datasetId,
    projectId,
    source,
    enabled: record.enabled !== false,
    label,
    schemaVersion: Number.isInteger(record.schemaVersion) ? record.schemaVersion : 1,
    fingerprint: record.fingerprint || '',
    fileName: record.fileName || '',
    documentCount: Number.isFinite(record.documentCount) ? record.documentCount : 0,
    ontologyCount: Number.isFinite(record.ontologyCount) ? record.ontologyCount : 0,
    createdAt: record.createdAt || nowIso(now),
    updatedAt: record.updatedAt || nowIso(now),
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Normalize an operation run record for diagnostics, transformations, imports,
 * exports, query execution, inference, or generation.
 *
 * @param {object} record Run-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized RunRecord.
 */
export function normalizeRunRecord(record, { now } = {}) {
  requireObject(record, 'run record');
  const projectId = record.projectId ? requireString(record.projectId, 'run.projectId') : null;
  const runKind = requireString(record.runKind || record.kind || 'operation', 'run.runKind');
  const label = requireString(record.label || runKind, 'run.label');
  const createdAt = record.createdAt || nowIso(now);
  const runId = String(record.runId || createStableRecordId('run', [projectId, runKind, createdAt, label])).trim();
  return {
    runId,
    projectId,
    runKind,
    label,
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    inputArtifactIds: normalizeStringArray(record.inputArtifactIds, 'run.inputArtifactIds'),
    outputArtifactIds: normalizeStringArray(record.outputArtifactIds, 'run.outputArtifactIds'),
    payload: record.payload && typeof record.payload === 'object' ? { ...record.payload } : {},
    uiState: record.uiState ?? null,
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Normalize a workspace inclusion record. Inclusions make graph visibility
 * explicit: a project can include a reference dataset or project artifact
 * without silently reading every available dataset in the browser.
 *
 * @param {object} record Inclusion-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized WorkspaceInclusionRecord.
 */
export function normalizeWorkspaceInclusionRecord(record, { now } = {}) {
  requireObject(record, 'workspace inclusion record');
  const projectId = requireString(record.projectId, 'inclusion.projectId');
  const targetType = requireString(record.targetType, 'inclusion.targetType');
  const targetId = requireString(record.targetId, 'inclusion.targetId');
  const role = requireString(record.role || 'project-source', 'inclusion.role');
  const inclusionId = String(record.inclusionId || createStableRecordId('inclusion', [projectId, targetType, targetId])).trim();
  const createdAt = record.createdAt || nowIso(now);
  return {
    inclusionId,
    projectId,
    targetType,
    targetId,
    role,
    enabled: record.enabled !== false,
    graphIri: record.graphIri || '',
    includeMode: record.includeMode || 'read-only',
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Normalize metadata for a materialized RDF graph in a project workspace.
 *
 * Graph records describe the graph as a unit: where it came from, whether it is
 * source/reference/generated/inferred data, and whether quad rows have been
 * materialized. The actual RDF statements live in QuadRow records.
 *
 * @param {object} record Graph-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized GraphRecord.
 */
export function normalizeGraphRecord(record, { now } = {}) {
  requireObject(record, 'graph record');
  const projectId = requireString(record.projectId, 'graph.projectId');
  const graphIri = normalizeGraphValue(record.graphIri ?? record.graph ?? null);
  const role = requireString(record.role || 'loaded', 'graph.role');
  const label = requireString(record.label || graphIri || 'Default graph', 'graph.label');
  const graphId = String(record.graphId || createStableRecordId('graph', [projectId, graphIri || 'default', role, label])).trim();
  const createdAt = record.createdAt || nowIso(now);
  const materialization = record.materialization && typeof record.materialization === 'object' ? record.materialization : {};
  return {
    graphId,
    projectId,
    graphIri,
    artifactId: record.artifactId || null,
    role,
    label,
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    source: record.source && typeof record.source === 'object' ? { ...record.source } : {},
    materialization: {
      strategy: materialization.strategy || 'materialized-on-run',
      status: materialization.status || 'pending',
      quadCount: Number.isFinite(materialization.quadCount) ? materialization.quadCount : 0,
      indexedAt: materialization.indexedAt || null
    },
    provenance: record.provenance && typeof record.provenance === 'object'
      ? { ...record.provenance, derivedFrom: normalizeStringArray(record.provenance.derivedFrom, 'graph.provenance.derivedFrom') }
      : { derivedFrom: [] },
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Create a stable scoped setting storage record.
 *
 * Scopes should be explicit enough to avoid collisions across apps and
 * projects, for example `app:axiolotl`, `project:project-x`,
 * `artifact:artifact-y`, or `user:local`.
 *
 * @param {object} record Setting-like input record.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function for missing timestamps.
 * @returns {object} Normalized SettingRecord.
 */
export function normalizeSettingRecord(record, { now } = {}) {
  requireObject(record, 'setting record');
  const scope = requireString(record.scope || 'app:default', 'setting.scope');
  const key = requireString(record.key, 'setting.key');
  const createdAt = record.createdAt || nowIso(now);
  return {
    settingId: record.settingId || createScopedSettingKey(scope, key),
    scope,
    key,
    value: record.value ?? null,
    schemaVersion: Number.isInteger(record.schemaVersion) ? record.schemaVersion : 1,
    appId: record.appId || '',
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    metadata: normalizeMetadata(record.metadata)
  };
}

/**
 * Creates the canonical key used for scoped settings.
 *
 * @param {string} scope Setting scope.
 * @param {string} key Setting key within scope.
 * @returns {string} Stable scoped setting key.
 */
export function createScopedSettingKey(scope, key) {
  return `${requireString(scope, 'setting.scope')}::${requireString(key, 'setting.key')}`;
}

function normalizeTermValue(value, name) {
  if (value && typeof value === 'object' && typeof value.value === 'string') return value.value;
  return requireString(value, name);
}

function normalizeTermType(value, fallback, name) {
  const termType = value || fallback;
  if (!STRING_TERM_TYPES.has(termType)) throw createValidationError(`${name} has unsupported RDF term type.`, { termType });
  return termType;
}

/**
 * Normalize an RDF row as a quad. Triple-only data is represented with
 * `graph: null`, giving apps a consistent default-graph projection.
 *
 * @param {object} row RDF/JS quad-like object or flattened quad row.
 * @returns {object} Normalized QuadRow.
 */
export function normalizeQuadRow(row) {
  requireObject(row, 'quad row');
  const subject = row.subject && typeof row.subject === 'object' ? row.subject : { value: row.subject, termType: row.subjectType };
  const predicate = row.predicate && typeof row.predicate === 'object' ? row.predicate : { value: row.predicate, termType: row.predicateType };
  const object = row.object && typeof row.object === 'object' ? row.object : {
    value: row.object,
    termType: row.objectType,
    language: row.objectLang,
    datatype: row.objectDatatype ? { value: row.objectDatatype } : undefined
  };
  const graph = row.graph && typeof row.graph === 'object' ? row.graph : { value: row.graph, termType: row.graphType };

  const graphValue = normalizeGraphValue(graph.value);
  const projectId = row.projectId ? requireString(row.projectId, 'quad.projectId') : null;
  const graphId = row.graphId ? requireString(row.graphId, 'quad.graphId') : null;
  return {
    quadId: row.quadId || '',
    projectId,
    graphId,
    artifactId: row.artifactId || null,
    subject: normalizeTermValue(subject, 'quad.subject'),
    subjectType: normalizeTermType(subject.termType, 'NamedNode', 'quad.subjectType'),
    predicate: normalizeTermValue(predicate, 'quad.predicate'),
    predicateType: normalizeTermType(predicate.termType, 'NamedNode', 'quad.predicateType'),
    object: normalizeTermValue(object, 'quad.object'),
    objectType: normalizeTermType(object.termType, 'NamedNode', 'quad.objectType'),
    objectLang: object.language || '',
    objectDatatype: object.datatype && object.datatype.value ? object.datatype.value : '',
    graph: graphValue,
    graphIri: graphValue,
    graphType: graphValue === DEFAULT_GRAPH ? 'DefaultGraph' : normalizeTermType(graph.termType, 'NamedNode', 'quad.graphType')
  };
}

function normalizeGraphValue(value) {
  return value === '' || value == null ? DEFAULT_GRAPH : String(value).trim();
}
