import type { BaseField } from "@/types";

export const BASE_FIELDS: BaseField[] = [
  "iri",
  "label",
  "elementType",
  "definition",
  "isA",
  "isCuratedInOntology",
];

export const BASE_HEADERS = [
  "iri",
  "label",
  "element type",
  "definition",
  "is a",
  "is curated in ontology",
];

export const ELEMENT_TYPES = [
  "Class",
  "NamedIndividual",
  "ObjectProperty",
  "DatatypeProperty",
  "AnnotationProperty",
] as const;

export const iriPrefixes: Record<string, string> = {
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
  obo: "http://purl.obolibrary.org/obo/",
  oboInOwl: "http://www.geneontology.org/formats/oboInOwl#",
  cco2: "https://www.commoncoreontologies.org/",
  cceo: "http://www.ontologyrepository.com/CommonCoreOntologies/",
  ex: "http://example.org/",
};

export const w3cIRI = {
  RDF_TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  RDFS_LABEL: "http://www.w3.org/2000/01/rdf-schema#label",
  RDFS_SUBCLASS: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
  RDFS_SUBPROP: "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",
  OWL_ONTOLOGY: "http://www.w3.org/2002/07/owl#Ontology",
  OWL_CLASS: "http://www.w3.org/2002/07/owl#Class",
  OWL_NAMEDIND: "http://www.w3.org/2002/07/owl#NamedIndividual",
  OWL_OBJPROP: "http://www.w3.org/2002/07/owl#ObjectProperty",
  OWL_DATAPROP: "http://www.w3.org/2002/07/owl#DataProperty",
  OWL_ANNOPROP: "http://www.w3.org/2002/07/owl#AnnotationProperty",
  OWL_DATATYPE: "http://www.w3.org/2002/07/owl#DatatypeProperty",
  OWL_IMPORTS: "http://www.w3.org/2002/07/owl#imports",
  SKOS_DEFINITION: "http://www.w3.org/2004/02/skos/core#definition",
  CCO_CURATEDIN: "https://www.commoncoreontologies.org/ont00001760",
  DCTERMS_CREATOR: "http://purl.org/dc/terms/creator",
  DCTERMS_CREATED: "http://purl.org/dc/terms/created",
  DCTERMS_DESCRIPTION: "http://purl.org/dc/terms/description",
  DCTERMS_CITATION: "http://purl.org/dc/terms/bibliographicCitation",
  OBO_CURATION_STATUS: "http://purl.obolibrary.org/obo/IAO_0000114",
  OWL_VERSION_IRI: "http://www.w3.org/2002/07/owl#versionIRI",
  OWL_VERSION_INFO: "http://www.w3.org/2002/07/owl#versionInfo",
} as const;

