import {
  COMMON_NAMESPACE_IRIS,
  COMMON_NAMESPACE_REGISTRY,
  namespacePrefixMapFromRegistry,
  compactIriToCurie
} from '../namespace-registry/index.js';

function normalizeDatatypeIri(datatypeIri) {
  return String(datatypeIri || COMMON_NAMESPACE_IRIS.xsd.string).trim();
}

function isIntegerDatatypeIri(datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);
  return iri === COMMON_NAMESPACE_IRIS.xsd.integer
    || iri === COMMON_NAMESPACE_IRIS.xsd.nonPositiveInteger
    || iri === COMMON_NAMESPACE_IRIS.xsd.negativeInteger
    || iri === COMMON_NAMESPACE_IRIS.xsd.long
    || iri === COMMON_NAMESPACE_IRIS.xsd.int
    || iri === COMMON_NAMESPACE_IRIS.xsd.short
    || iri === COMMON_NAMESPACE_IRIS.xsd.byte
    || iri === COMMON_NAMESPACE_IRIS.xsd.nonNegativeInteger
    || iri === COMMON_NAMESPACE_IRIS.xsd.unsignedLong
    || iri === COMMON_NAMESPACE_IRIS.xsd.unsignedInt
    || iri === COMMON_NAMESPACE_IRIS.xsd.unsignedShort
    || iri === COMMON_NAMESPACE_IRIS.xsd.unsignedByte
    || iri === COMMON_NAMESPACE_IRIS.xsd.positiveInteger;
}

function isNumberDatatypeIri(datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);
  return iri === COMMON_NAMESPACE_IRIS.xsd.decimal
    || iri === COMMON_NAMESPACE_IRIS.xsd.float
    || iri === COMMON_NAMESPACE_IRIS.xsd.double;
}

/**
 * Return the XSD datatype local name for a datatype IRI.
 *
 * Unknown or non-XSD datatypes return an empty string instead of throwing.
 *
 * @param {unknown} datatypeIri - Candidate datatype IRI.
 * @returns {string} XSD local name such as `string`, `integer`, or `dateTime`.
 */
export function getXsdDatatypeLocalName(datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);
  return iri.startsWith(COMMON_NAMESPACE_REGISTRY.xsd.namespaceIri)
    ? iri.slice(COMMON_NAMESPACE_REGISTRY.xsd.namespaceIri.length)
    : '';
}

/**
 * Format a datatype IRI using the common namespace registry when possible.
 *
 * @param {unknown} datatypeIri - Candidate datatype IRI.
 * @returns {string} CURIE for registered datatype IRIs, otherwise the input IRI.
 */
export function formatDatatypeIriForDisplay(datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);
  const compact = compactIriToCurie(iri, namespacePrefixMapFromRegistry());
  return compact.ok ? compact.value : iri;
}

/**
 * Describe an XSD datatype as a JSON Schema fragment.
 *
 * This is intentionally a practical schema description, not a complete XSD
 * validator. Date/time-like values remain JSON strings with a format hint.
 *
 * @param {unknown} datatypeIri - XSD datatype IRI.
 * @returns {Readonly<Record<string, string>>} JSON Schema type/format fragment.
 */
export function describeXsdDatatypeForJsonSchema(datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);

  if (isIntegerDatatypeIri(iri)) return Object.freeze({ type: 'integer' });
  if (isNumberDatatypeIri(iri)) return Object.freeze({ type: 'number' });
  if (iri === COMMON_NAMESPACE_IRIS.xsd.boolean) return Object.freeze({ type: 'boolean' });
  if (iri === COMMON_NAMESPACE_IRIS.xsd.date) return Object.freeze({ type: 'string', format: 'date' });
  if (iri === COMMON_NAMESPACE_IRIS.xsd.dateTime) return Object.freeze({ type: 'string', format: 'date-time' });
  if (iri === COMMON_NAMESPACE_IRIS.xsd.time) return Object.freeze({ type: 'string', format: 'time' });
  if (iri === COMMON_NAMESPACE_IRIS.xsd.anyURI) return Object.freeze({ type: 'string', format: 'uri' });

  return Object.freeze({ type: 'string' });
}

/**
 * Coerce a lexical string into the JavaScript primitive implied by an XSD
 * datatype when doing so is unambiguous.
 *
 * Invalid lexical values return their trimmed string so callers do not lose
 * the source value. Empty values return `undefined`.
 *
 * @param {unknown} value - Lexical value to coerce.
 * @param {unknown} datatypeIri - XSD datatype IRI.
 * @returns {string | number | boolean | undefined} Coerced primitive or source
 * string when coercion is not safe.
 */
export function coerceLexicalValueForXsdDatatype(value, datatypeIri) {
  const iri = normalizeDatatypeIri(datatypeIri);
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return undefined;

  if (isIntegerDatatypeIri(iri)) {
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : trimmed;
  }

  if (isNumberDatatypeIri(iri)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }

  if (iri === COMMON_NAMESPACE_IRIS.xsd.boolean) {
    if (trimmed === 'true' || trimmed === '1') return true;
    if (trimmed === 'false' || trimmed === '0') return false;
  }

  return trimmed;
}
