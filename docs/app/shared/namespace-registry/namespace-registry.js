/**
 * @file Common namespace registry data and registry-derived prefix maps.
 *
 * This module owns common namespace facts. Project/user prefixes should extend
 * this registry through `mergeProjectPrefixes`, not mutate this object.
 */

/**
 * @typedef {Readonly<{
 *   prefix: string,
 *   namespaceIri: string,
 *   ids: Readonly<Record<string, string>>
 * }>} NamespaceRegistryEntry
 */

const defineEntry = (entry) => Object.freeze({
  ...entry,
  ids: Object.freeze(entry.ids || {})
});

/**
 * Common ontology namespace registry.
 *
 * The `ids` object records frequently referenced local identifiers inside a
 * namespace without requiring every app to hard-code the same IRI fragments.
 *
 * @type {Readonly<Record<string, NamespaceRegistryEntry>>}
 */
export const COMMON_NAMESPACE_REGISTRY = Object.freeze({
  rdf: defineEntry({
    prefix: 'rdf',
    namespaceIri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    ids: {
      type: 'type',
      Property: 'Property',
      Statement: 'Statement',
      subject: 'subject',
      predicate: 'predicate',
      object: 'object',
      Bag: 'Bag',
      Seq: 'Seq',
      Alt: 'Alt',
      value: 'value',
      List: 'List',
      first: 'first',
      rest: 'rest',
      nil: 'nil',
      langString: 'langString',
      HTML: 'HTML',
      XMLLiteral: 'XMLLiteral',
      JSON: 'JSON',
      PlainLiteral: 'PlainLiteral'
    }
  }),
  rdfs: defineEntry({
    prefix: 'rdfs',
    namespaceIri: 'http://www.w3.org/2000/01/rdf-schema#',
    ids: {
      Resource: 'Resource',
      Class: 'Class',
      Literal: 'Literal',
      Datatype: 'Datatype',
      Container: 'Container',
      ContainerMembershipProperty: 'ContainerMembershipProperty',
      member: 'member',
      label: 'label',
      comment: 'comment',
      domain: 'domain',
      range: 'range',
      subClassOf: 'subClassOf',
      subPropertyOf: 'subPropertyOf',
      seeAlso: 'seeAlso',
      isDefinedBy: 'isDefinedBy'
    }
  }),
  owl: defineEntry({
    prefix: 'owl',
    namespaceIri: 'http://www.w3.org/2002/07/owl#',
    ids: {
      AllDifferent: 'AllDifferent',
      AllDisjointClasses: 'AllDisjointClasses',
      AllDisjointProperties: 'AllDisjointProperties',
      Annotation: 'Annotation',
      AnnotationProperty: 'AnnotationProperty',
      AsymmetricProperty: 'AsymmetricProperty',
      Axiom: 'Axiom',
      Class: 'Class',
      DataRange: 'DataRange',
      DatatypeProperty: 'DatatypeProperty',
      DeprecatedClass: 'DeprecatedClass',
      DeprecatedProperty: 'DeprecatedProperty',
      FunctionalProperty: 'FunctionalProperty',
      InverseFunctionalProperty: 'InverseFunctionalProperty',
      IrreflexiveProperty: 'IrreflexiveProperty',
      NamedIndividual: 'NamedIndividual',
      NegativePropertyAssertion: 'NegativePropertyAssertion',
      Nothing: 'Nothing',
      ObjectProperty: 'ObjectProperty',
      Ontology: 'Ontology',
      OntologyProperty: 'OntologyProperty',
      ReflexiveProperty: 'ReflexiveProperty',
      Restriction: 'Restriction',
      SymmetricProperty: 'SymmetricProperty',
      Thing: 'Thing',
      TransitiveProperty: 'TransitiveProperty',
      allValuesFrom: 'allValuesFrom',
      annotatedProperty: 'annotatedProperty',
      annotatedSource: 'annotatedSource',
      annotatedTarget: 'annotatedTarget',
      assertionProperty: 'assertionProperty',
      backwardCompatibleWith: 'backwardCompatibleWith',
      bottomDataProperty: 'bottomDataProperty',
      bottomObjectProperty: 'bottomObjectProperty',
      cardinality: 'cardinality',
      complementOf: 'complementOf',
      datatypeComplementOf: 'datatypeComplementOf',
      deprecated: 'deprecated',
      differentFrom: 'differentFrom',
      disjointUnionOf: 'disjointUnionOf',
      disjointWith: 'disjointWith',
      distinctMembers: 'distinctMembers',
      equivalentClass: 'equivalentClass',
      equivalentProperty: 'equivalentProperty',
      hasKey: 'hasKey',
      hasSelf: 'hasSelf',
      hasValue: 'hasValue',
      imports: 'imports',
      incompatibleWith: 'incompatibleWith',
      intersectionOf: 'intersectionOf',
      inverseOf: 'inverseOf',
      maxCardinality: 'maxCardinality',
      maxQualifiedCardinality: 'maxQualifiedCardinality',
      members: 'members',
      minCardinality: 'minCardinality',
      minQualifiedCardinality: 'minQualifiedCardinality',
      onClass: 'onClass',
      onDataRange: 'onDataRange',
      onDatatype: 'onDatatype',
      oneOf: 'oneOf',
      onProperties: 'onProperties',
      onProperty: 'onProperty',
      priorVersion: 'priorVersion',
      propertyChainAxiom: 'propertyChainAxiom',
      propertyDisjointWith: 'propertyDisjointWith',
      qualifiedCardinality: 'qualifiedCardinality',
      sameAs: 'sameAs',
      someValuesFrom: 'someValuesFrom',
      sourceIndividual: 'sourceIndividual',
      targetIndividual: 'targetIndividual',
      targetValue: 'targetValue',
      topDataProperty: 'topDataProperty',
      topObjectProperty: 'topObjectProperty',
      unionOf: 'unionOf',
      versionInfo: 'versionInfo',
      versionIRI: 'versionIRI',
      withRestrictions: 'withRestrictions'
    }
  }),
  xsd: defineEntry({
    prefix: 'xsd',
    namespaceIri: 'http://www.w3.org/2001/XMLSchema#',
    ids: {
      string: 'string',
      boolean: 'boolean',
      decimal: 'decimal',
      float: 'float',
      double: 'double',
      duration: 'duration',
      dateTime: 'dateTime',
      time: 'time',
      date: 'date',
      gYearMonth: 'gYearMonth',
      gYear: 'gYear',
      gMonthDay: 'gMonthDay',
      gDay: 'gDay',
      gMonth: 'gMonth',
      hexBinary: 'hexBinary',
      base64Binary: 'base64Binary',
      anyURI: 'anyURI',
      QName: 'QName',
      NOTATION: 'NOTATION',
      normalizedString: 'normalizedString',
      token: 'token',
      language: 'language',
      NMTOKEN: 'NMTOKEN',
      NMTOKENS: 'NMTOKENS',
      Name: 'Name',
      NCName: 'NCName',
      ID: 'ID',
      IDREF: 'IDREF',
      IDREFS: 'IDREFS',
      ENTITY: 'ENTITY',
      ENTITIES: 'ENTITIES',
      integer: 'integer',
      nonPositiveInteger: 'nonPositiveInteger',
      negativeInteger: 'negativeInteger',
      long: 'long',
      int: 'int',
      short: 'short',
      byte: 'byte',
      nonNegativeInteger: 'nonNegativeInteger',
      unsignedLong: 'unsignedLong',
      unsignedInt: 'unsignedInt',
      unsignedShort: 'unsignedShort',
      unsignedByte: 'unsignedByte',
      positiveInteger: 'positiveInteger'
    }
  }),
  skos: defineEntry({
    prefix: 'skos',
    namespaceIri: 'http://www.w3.org/2004/02/skos/core#',
    ids: {
      Collection: 'Collection',
      Concept: 'Concept',
      ConceptScheme: 'ConceptScheme',
      OrderedCollection: 'OrderedCollection',
      altLabel: 'altLabel',
      broadMatch: 'broadMatch',
      broader: 'broader',
      broaderTransitive: 'broaderTransitive',
      changeNote: 'changeNote',
      closeMatch: 'closeMatch',
      definition: 'definition',
      editorialNote: 'editorialNote',
      exactMatch: 'exactMatch',
      example: 'example',
      hasTopConcept: 'hasTopConcept',
      hiddenLabel: 'hiddenLabel',
      historyNote: 'historyNote',
      inScheme: 'inScheme',
      mappingRelation: 'mappingRelation',
      member: 'member',
      memberList: 'memberList',
      narrowMatch: 'narrowMatch',
      narrower: 'narrower',
      narrowerTransitive: 'narrowerTransitive',
      notation: 'notation',
      note: 'note',
      prefLabel: 'prefLabel',
      related: 'related',
      relatedMatch: 'relatedMatch',
      scopeNote: 'scopeNote',
      semanticRelation: 'semanticRelation',
      topConceptOf: 'topConceptOf'
    }
  }),
  dcterms: defineEntry({
    prefix: 'dcterms',
    namespaceIri: 'http://purl.org/dc/terms/',
    ids: {
      Agent: 'Agent',
      AgentClass: 'AgentClass',
      BibliographicResource: 'BibliographicResource',
      FileFormat: 'FileFormat',
      Frequency: 'Frequency',
      Jurisdiction: 'Jurisdiction',
      LicenseDocument: 'LicenseDocument',
      LinguisticSystem: 'LinguisticSystem',
      Location: 'Location',
      LocationPeriodOrJurisdiction: 'LocationPeriodOrJurisdiction',
      MediaType: 'MediaType',
      MediaTypeOrExtent: 'MediaTypeOrExtent',
      MethodOfAccrual: 'MethodOfAccrual',
      MethodOfInstruction: 'MethodOfInstruction',
      Period: 'Period',
      PeriodOfTime: 'PeriodOfTime',
      PhysicalMedium: 'PhysicalMedium',
      PhysicalResource: 'PhysicalResource',
      Policy: 'Policy',
      ProvenanceStatement: 'ProvenanceStatement',
      RightsStatement: 'RightsStatement',
      SizeOrDuration: 'SizeOrDuration',
      Standard: 'Standard',
      abstract: 'abstract',
      accessRights: 'accessRights',
      accrualMethod: 'accrualMethod',
      accrualPeriodicity: 'accrualPeriodicity',
      accrualPolicy: 'accrualPolicy',
      alternative: 'alternative',
      audience: 'audience',
      available: 'available',
      bibliographicCitation: 'bibliographicCitation',
      conformsTo: 'conformsTo',
      contributor: 'contributor',
      coverage: 'coverage',
      created: 'created',
      creator: 'creator',
      date: 'date',
      dateAccepted: 'dateAccepted',
      dateCopyrighted: 'dateCopyrighted',
      dateSubmitted: 'dateSubmitted',
      description: 'description',
      educationLevel: 'educationLevel',
      extent: 'extent',
      format: 'format',
      hasFormat: 'hasFormat',
      hasPart: 'hasPart',
      hasVersion: 'hasVersion',
      identifier: 'identifier',
      instructionalMethod: 'instructionalMethod',
      isFormatOf: 'isFormatOf',
      isPartOf: 'isPartOf',
      isReferencedBy: 'isReferencedBy',
      isReplacedBy: 'isReplacedBy',
      isRequiredBy: 'isRequiredBy',
      issued: 'issued',
      isVersionOf: 'isVersionOf',
      language: 'language',
      license: 'license',
      mediator: 'mediator',
      medium: 'medium',
      modified: 'modified',
      provenance: 'provenance',
      publisher: 'publisher',
      references: 'references',
      relation: 'relation',
      replaces: 'replaces',
      requires: 'requires',
      rights: 'rights',
      rightsHolder: 'rightsHolder',
      source: 'source',
      spatial: 'spatial',
      subject: 'subject',
      tableOfContents: 'tableOfContents',
      temporal: 'temporal',
      title: 'title',
      type: 'type',
      valid: 'valid'
    }
  }),
  dc: defineEntry({
    prefix: 'dc',
    namespaceIri: 'http://purl.org/dc/elements/1.1/',
    ids: { title: 'title', description: 'description', rights: 'rights' }
  }),
  obo: defineEntry({
    prefix: 'obo',
    namespaceIri: 'http://purl.obolibrary.org/obo/',
    ids: {}
  }),
  bfo: defineEntry({
    prefix: 'bfo',
    namespaceIri: 'http://purl.obolibrary.org/obo/BFO_',
    ids: {}
  }),
  iao: defineEntry({
    prefix: 'iao',
    namespaceIri: 'http://purl.obolibrary.org/obo/IAO_',
    ids: {
      definition: '0000115',
      definitionSource: '0000119',
      exampleOfUsage: '0000112',
      editorNote: '0000116',
      termEditor: '0000117',
      alternativeTerm: '0000118',
      curatorNote: '0000232',
      elucidation: '0000600'
    }
  }),
  oboInOwl: defineEntry({
    prefix: 'oboInOwl',
    namespaceIri: 'http://www.geneontology.org/formats/oboInOwl#',
    ids: {
      hasDbXref: 'hasDbXref',
      hasExactSynonym: 'hasExactSynonym',
      hasNarrowSynonym: 'hasNarrowSynonym',
      hasBroadSynonym: 'hasBroadSynonym',
      hasRelatedSynonym: 'hasRelatedSynonym',
      hasOBONamespace: 'hasOBONamespace',
      id: 'id'
    }
  }),
  cco: defineEntry({
    prefix: 'cco',
    namespaceIri: 'http://www.ontologyrepository.com/CommonCoreOntologies/',
    ids: {}
  }),
  cceo: defineEntry({
    prefix: 'cceo',
    namespaceIri: 'http://www.ontologyrepository.com/CommonCoreOntologies/',
    ids: {}
  }),
  cco2: defineEntry({
    prefix: 'cco2',
    namespaceIri: 'https://www.commoncoreontologies.org/',
    ids: {}
  }),
  foaf: defineEntry({
    prefix: 'foaf',
    namespaceIri: 'http://xmlns.com/foaf/0.1/',
    ids: {}
  }),
  prov: defineEntry({
    prefix: 'prov',
    namespaceIri: 'http://www.w3.org/ns/prov#',
    ids: {}
  }),
  dcat: defineEntry({
    prefix: 'dcat',
    namespaceIri: 'http://www.w3.org/ns/dcat#',
    ids: {}
  }),
  geo: defineEntry({
    prefix: 'geo',
    namespaceIri: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
    ids: {}
  }),
  geojson: defineEntry({
    prefix: 'geojson',
    namespaceIri: 'https://purl.org/geojson/vocab#',
    ids: {}
  }),
  vcard: defineEntry({
    prefix: 'vcard',
    namespaceIri: 'http://www.w3.org/2006/vcard/ns#',
    ids: {}
  })
});

