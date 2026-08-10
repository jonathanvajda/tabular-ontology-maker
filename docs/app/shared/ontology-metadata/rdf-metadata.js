import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';
import {
  datasetToQuads,
  literal,
  namedNode,
  quad
} from '../rdf-io/rdf-model.js';
import { normalizeOntologyMetadataRecord } from './settings.js';

/**
 * @typedef {{'@id'?: string, '@type'?: string|string[], [key: string]: any}} OntologyMetadataRecord
 */

/**
 * Converts a canonical ontology metadata record into RDF/JS quads.
 *
 * The input shape is JSON-LD-compatible and uses full IRI keys. This function
 * is the RDF materialization boundary for ontology metadata; callers should
 * keep compact keys as a serialization concern.
 *
 * @param {OntologyMetadataRecord} metadataRecord - Full-IRI ontology metadata record.
 * @param {object} [options]
 * @param {string|object|null} [options.graph=null] Optional named graph or graph term.
 * @param {boolean} [options.includeIriPolicy=true] Whether to emit OKEA IRI policy metadata.
 * @returns {object[]} RDF/JS quads for ontology-level metadata assertions.
 */
export function writeOntologyMetadataQuads(metadataRecord = {}, options = {}) {
  const record = normalizeOntologyMetadataRecord(metadataRecord);
  const ontologyIri = String(record['@id'] || '').trim();
  if (!ontologyIri) {
    throw new TypeError('writeOntologyMetadataQuads() requires an ontology metadata record with @id.');
  }

  const graph = options.graph || null;
  const includeIriPolicy = options.includeIriPolicy !== false;
  const subject = namedNode(ontologyIri);
  const quads = [];

  for (const typeIri of asArray(record['@type'])) {
    const iri = getJsonLdIdOrValue(typeIri);
    if (iri) quads.push(quad(subject, COMMON_NAMESPACE_IRIS.rdf.type, namedNode(iri), graph));
  }

  for (const [predicateIri, values] of Object.entries(record)) {
    if (predicateIri === '@id' || predicateIri === '@type') continue;
    if (!includeIriPolicy && isIriPolicyPredicate(predicateIri)) continue;
    if (!isAbsoluteIri(predicateIri)) continue;

    for (const value of asArray(values)) {
      const term = jsonLdValueToRdfTerm(value);
      if (term) quads.push(quad(subject, predicateIri, term, graph));
    }
  }

  return quads;
}

/**
 * Appends ontology metadata quads to an RDF/JS dataset or Store-like object.
 *
 * @param {any} dataset - Dataset/Store with an `add` or `addQuad` method.
 * @param {OntologyMetadataRecord} metadataRecord - Full-IRI ontology metadata record.
 * @param {object} [options] Writer options.
 * @returns {any} The same dataset object, after mutation.
 */
export function appendOntologyMetadataQuads(dataset, metadataRecord = {}, options = {}) {
  if (!dataset || (typeof dataset.add !== 'function' && typeof dataset.addQuad !== 'function')) {
    throw new TypeError('appendOntologyMetadataQuads() requires a dataset with add() or addQuad().');
  }
  for (const metadataQuad of writeOntologyMetadataQuads(metadataRecord, options)) {
    if (typeof dataset.addQuad === 'function') dataset.addQuad(metadataQuad);
    else dataset.add(metadataQuad);
  }
  return dataset;
}

/**
 * Reads one canonical ontology metadata record from RDF/JS quads.
 *
 * The ontology subject is selected from `rdf:type owl:Ontology` by default.
 * When no declaration exists and `options.ontologyIri` is supplied, that IRI is
 * used as the subject. Returned keys are full IRIs.
 *
 * @param {any} dataset - RDF/JS dataset-like value or quad iterable.
 * @param {object} [options]
 * @param {string} [options.ontologyIri] Optional ontology subject IRI.
 * @returns {OntologyMetadataRecord|null} Canonical ontology metadata record, or null when no subject is found.
 */
export function readOntologyMetadataRecordFromQuads(dataset, options = {}) {
  const quads = datasetToQuads(dataset);
  const ontologyIri = options.ontologyIri || findOntologySubjectIri(quads);
  if (!ontologyIri) return null;

  const record = {
    '@id': ontologyIri,
    '@type': [COMMON_NAMESPACE_IRIS.owl.Ontology]
  };

  for (const item of quads) {
    if (item.subject?.value !== ontologyIri) continue;
    const predicateIri = item.predicate?.value;
    if (!predicateIri || predicateIri === COMMON_NAMESPACE_IRIS.rdf.type) continue;
    if (!record[predicateIri]) record[predicateIri] = [];
    record[predicateIri].push(rdfTermToJsonLdValue(item.object));
  }

  return normalizeOntologyMetadataRecord(record);
}

function findOntologySubjectIri(quads) {
  const declaration = quads.find((item) =>
    item.predicate?.value === COMMON_NAMESPACE_IRIS.rdf.type &&
    item.object?.value === COMMON_NAMESPACE_IRIS.owl.Ontology &&
    item.subject?.termType === 'NamedNode'
  );
  return declaration?.subject?.value || '';
}

function jsonLdValueToRdfTerm(value) {
  if (value == null || value === '') return null;
  if (value && typeof value === 'object' && '@id' in value) return namedNode(value['@id']);
  if (value && typeof value === 'object' && '@value' in value) {
    return literal(value['@value'], {
      language: value['@language'] || '',
      datatype: value['@type'] || undefined
    });
  }
  if (typeof value === 'string' && /^https?:\/\/orcid\.org\//i.test(value)) return namedNode(value);
  return literal(value);
}

function rdfTermToJsonLdValue(term) {
  if (term?.termType === 'NamedNode') return { '@id': term.value };
  if (term?.termType === 'BlankNode') return { '@id': `_:${term.value}` };
  if (term?.termType === 'Literal') {
    const value = { '@value': term.value };
    if (term.language) value['@language'] = term.language;
    const datatypeIri = term.datatype?.value;
    if (datatypeIri && datatypeIri !== COMMON_NAMESPACE_IRIS.xsd.string && !term.language) {
      value['@type'] = datatypeIri;
    }
    return value;
  }
  return { '@value': String(term?.value ?? '') };
}

function getJsonLdIdOrValue(value) {
  if (value && typeof value === 'object' && '@id' in value) return String(value['@id'] || '');
  if (value && typeof value === 'object' && '@value' in value) return String(value['@value'] || '');
  return String(value || '');
}

function isIriPolicyPredicate(predicateIri) {
  return predicateIri === COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasIriPolicyModeTextValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameDelimiterTextValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameStyleTextValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasIriVersionTokenStrategyTextValue ||
    predicateIri === COMMON_NAMESPACE_IRIS.okea.hasIriVersionInsertionPositionTextValue;
}

function isAbsoluteIri(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(String(value || ''));
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
