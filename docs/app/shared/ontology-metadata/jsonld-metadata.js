import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';

const ONTOLOGY_METADATA_PREDICATES = Object.freeze({
  type: Object.freeze([COMMON_NAMESPACE_IRIS.rdf.type, 'rdf:type', '@type']),
  label: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.title, 'dcterms:title', COMMON_NAMESPACE_IRIS.dc.title, 'dc:title', COMMON_NAMESPACE_IRIS.rdfs.label, 'rdfs:label']),
  description: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.description, 'dcterms:description', COMMON_NAMESPACE_IRIS.dc.description, 'dc:description', COMMON_NAMESPACE_IRIS.skos.definition, 'skos:definition', COMMON_NAMESPACE_IRIS.rdfs.comment, 'rdfs:comment']),
  versionIri: Object.freeze([COMMON_NAMESPACE_IRIS.owl.versionIRI, 'owl:versionIRI']),
  versionInfo: Object.freeze([COMMON_NAMESPACE_IRIS.owl.versionInfo, 'owl:versionInfo']),
  imports: Object.freeze([COMMON_NAMESPACE_IRIS.owl.imports, 'owl:imports']),
  license: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.license, 'dcterms:license', COMMON_NAMESPACE_IRIS.dc.license, 'dc:license']),
  rightsHolder: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.rightsHolder, 'dcterms:rightsHolder', COMMON_NAMESPACE_IRIS.dcterms.rights, 'dcterms:rights', COMMON_NAMESPACE_IRIS.dc.rights, 'dc:rights']),
  creator: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.creator, 'dcterms:creator', COMMON_NAMESPACE_IRIS.dc.creator, 'dc:creator']),
  contributor: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.contributor, 'dcterms:contributor', COMMON_NAMESPACE_IRIS.dc.contributor, 'dc:contributor']),
  comment: Object.freeze([COMMON_NAMESPACE_IRIS.rdfs.comment, 'rdfs:comment']),
  created: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.created, 'dcterms:created']),
  modified: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.modified, 'dcterms:modified']),
  publisher: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.publisher, 'dcterms:publisher']),
  citation: Object.freeze([COMMON_NAMESPACE_IRIS.dcterms.bibliographicCitation, 'dcterms:bibliographicCitation']),
  priorVersion: Object.freeze([COMMON_NAMESPACE_IRIS.owl.priorVersion, 'owl:priorVersion']),
  backwardCompatibleWith: Object.freeze([COMMON_NAMESPACE_IRIS.owl.backwardCompatibleWith, 'owl:backwardCompatibleWith']),
  incompatibleWith: Object.freeze([COMMON_NAMESPACE_IRIS.owl.incompatibleWith, 'owl:incompatibleWith']),
  curatedIn: Object.freeze([COMMON_NAMESPACE_IRIS.cco2.curatedIn, COMMON_NAMESPACE_IRIS.rdfs.isDefinedBy, 'rdfs:isDefinedBy'])
});

/**
 * Return the JSON-LD graph array from object, array, or empty input.
 *
 * @param {unknown} jsonld - JSON-LD object, JSON-LD graph object, or graph array.
 * @returns {object[]} Graph node objects.
 */
export function getJsonLdGraphNodes(jsonld) {
  if (Array.isArray(jsonld)) return jsonld.filter((node) => node && typeof node === 'object');
  if (Array.isArray(jsonld?.['@graph'])) return jsonld['@graph'].filter((node) => node && typeof node === 'object');
  return [];
}

/**
 * Read ontology metadata records from JSON-LD object or graph form.
 *
 * The returned shape intentionally preserves the OntoEagle catalog contract
 * while moving predicate priority and value normalization into a shared pure
 * function. Later package passes can add a full-IRI-keyed durable record shape
 * without keeping app-local predicate tables.
 *
 * @param {unknown} jsonld - JSON-LD object, JSON-LD graph object, or graph array.
 * @returns {{records: object[], byIri: Map<string, object>, versionToOntologyIri: Map<string, string>}}
 */
