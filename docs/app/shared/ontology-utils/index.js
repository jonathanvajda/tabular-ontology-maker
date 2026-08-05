export {
  isAbsoluteIri,
  isBlankNodeId,
  normalizeIriToken,
  normalizeNamespaceIri
} from './iri.js';

export {
  canUseTermAsGraph,
  canUseTermAsObject,
  canUseTermAsPredicate,
  canUseTermAsSubject,
  hasBlankNodeTermInQuad,
  isBlankNodeTerm,
  isRdfTerm
} from './rdf-terms.js';

export {
  classifyOntologyInput
} from './ontology-input.js';

export {
  isIriInNamespace,
  isRegisteredVocabularyIri
} from './ontology-namespace.js';

export {
  coerceLexicalValueForXsdDatatype,
  describeXsdDatatypeForJsonSchema,
  formatDatatypeIriForDisplay,
  getXsdDatatypeLocalName
} from './xsd-datatypes.js';

export {
  createTimestampedGraphIri,
  createUuid,
  isUuid
} from './identifiers.js';
