import { COMMON_NAMESPACE_IRIS, namespacePrefixMapFromRegistry } from '../namespace-registry/index.js';
import {
  normalizeArtifactRecord,
  normalizeDatasetRecord,
  normalizeGraphRecord,
  normalizeProjectRecord,
  normalizeRunRecord,
  normalizeSettingRecord,
  normalizeWorkspaceInclusionRecord
} from './records.js';

const PREFIXES = namespacePrefixMapFromRegistry();

export const PROJECT_RECORD_JSONLD_CONTEXT = Object.freeze({
  cceo: PREFIXES.cceo,
  cco2: PREFIXES.cco2,
  dcterms: PREFIXES.dcterms,
  rdf: PREFIXES.rdf,
  rdfs: PREFIXES.rdfs,
  xsd: PREFIXES.xsd,
  okea: PREFIXES.okea
});

function createDateTimeLiteral(value) {
  return value ? { '@value': value, '@type': COMMON_NAMESPACE_IRIS.xsd.dateTime } : null;
}

function createIdentifierLiteral(value) {
  return value ? { '@value': value, '@type': COMMON_NAMESPACE_IRIS.xsd.string } : null;
}

function createIriReference(value, type = null) {
  if (!value) return null;
  return stripNullishEntries({
    '@id': value,
    '@type': type,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(value)
  });
}

function stripNullishEntries(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined));
}

/**
 * Reads the first present value from a JSON-LD object using compact IRI keys,
 * full IRI keys, or legacy DTO aliases.
 *
 * @param {object} record Source record.
 * @param {string[]} keys Candidate property keys.
 * @param {unknown} [fallback=null] Fallback value.
 * @returns {unknown} Resolved value.
 */
export function readJsonLdRecordValue(record, keys, fallback = null) {
  for (const key of keys) {
    if (record && Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && '@value' in value) return value['@value'];
      if (value && typeof value === 'object' && !Array.isArray(value) && '@id' in value) return value['@id'];
      return value;
    }
  }
  return fallback;
}

/**
 * Converts a ProjectRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record ProjectRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD ProjectRecord.
 */
export function convertProjectRecordToJsonLd(record, options = {}) {
  const project = normalizeProjectRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': project.projectId,
    '@type': COMMON_NAMESPACE_IRIS.okea.Project,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(project.projectId),
    [COMMON_NAMESPACE_IRIS.dcterms.title]: project.label,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(project.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(project.updatedAt),
    [COMMON_NAMESPACE_IRIS.okea.storageBackend]: project.storageBackend,
    [COMMON_NAMESPACE_IRIS.okea.activeArtifact]: createIriReference(project.activeArtifactId, COMMON_NAMESPACE_IRIS.cco2.informationContentEntity),
    [COMMON_NAMESPACE_IRIS.okea.tag]: project.tags,
    [COMMON_NAMESPACE_IRIS.okea.metadata]: project.metadata
  });
}

/**
 * Converts an ArtifactRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record ArtifactRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD ArtifactRecord.
 */
export function convertArtifactRecordToJsonLd(record, options = {}) {
  const artifact = normalizeArtifactRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': artifact.artifactId,
    '@type': COMMON_NAMESPACE_IRIS.cco2.informationContentEntity,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(artifact.artifactId),
    [COMMON_NAMESPACE_IRIS.dcterms.isPartOf]: createIriReference(artifact.projectId, COMMON_NAMESPACE_IRIS.okea.Project),
    [COMMON_NAMESPACE_IRIS.okea.artifactKind]: artifact.artifactKind,
    [COMMON_NAMESPACE_IRIS.okea.role]: artifact.role,
    [COMMON_NAMESPACE_IRIS.dcterms.title]: artifact.label,
    [COMMON_NAMESPACE_IRIS.dcterms.format]: artifact.mediaType,
    [COMMON_NAMESPACE_IRIS.okea.fileExtension]: artifact.extension,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(artifact.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(artifact.updatedAt),
    [COMMON_NAMESPACE_IRIS.dcterms.source]: artifact.source,
    [COMMON_NAMESPACE_IRIS.okea.storageRef]: artifact.storageRef,
    [COMMON_NAMESPACE_IRIS.dcterms.provenance]: artifact.provenance,
    [COMMON_NAMESPACE_IRIS.okea.summary]: artifact.summary
  });
}