export function readOntologyRecordsFromJsonLd(jsonld) {
  const records = [];
  const versionToOntologyIri = new Map();

  for (const node of getJsonLdGraphNodes(jsonld)) {
    if (typeof node['@id'] !== 'string') continue;
    if (!hasOntologyType(node)) continue;

    const iri = node['@id'];
    const versionIris = valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.versionIri));
    const record = {
      iri,
      label: firstPreferredString(node, ONTOLOGY_METADATA_PREDICATES.label) || iri,
      description: firstPreferredString(node, ONTOLOGY_METADATA_PREDICATES.description),
      versionIri: versionIris[0] || '',
      versionIriCount: versionIris.length,
      versionInfo: uniqueStrings(valueToStrings(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.versionInfo))),
      imports: uniqueStrings(valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.imports))),
      license: displayValues(node, ONTOLOGY_METADATA_PREDICATES.license),
      rightsHolder: displayValues(node, ONTOLOGY_METADATA_PREDICATES.rightsHolder),
      creators: displayValues(node, ONTOLOGY_METADATA_PREDICATES.creator),
      contributors: displayValues(node, ONTOLOGY_METADATA_PREDICATES.contributor),
      comments: displayValues(node, ONTOLOGY_METADATA_PREDICATES.comment),
      created: displayValues(node, ONTOLOGY_METADATA_PREDICATES.created),
      modified: displayValues(node, ONTOLOGY_METADATA_PREDICATES.modified),
      publisher: displayValues(node, ONTOLOGY_METADATA_PREDICATES.publisher),
      citations: displayValues(node, ONTOLOGY_METADATA_PREDICATES.citation),
      priorVersion: valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.priorVersion)),
      backwardCompatibleWith: valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.backwardCompatibleWith)),
      incompatibleWith: valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.incompatibleWith)),
      registry: null,
      ontology_level: 'unsorted',
      registered: false,
      addedByUser: false
    };

    records.push(record);
    for (const versionIri of versionIris) versionToOntologyIri.set(versionIri, iri);
  }

  return { records, byIri: new Map(records.map((record) => [record.iri, record])), versionToOntologyIri };
}

/**
 * Return the first available value for a prioritized list of JSON-LD keys.
 *
 * @param {object} node - JSON-LD node object.
 * @param {readonly string[]} keys - Keys in priority order.
 * @returns {unknown}
 */
export function getAnyJsonLdValue(node, keys) {
  if (!node || typeof node !== 'object') return undefined;
  for (const key of keys) {
    if (key in node) return node[key];
  }
  return undefined;
}

function valuesForKeys(node, keys) {
  const values = [];
  for (const key of keys) {
    const raw = getAnyJsonLdValue(node, [key]);
    if (raw == null) continue;
    values.push(...(Array.isArray(raw) ? raw : [raw]));
    if (values.length) break;
  }
  return values;
}

function hasOntologyType(node) {
  return valueToStrings(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.type)).includes(COMMON_NAMESPACE_IRIS.owl.Ontology)
    || valueToIris(getAnyJsonLdValue(node, ONTOLOGY_METADATA_PREDICATES.type)).includes(COMMON_NAMESPACE_IRIS.owl.Ontology);
}

function firstPreferredString(node, keys) {
  const values = sortLanguagePreferred(valuesForKeys(node, keys));
  return valueToStrings(values)[0] || valueToDisplayValues(values)[0]?.value || '';
}

function displayValues(node, keys) {
  return valueToDisplayValues(sortLanguagePreferred(valuesForKeys(node, keys)));
}

function languageRank(value) {
  if (!value || typeof value !== 'object') return 1;
  const lang = String(value['@language'] || '').toLowerCase();
  if (lang === 'en') return 0;
  if (!lang) return 1;
  return 2;
}

function sortLanguagePreferred(values) {
  return [...values].sort((a, b) => languageRank(a) - languageRank(b));
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function valueToStrings(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && '@value' in item) return String(item['@value']);
      return '';
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueToIris(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((item) => {
      if (typeof item === 'string' && /^https?:|^urn:|^file:|^tag:|^mailto:/.test(item)) return item;
      if (item && typeof item === 'object' && typeof item['@id'] === 'string') return item['@id'];
      return '';
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueToDisplayValues(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map((item) => {
    if (typeof item === 'string') return { value: item, type: 'literal', language: '' };
    if (item && typeof item === 'object' && typeof item['@id'] === 'string') {
      return { value: item['@id'], type: 'iri', language: '' };
    }
    if (item && typeof item === 'object' && '@value' in item) {
      return {
        value: String(item['@value']),
        type: item['@type'] || 'literal',
        language: item['@language'] || ''
      };
    }
    return { value: String(item ?? ''), type: 'literal', language: '' };
  }).filter((item) => item.value);
}
