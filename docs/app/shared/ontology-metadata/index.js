export {
  getAnyJsonLdValue,
  getJsonLdGraphNodes,
  readOntologyRecordsFromJsonLd
} from './jsonld-metadata.js';

export {
  buildOpaqueOntologyIri,
  buildReadableOntologyIri,
  collectUsedOpaqueOntologyIriNumbers,
  createOntologySettingsViewFromMetadataRecord,
  findMaxOpaqueOntologyIriNumber,
  findNextAvailableOpaqueOntologyIriNumber,
  generateOntologySettings,
  getOntologyIriBaseAndDelimiter,
  normalizeOntologyMetadataRecord,
  ONTOLOGY_METADATA_PROFILE_SETTING_KEY
} from './settings.js';

export {
  deriveOntologyImportTarget
} from './import-target.js';

export {
  appendOntologyMetadataQuads,
  readOntologyMetadataRecordFromQuads,
  writeOntologyMetadataQuads
} from './rdf-metadata.js';
