export {
  isAbsoluteIri,
  isValidPrefixName,
  normalizePrefixMap,
  mergeProjectPrefixes,
  saveProjectPrefixes
} from './prefix-map.js';

export {
  COMMON_NAMESPACE_IRIS,
  COMMON_NAMESPACE_REGISTRY,
  namespaceIriMapFromRegistry,
  namespacePrefixMapFromRegistry,
  namespaceToPrefixMap,
  iriForNamespaceId,
  curieForNamespaceId
} from './namespace-registry.js';

export {
  findLongestPrefixMatch,
  compactIriToCurie,
  formatIriForDisplay,
  expandCurieToIri
} from './curie.js';

export {
  extractTurtlePrefixDeclarations,
  extractXmlNamespacePrefixes,
  extractJsonLdContextPrefixes,
  extractRdfPrefixesFromText
} from './rdf-prefixes.js';

export {
  createN3WriterOptionsWithPrefixes,
  selectPrefixesUsedByRdfTerms,
  applyPrefixesToRdflibStore
} from './rdf-serialization-prefixes.js';

export {
  deriveNamespaceStemFromIri,
  listNamespaceStemsInStore,
  discoverBaseIriOrNamespaceStem
} from './namespace-stems.js';