/**
 * Converts a DatasetRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record DatasetRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD DatasetRecord.
 */
export function convertDatasetRecordToJsonLd(record, options = {}) {
  const dataset = normalizeDatasetRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': dataset.datasetId,
    '@type': COMMON_NAMESPACE_IRIS.cco2.informationContentEntity,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(dataset.datasetId),
    [COMMON_NAMESPACE_IRIS.dcterms.isPartOf]: createIriReference(dataset.projectId, COMMON_NAMESPACE_IRIS.okea.Project),
    [COMMON_NAMESPACE_IRIS.dcterms.source]: dataset.source,
    [COMMON_NAMESPACE_IRIS.okea.enabled]: dataset.enabled,
    [COMMON_NAMESPACE_IRIS.dcterms.title]: dataset.label,
    [COMMON_NAMESPACE_IRIS.okea.schemaVersion]: dataset.schemaVersion,
    [COMMON_NAMESPACE_IRIS.okea.fingerprint]: dataset.fingerprint,
    [COMMON_NAMESPACE_IRIS.okea.fileName]: dataset.fileName,
    [COMMON_NAMESPACE_IRIS.okea.documentCount]: dataset.documentCount,
    [COMMON_NAMESPACE_IRIS.okea.ontologyCount]: dataset.ontologyCount,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(dataset.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(dataset.updatedAt),
    [COMMON_NAMESPACE_IRIS.okea.metadata]: dataset.metadata
  });
}

/**
 * Converts a RunRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record RunRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD RunRecord.
 */
export function convertRunRecordToJsonLd(record, options = {}) {
  const run = normalizeRunRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': run.runId,
    '@type': COMMON_NAMESPACE_IRIS.cceo.ComputerProgramExecution,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(run.runId),
    [COMMON_NAMESPACE_IRIS.dcterms.isPartOf]: createIriReference(run.projectId, COMMON_NAMESPACE_IRIS.okea.Project),
    [COMMON_NAMESPACE_IRIS.okea.runKind]: run.runKind,
    [COMMON_NAMESPACE_IRIS.dcterms.title]: run.label,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(run.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(run.updatedAt),
    [COMMON_NAMESPACE_IRIS.okea.inputArtifact]: run.inputArtifactIds.map((artifactId) => createIriReference(artifactId, COMMON_NAMESPACE_IRIS.cco2.informationContentEntity)),
    [COMMON_NAMESPACE_IRIS.okea.outputArtifact]: run.outputArtifactIds.map((artifactId) => createIriReference(artifactId, COMMON_NAMESPACE_IRIS.cco2.informationContentEntity)),
    [COMMON_NAMESPACE_IRIS.okea.payload]: run.payload,
    [COMMON_NAMESPACE_IRIS.okea.uiState]: run.uiState,
    [COMMON_NAMESPACE_IRIS.okea.metadata]: run.metadata
  });
}

/**
 * Converts a SettingRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record SettingRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD SettingRecord.
 */
export function convertSettingRecordToJsonLd(record, options = {}) {
  const setting = normalizeSettingRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': setting.settingId,
    '@type': COMMON_NAMESPACE_IRIS.okea.Setting,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(setting.settingId),
    [COMMON_NAMESPACE_IRIS.okea.scope]: setting.scope,
    [COMMON_NAMESPACE_IRIS.okea.settingKey]: setting.key,
    [COMMON_NAMESPACE_IRIS.rdf.value]: setting.value,
    [COMMON_NAMESPACE_IRIS.okea.schemaVersion]: setting.schemaVersion,
    [COMMON_NAMESPACE_IRIS.okea.appId]: setting.appId,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(setting.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(setting.updatedAt),
    [COMMON_NAMESPACE_IRIS.okea.metadata]: setting.metadata
  });
}

/**
 * Converts a WorkspaceInclusionRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record WorkspaceInclusionRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD WorkspaceInclusionRecord.
 */
