export {
  isAbsoluteIri,
  isValidPrefixName,
  normalizePrefixMap,
  mergeProjectPrefixes,
  saveProjectPrefixes
} from './prefix-map.js';

export {
  COMMON_NAMESPACE_REGISTRY,
  namespacePrefixMapFromRegistry,
  namespaceToPrefixMap,
  iriForNamespaceId
} from './namespace-registry.js';

export {
  findLongestPrefixMatch,
  compactIriToCurie,
  expandCurieToIri
} from './curie.js';

export {
  extractTurtlePrefixDeclarations,
  extractXmlNamespacePrefixes,
  extractJsonLdContextPrefixes,
  extractRdfPrefixesFromText
} from './rdf-prefixes.js';

export {
  extractSparqlPrefixesFromText,
  formatSparqlPrefixDeclarations,
  prependSparqlPrefixes
} from './sparql-prefixes.js';

export {
  createN3WriterOptionsWithPrefixes,
  applyPrefixesToRdflibStore
} from './rdf-serialization-prefixes.js';

export {
  deriveNamespaceStemFromIri,
  listNamespaceStemsInStore,
  discoverBaseIriOrNamespaceStem
} from './namespace-stems.js';
