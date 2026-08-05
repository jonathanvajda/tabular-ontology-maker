import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';
import { blankNode, literal, namedNode, quad } from './rdf-model.js';

/**
 * @typedef {object} ObjectToRdfPropertySpec
 * @property {string} [field] - Object field to read. Defaults to the property map key.
 * @property {string} [predicate] - Predicate IRI. Defaults to the property map key.
 * @property {'literal'|'iri'|'blank'} [termType='literal'] - RDF object term strategy.
 * @property {string} [datatype] - Literal datatype IRI.
 * @property {string|Function} [language] - Literal language or function returning one.
 * @property {boolean} [multiple=false] - Treat the source value as an array.
 * @property {Function} [transform] - Function called before term creation.
 */

/**
 * Converts application in-memory objects into RDF/JS quads using a mapping.
 *
 * This is the promotion target for the GRP-008 and GRP-009 families: apps keep
 * their local object models, but describe how those objects become RDF. JSON-LD
 * serialization should then consume the returned quads through
 * `serializeRdfDataset(..., { format: 'jsonld' })` rather than building a
 * separate JSON-LD-only branch.
 *
 * @param {object[]} objects - Application records, graph nodes, column schemas, query records, or ontology rows.
 * @param {object} options - Mapping options.
 * @param {string|Function} options.subject - Field name or function that returns the subject IRI/blank node id.
 * @param {string|string[]|Function} [options.type] - RDF class IRI(s), field name, or function returning class IRI(s).
 * @param {Record<string, string|ObjectToRdfPropertySpec>} options.properties - Predicate/property mapping.
 * @param {string|Function} [options.graph] - Optional named graph IRI or function returning one.
 * @param {boolean} [options.skipNullValues=true] - Skip null, undefined, and empty-string values.
 * @returns {{quads: object[], warnings: object[], subjects: string[]}} RDF projection result.
 */
export function createRdfQuadsFromObjects(objects, options = {}) {
  if (!Array.isArray(objects)) throw new TypeError('objects must be an array.');
  if (!options.subject) throw new TypeError('Object-to-RDF mapping requires a subject option.');
  if (!options.properties || typeof options.properties !== 'object') {
    throw new TypeError('Object-to-RDF mapping requires a properties object.');
  }

  const warnings = [];
  const out = [];
  const subjects = [];
  const skipNullValues = options.skipNullValues !== false;

  objects.forEach((record, index) => {
    const rowNumber = index + 1;
    const subjectValue = readMappedValue(record, options.subject, { record, rowNumber });
    if (isMissingValue(subjectValue)) {
      warnings.push({
        code: 'missing_subject',
        message: `Object ${rowNumber} was skipped because its RDF subject is missing.`,
        row: rowNumber
      });
      return;
    }

    const subject = termFromResourceValue(subjectValue);
    subjects.push(subject.value);
    const graph = options.graph ? termFromResourceValue(readMappedValue(record, options.graph, { record, rowNumber })) : undefined;

    for (const typeIri of valuesFrom(readMappedValue(record, options.type, { record, rowNumber }), options.type)) {
      if (!isMissingValue(typeIri)) out.push(quad(subject, COMMON_NAMESPACE_IRIS.rdf.type, namedNode(typeIri), graph));
    }

    for (const [key, rawSpec] of Object.entries(options.properties)) {
      const spec = normalizePropertySpec(key, rawSpec);
      const rawValue = readMappedValue(record, spec.field, { record, rowNumber, property: key });
      const values = spec.multiple || Array.isArray(rawValue) ? valuesFrom(rawValue) : [rawValue];

      values.forEach((value, valueIndex) => {
        const transformed = typeof spec.transform === 'function'
          ? spec.transform(value, { record, rowNumber, property: key, valueIndex })
          : value;
        if (skipNullValues && isMissingValue(transformed)) return;
        try {
          out.push(quad(subject, spec.predicate, objectTermFromValue(transformed, spec, { record, rowNumber }), graph));
        } catch (error) {
          warnings.push({
            code: 'invalid_property_value',
            message: `Object ${rowNumber} property "${key}" could not be converted to RDF: ${error.message}`,
            row: rowNumber,
            property: key
          });
        }
      });
    }
  });

  return { quads: out, warnings, subjects };
}