/**
 * Converts a namespace registry into the package's plain prefix-map shape.
 *
 * @param {Readonly<Record<string, NamespaceRegistryEntry>>} [registry]
 * Registry entries keyed by any stable name.
 * @returns {Readonly<Record<string, string>>} Frozen prefix-to-namespace map.
 */
export function namespacePrefixMapFromRegistry(registry = COMMON_NAMESPACE_REGISTRY) {
  return Object.freeze(Object.fromEntries(
    Object.values(registry).map((entry) => [entry.prefix, entry.namespaceIri])
  ));
}

/**
 * Derives a namespace-to-prefix reverse map from a prefix map.
 *
 * @param {Record<string, string>} prefixes - Prefix-to-namespace map.
 * @returns {Readonly<Record<string, string>>} Frozen namespace-to-prefix map.
 */
export function namespaceToPrefixMap(prefixes = namespacePrefixMapFromRegistry()) {
  return Object.freeze(Object.fromEntries(
    Object.entries(prefixes || {}).map(([prefix, namespaceIri]) => [namespaceIri, prefix])
  ));
}

/**
 * Builds a full IRI from a registry entry and one of its known local IDs.
 *
 * @param {string} registryKey - Key in `COMMON_NAMESPACE_REGISTRY`.
 * @param {string} idKey - Key in the entry's `ids` object.
 * @param {Readonly<Record<string, NamespaceRegistryEntry>>} [registry]
 * Registry to read from.
 * @returns {Readonly<{ok: true, value: string}> | Readonly<{ok: false, error: 'unknown namespace'|'unknown namespace id', input: string}>}
 */
export function iriForNamespaceId(registryKey, idKey, registry = COMMON_NAMESPACE_REGISTRY) {
  const entry = registry?.[registryKey];
  if (!entry) return Object.freeze({ ok: false, error: 'unknown namespace', input: String(registryKey || '') });
  const local = entry.ids?.[idKey];
  if (!local) return Object.freeze({ ok: false, error: 'unknown namespace id', input: String(idKey || '') });
  return Object.freeze({ ok: true, value: `${entry.namespaceIri}${local}` });
}