export function convertWorkspaceInclusionRecordToJsonLd(record, options = {}) {
  const inclusion = normalizeWorkspaceInclusionRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': inclusion.inclusionId,
    '@type': COMMON_NAMESPACE_IRIS.okea.WorkspaceInclusion,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(inclusion.inclusionId),
    [COMMON_NAMESPACE_IRIS.dcterms.isPartOf]: createIriReference(inclusion.projectId, COMMON_NAMESPACE_IRIS.okea.Project),
    [COMMON_NAMESPACE_IRIS.okea.targetType]: inclusion.targetType,
    [COMMON_NAMESPACE_IRIS.okea.target]: createIriReference(inclusion.targetId),
    [COMMON_NAMESPACE_IRIS.okea.role]: inclusion.role,
    [COMMON_NAMESPACE_IRIS.okea.enabled]: inclusion.enabled,
    [COMMON_NAMESPACE_IRIS.okea.graphIri]: inclusion.graphIri,
    [COMMON_NAMESPACE_IRIS.okea.includeMode]: inclusion.includeMode,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(inclusion.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(inclusion.updatedAt),
    [COMMON_NAMESPACE_IRIS.okea.metadata]: inclusion.metadata
  });
}

/**
 * Converts a GraphRecord into a JSON-LD object with full IRI keys.
 *
 * @param {object} record GraphRecord or compatible DTO.
 * @param {object} [options]
 * @param {() => string} [options.now] Clock function.
 * @returns {object} JSON-LD GraphRecord.
 */
export function convertGraphRecordToJsonLd(record, options = {}) {
  const graph = normalizeGraphRecord(record, options);
  return stripNullishEntries({
    '@context': PROJECT_RECORD_JSONLD_CONTEXT,
    '@id': graph.graphId,
    '@type': COMMON_NAMESPACE_IRIS.okea.Graph,
    [COMMON_NAMESPACE_IRIS.dcterms.identifier]: createIdentifierLiteral(graph.graphId),
    [COMMON_NAMESPACE_IRIS.dcterms.isPartOf]: createIriReference(graph.projectId, COMMON_NAMESPACE_IRIS.okea.Project),
    [COMMON_NAMESPACE_IRIS.okea.graphIri]: graph.graphIri,
    [COMMON_NAMESPACE_IRIS.okea.artifact]: createIriReference(graph.artifactId, COMMON_NAMESPACE_IRIS.cco2.informationContentEntity),
    [COMMON_NAMESPACE_IRIS.okea.role]: graph.role,
    [COMMON_NAMESPACE_IRIS.rdfs.label]: graph.label,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: createDateTimeLiteral(graph.createdAt),
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: createDateTimeLiteral(graph.updatedAt),
    [COMMON_NAMESPACE_IRIS.dcterms.source]: graph.source,
    [COMMON_NAMESPACE_IRIS.okea.materialization]: graph.materialization,
    [COMMON_NAMESPACE_IRIS.dcterms.provenance]: graph.provenance,
    [COMMON_NAMESPACE_IRIS.okea.metadata]: graph.metadata
  });
}

/**
 * Creates JSON-LD metadata terms for common RDF ontology metadata.
 *
 * @returns {object} Common IRI constants used by record JSON-LD mappings.
 */
export function createRecordJsonLdVocabulary() {
  return Object.freeze({
    title: COMMON_NAMESPACE_IRIS.dcterms.title,
    created: COMMON_NAMESPACE_IRIS.dcterms.created,
    identifier: COMMON_NAMESPACE_IRIS.dcterms.identifier,
    modified: COMMON_NAMESPACE_IRIS.dcterms.modified,
    format: COMMON_NAMESPACE_IRIS.dcterms.format,
    label: COMMON_NAMESPACE_IRIS.rdfs.label,
    value: COMMON_NAMESPACE_IRIS.rdf.value,
    informationContentEntity: COMMON_NAMESPACE_IRIS.cco2.informationContentEntity,
    computerProgramExecution: COMMON_NAMESPACE_IRIS.cceo.ComputerProgramExecution,
    okea: COMMON_NAMESPACE_IRIS.okea.OntologyOfKnowledgeEngineeringArtifacts
  });
}