/**
 * Creates RDF quads from JSON-LD-like graph objects without requiring jsonld.js.
 *
 * This helper is for app-local graph objects that already use `@id`, `@type`,
 * and property keys. It is not a full JSON-LD parser; full JSON-LD expansion
 * belongs in a jsonld adapter.
 *
 * @param {object|object[]} graph - JSON-LD-like node or document with `@graph`.
 * @param {object} [options] - Conversion options.
 * @param {Record<string, string|object>} [options.context] - Context for compact property keys.
 * @param {string} [options.graph] - Optional named graph IRI.
 * @returns {{quads: object[], warnings: object[], subjects: string[]}} RDF projection result.
 */
export function createRdfQuadsFromJsonLdGraph(graph, options = {}) {
  const context = options.context || graph?.['@context'] || {};
  const nodes = Array.isArray(graph) ? graph : Array.isArray(graph?.['@graph']) ? graph['@graph'] : [graph];
  return createRdfQuadsFromObjects(nodes.filter(Boolean), {
    subject: '@id',
    type: (node) => node['@type'],
    graph: options.graph,
    properties: createPropertiesFromJsonLdNodes(nodes, context)
  });
}

function createPropertiesFromJsonLdNodes(nodes, context) {
  const keys = new Set();
  nodes.filter(Boolean).forEach((node) => {
    Object.keys(node).forEach((key) => {
      if (!key.startsWith('@')) keys.add(key);
    });
  });
  const properties = {};
  keys.forEach((key) => {
    properties[key] = {
      field: key,
      predicate: expandContextKey(key, context),
      multiple: true,
      transform: (value) => jsonLdValueToObjectMappingValue(value)
    };
  });
  return properties;
}

function jsonLdValueToObjectMappingValue(value) {
  if (value && typeof value === 'object' && '@id' in value) return { value: value['@id'], termType: 'iri' };
  if (value && typeof value === 'object' && '@value' in value) {
    return {
      value: value['@value'],
      termType: 'literal',
      language: value['@language'] || '',
      datatype: value['@type'] || COMMON_NAMESPACE_IRIS.xsd.string
    };
  }
  return value;
}

function normalizePropertySpec(key, rawSpec) {
  if (typeof rawSpec === 'string') return { field: key, predicate: rawSpec, termType: 'literal' };
  const spec = rawSpec || {};
  return {
    field: spec.field || key,
    predicate: spec.predicate || key,
    termType: spec.termType || 'literal',
    datatype: spec.datatype,
    language: spec.language,
    multiple: spec.multiple === true,
    transform: spec.transform
  };
}

function readMappedValue(record, mapping, context) {
  if (!mapping) return undefined;
  if (typeof mapping === 'function') return mapping(record, context);
  return record?.[mapping];
}

function valuesFrom(value, fallback) {
  if (Array.isArray(value)) return value.flatMap((item) => valuesFrom(item));
  if (value === undefined && typeof fallback === 'string' && looksLikeIri(fallback)) return [fallback];
  return [value];
}

function objectTermFromValue(rawValue, spec, context) {
  const value = normalizeMappedObjectValue(rawValue);
  const termType = value.termType || spec.termType || 'literal';
  if (termType === 'iri') return namedNode(value.value);
  if (termType === 'blank') return blankNode(value.value);
  return literal(value.value, {
    datatype: value.datatype || spec.datatype || COMMON_NAMESPACE_IRIS.xsd.string,
    language: value.language || resolveLanguage(spec.language, context) || ''
  });
}

function resolveLanguage(language, context) {
  if (typeof language === 'function') return language(context.record, context);
  return language || '';
}

function normalizeMappedObjectValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return value;
  return { value };
}

function termFromResourceValue(value) {
  if (value && typeof value === 'object' && value.termType) return value;
  const text = String(value ?? '').trim();
  return text.startsWith('_:') ? blankNode(text) : namedNode(text);
}

function expandContextKey(key, context) {
  const value = context?.[key];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && value['@id']) return value['@id'];
  return key;
}

function isMissingValue(value) {
  return value == null || String(value).trim() === '';
}

function looksLikeIri(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(value));
}
