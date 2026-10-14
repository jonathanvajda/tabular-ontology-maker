import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';
import {
  getLocalDateParts,
  normalizeStringToCase,
  normalizeStringToPascalCase
} from '../normalization-utils/index.js';

/**
 * Full IRI setting key for ontology metadata/profile settings.
 */
export const ONTOLOGY_METADATA_PROFILE_SETTING_KEY = COMMON_NAMESPACE_IRIS.okea.OntologyMetadataProfile;

/**
 * Generate canonical ontology metadata/settings used by ontology authoring apps.
 *
 * The returned object is the durable full-IRI JSON-LD-compatible metadata
 * record. Browser UI code that still needs local field names should call
 * `createOntologySettingsViewFromMetadataRecord()` at the adapter boundary.
 *
 * @param {object} [options]
 * @param {string} [options.base='http://example.org'] Base namespace IRI without the ontology local name.
 * @param {string} [options.label='Example Ontology'] Ontology display label.
 * @param {string} [options.creator='Barry Guarino'] Creator text value.
 * @param {string} [options.description='An example ontology'] Description text value.
 * @param {string} [options.delimiter='/'] Delimiter between base IRI and local name.
 * @param {'opaque'|'readable'} [options.iriMode='opaque'] Local IRI provisioning mode.
 * @param {string} [options.opaqueLeading='ont'] Opaque local IRI prefix.
 * @param {number} [options.opaqueDigits=6] Opaque numeric width.
 * @param {number} [options.opaqueStart=1] First opaque number.
 * @param {string} [options.readableCase='PascalCase'] Human-readable local name style.
 * @param {{year:string|number, month:string|number, day:string|number}} [options.dateParts] Date parts for deterministic tests.
 * @returns {object} Canonical ontology metadata/settings record.
 */
export function generateOntologySettings(options = {}) {
  const dateParts = options.dateParts || getLocalDateParts();
  const base = options.base || 'http://example.org';
  const label = options.label || 'Example Ontology';
  const creator = options.creator || 'Barry Guarino';
  const description = options.description || 'An example ontology';
  const delimiter = options.delimiter || '/';
  const iriMode = options.iriMode || 'opaque';
  const opaqueLeading = options.opaqueLeading || 'ont';
  const opaqueDigits = options.opaqueDigits == null ? 6 : options.opaqueDigits;
  const opaqueStart = options.opaqueStart == null ? 1 : options.opaqueStart;
  const readableCase = options.readableCase || 'PascalCase';
  const normalizedLabel = normalizeStringToPascalCase(label);

  return normalizeOntologyMetadataRecord({
    iri: `${base}${delimiter}${normalizedLabel}`,
    [COMMON_NAMESPACE_IRIS.owl.versionIRI]: `${base}/${dateParts.year}-${dateParts.month}-${dateParts.day}${delimiter}${normalizedLabel}`,
    [COMMON_NAMESPACE_IRIS.owl.versionInfo]: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    [COMMON_NAMESPACE_IRIS.dcterms.title]: label,
    [COMMON_NAMESPACE_IRIS.dcterms.creator]: creator,
    [COMMON_NAMESPACE_IRIS.dcterms.description]: description,
    iriMode,
    opaqueLeading,
    opaqueDigits,
    opaqueStart,
    readableCase,
    delimiter,
    base
  });
}

/**
 * Normalize ontology metadata into the canonical full-IRI JSON-LD-compatible
 * record shape used for durable project/app/user settings.
 *
 * Legacy TOM settings are accepted as input, but the returned record does not
 * preserve local field names such as `base`, `iriMode`, or `opaqueDigits`.
 *
 * @param {object} [input] Ontology metadata/settings input.
 * @param {object} [options]
 * @param {object} [options.defaults] Default metadata/profile values.
 * @returns {object} Canonical ontology metadata record.
 */
export function normalizeOntologyMetadataRecord(input = {}, options = {}) {
  const defaults = options.defaults || {};
  const source = { ...defaults, ...input };
  const ontologyIri = getFirstIri(source['@id']) || getFirstIri(source.iri) || null;
  const title = firstValue(source[COMMON_NAMESPACE_IRIS.dcterms.title])
    || firstValue(source[COMMON_NAMESPACE_IRIS.dc.title])
    || firstValue(source[COMMON_NAMESPACE_IRIS.rdfs.label])
    || firstValue(source.label);
  const description = firstValue(source[COMMON_NAMESPACE_IRIS.dcterms.description])
    || firstValue(source[COMMON_NAMESPACE_IRIS.dc.description])
    || firstValue(source[COMMON_NAMESPACE_IRIS.rdfs.comment])
    || firstValue(source.description);
  const versionIri = firstNodeValue(source[COMMON_NAMESPACE_IRIS.owl.versionIRI]);
  const versionInfo = firstValue(source[COMMON_NAMESPACE_IRIS.owl.versionInfo]);
  const baseIri = firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri]) || firstValue(source.base);
  const created = firstValue(source[COMMON_NAMESPACE_IRIS.dcterms.created])
    || firstValue(source[COMMON_NAMESPACE_IRIS.dc.created])
    || firstValue(source.createdAtIso)
    || firstValue(source.createdAt);
  const modified = firstValue(source[COMMON_NAMESPACE_IRIS.dcterms.modified])
    || firstValue(source.modifiedAtIso)
    || firstValue(source.modifiedAt);

  return stripEmptyRecord({
    '@id': ontologyIri,
    '@type': [COMMON_NAMESPACE_IRIS.owl.Ontology],
    [COMMON_NAMESPACE_IRIS.owl.versionIRI]: versionIri ? [createNodeValue(versionIri)] : [],
    [COMMON_NAMESPACE_IRIS.owl.versionInfo]: versionInfo ? [createStringValue(versionInfo)] : [],
    [COMMON_NAMESPACE_IRIS.owl.imports]: toNodeValues(source[COMMON_NAMESPACE_IRIS.owl.imports]),
    [COMMON_NAMESPACE_IRIS.dcterms.created]: created ? [createTypedValue(created, COMMON_NAMESPACE_IRIS.xsd.dateTime)] : [],
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: modified ? [createTypedValue(modified, COMMON_NAMESPACE_IRIS.xsd.dateTime)] : [],
    [COMMON_NAMESPACE_IRIS.dcterms.title]: title ? [createLanguageValue(title, source.language || 'en')] : [],
    [COMMON_NAMESPACE_IRIS.dcterms.description]: description ? [createLanguageValue(description, source.language || 'en')] : [],
    [COMMON_NAMESPACE_IRIS.dcterms.format]: toStringValues(source[COMMON_NAMESPACE_IRIS.dcterms.format] || source.format || source.mimeType),
    [COMMON_NAMESPACE_IRIS.dcterms.license]: toNodeOrLiteralValues(source[COMMON_NAMESPACE_IRIS.dcterms.license] || source[COMMON_NAMESPACE_IRIS.dc.license]),
    [COMMON_NAMESPACE_IRIS.dcterms.source]: toNodeOrLiteralValues(source[COMMON_NAMESPACE_IRIS.dcterms.source] || source.source),
    [COMMON_NAMESPACE_IRIS.dcterms.creator]: toNodeOrLiteralValues(source[COMMON_NAMESPACE_IRIS.dcterms.creator] || source[COMMON_NAMESPACE_IRIS.dc.creator] || source.creator),
    [COMMON_NAMESPACE_IRIS.dcterms.contributor]: toNodeOrLiteralValues(source[COMMON_NAMESPACE_IRIS.dcterms.contributor] || source[COMMON_NAMESPACE_IRIS.dc.contributor] || source.contributors || source.contributor),
    [COMMON_NAMESPACE_IRIS.okea.hasGeneratingSoftwareApplicationName]: toStringValues(source[COMMON_NAMESPACE_IRIS.okea.hasGeneratingSoftwareApplicationName] || source.generatingSoftwareApplicationName),
    [COMMON_NAMESPACE_IRIS.okea.hasGenerationRunIdentifier]: toStringValues(source[COMMON_NAMESPACE_IRIS.okea.hasGenerationRunIdentifier] || source.generationRunIdentifier || source.runId),
    [COMMON_NAMESPACE_IRIS.okea.hasGitRepositoryUrl]: toAnyUriLiteralValues(source[COMMON_NAMESPACE_IRIS.okea.hasGitRepositoryUrl]),
    [COMMON_NAMESPACE_IRIS.okea.hasIssueTrackerUrl]: toAnyUriLiteralValues(source[COMMON_NAMESPACE_IRIS.okea.hasIssueTrackerUrl]),
    [COMMON_NAMESPACE_IRIS.okea.hasOntologyDownloadUrl]: toAnyUriLiteralValues(source[COMMON_NAMESPACE_IRIS.okea.hasOntologyDownloadUrl]),
    [COMMON_NAMESPACE_IRIS.okea.hasQualityAssuranceReportUrl]: toAnyUriLiteralValues(source[COMMON_NAMESPACE_IRIS.okea.hasQualityAssuranceReportUrl]),
    [COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri]: baseIri ? [createTypedValue(baseIri, COMMON_NAMESPACE_IRIS.xsd.anyURI)] : [],
    [COMMON_NAMESPACE_IRIS.okea.hasIriPolicyModeTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasIriPolicyModeTextValue]) || source.iriMode || 'opaque')],
    [COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameDelimiterTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameDelimiterTextValue]) || source.delimiter || '/')],
    [COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue]) || source.opaqueLeading || 'ont')],
    [COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue]: [createTypedValue(firstNumber(source[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue], source.opaqueDigits, 6), COMMON_NAMESPACE_IRIS.xsd.nonNegativeInteger)],
    [COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue]: [createTypedValue(firstNumber(source[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue], source.opaqueStart, 1), COMMON_NAMESPACE_IRIS.xsd.integer)],
    [COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameStyleTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameStyleTextValue]) || source.readableCase || 'PascalCase')],
    [COMMON_NAMESPACE_IRIS.okea.hasIriVersionTokenStrategyTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasIriVersionTokenStrategyTextValue]) || source.versionTokenStrategy || 'datetime')],
    [COMMON_NAMESPACE_IRIS.okea.hasIriVersionInsertionPositionTextValue]: [createStringValue(firstValue(source[COMMON_NAMESPACE_IRIS.okea.hasIriVersionInsertionPositionTextValue]) || source.versionInsertionPosition || 'infix')]
  });
}

/**
 * Create the current TOM settings view from a canonical metadata record.
 *
 * This is an app-adapter view. It exists so TOM can migrate durable storage now
 * while its DOM still expects the older field names.
 *
 * @param {object} metadataRecord Canonical ontology metadata record.
 * @returns {object|null} TOM-compatible settings view.
 */
export function createOntologySettingsViewFromMetadataRecord(metadataRecord) {
  if (!metadataRecord || typeof metadataRecord !== 'object') return null;
  const title = firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.title])
    || firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.rdfs.label])
    || '';
  const description = firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.description])
    || firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.rdfs.comment])
    || '';

  return {
    iri: metadataRecord['@id'] || '',
    [COMMON_NAMESPACE_IRIS.owl.versionIRI]: firstNodeValue(metadataRecord[COMMON_NAMESPACE_IRIS.owl.versionIRI]) || '',
    [COMMON_NAMESPACE_IRIS.owl.versionInfo]: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.owl.versionInfo]) || '',
    [COMMON_NAMESPACE_IRIS.owl.imports]: toPlainValues(metadataRecord[COMMON_NAMESPACE_IRIS.owl.imports]),
    [COMMON_NAMESPACE_IRIS.rdfs.label]: title,
    [COMMON_NAMESPACE_IRIS.dcterms.title]: title,
    [COMMON_NAMESPACE_IRIS.dcterms.creator]: toPlainValues(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.creator])[0] || '',
    [COMMON_NAMESPACE_IRIS.dcterms.contributor]: toPlainValues(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.contributor]),
    [COMMON_NAMESPACE_IRIS.dcterms.description]: description,
    [COMMON_NAMESPACE_IRIS.dcterms.created]: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.created]) || '',
    [COMMON_NAMESPACE_IRIS.dcterms.modified]: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.modified]) || '',
    [COMMON_NAMESPACE_IRIS.dcterms.format]: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.format]) || '',
    [COMMON_NAMESPACE_IRIS.dcterms.source]: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.dcterms.source]) || '',
    base: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri]) || '',
    delimiter: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameDelimiterTextValue]) || '/',
    iriMode: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasIriPolicyModeTextValue]) || 'opaque',
    opaqueLeading: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue]) || 'ont',
    opaqueDigits: Number(firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue]) || 6),
    opaqueStart: Number(firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue]) || 1),
    readableCase: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameStyleTextValue]) || 'PascalCase',
    versionTokenStrategy: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasIriVersionTokenStrategyTextValue]) || 'datetime',
    versionInsertionPosition: firstValue(metadataRecord[COMMON_NAMESPACE_IRIS.okea.hasIriVersionInsertionPositionTextValue]) || 'infix'
  };
}

/**
 * Normalize base IRI and delimiter options for local IRI construction.
 *
 * @param {object} [settings] Ontology settings.
 * @returns {{base: string, delimiter: string}}
 */
export function getOntologyIriBaseAndDelimiter(settings = {}) {
  const base = String(firstValue(settings[COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri]) || settings.base || '').replace(/[\/#]+$/, '') || 'http://example.org';
  const delimiter = firstValue(settings[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameDelimiterTextValue]) || settings.delimiter || '/';
  return { base, delimiter };
}

/**
 * Build a zero-padded opaque ontology/entity IRI.
 *
 * @param {number} nextNumber - Local numeric sequence value.
 * @param {object} settings - Ontology IRI policy settings.
 * @returns {string}
 */
export function buildOpaqueOntologyIri(nextNumber, settings = {}) {
  const { base, delimiter } = getOntologyIriBaseAndDelimiter(settings);
  const leading = firstValue(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue]) || settings.opaqueLeading || 'ont';
  const digits = Math.max(1, firstNumber(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue], settings.opaqueDigits, 6));
  return `${base}${delimiter}${leading}${zeroPadNumber(nextNumber, digits)}`;
}

/**
 * Build a readable ontology/entity IRI from a label and avoid collisions.
 *
 * @param {string} label - Source label.
 * @param {object} settings - Ontology IRI policy settings.
 * @param {Set<string>} [existingIris] Existing IRIs to avoid.
 * @returns {string}
 */
export function buildReadableOntologyIri(label, settings = {}, existingIris = new Set()) {
  const { base, delimiter } = getOntologyIriBaseAndDelimiter(settings);
  const style = firstValue(settings[COMMON_NAMESPACE_IRIS.okea.hasIriLocalNameStyleTextValue]) || settings.readableCase || 'PascalCase';
  const local = normalizeStringToCase(String(label || '').trim(), style, { fallbackStyle: 'PascalCase' }) || 'Unnamed';
  let candidate = `${base}${delimiter}${local}`;
  let suffix = 2;
  while (existingIris.has(candidate)) {
    candidate = `${base}${delimiter}${local}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Collect used opaque local IRI numbers from candidate IRIs.
 *
 * @param {Iterable<string|number>} iris - Existing IRI strings or already-collected local numbers.
 * @param {object} settings - Ontology IRI policy settings.
 * @returns {Set<number>}
 */
export function collectUsedOpaqueOntologyIriNumbers(iris, settings = {}) {
  const matcher = createOpaqueOntologyIriMatcher(settings);
  const used = new Set();
  for (const iri of iris || []) {
    const match = matcher.exec(String(iri || ''));
    if (!match) continue;
    const number = Number.parseInt(match[1], 10);
    if (Number.isFinite(number)) used.add(number);
  }
  return used;
}

/**
 * Find the next available opaque local IRI number.
 *
 * @param {Set<number>} usedNumbers - Used local numbers.
 * @param {object} settings - Ontology IRI policy settings.
 * @param {number} [startAt] Optional starting value.
 * @returns {number}
 */
export function findNextAvailableOpaqueOntologyIriNumber(usedNumbers, settings = {}, startAt = undefined) {
  const defaultStart = firstNumber(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue], settings.opaqueStart, 1);
  const start = startAt == null ? defaultStart : startAt;
  let next = Math.max(1, Number(start) || 1);
  while (usedNumbers.has(next)) next += 1;
  return next;
}

/**
 * Find the largest used opaque local IRI number.
 *
 * @param {Iterable<string>} iris - Existing IRI strings.
 * @param {object} settings - Ontology IRI policy settings.
 * @returns {number}
 */
export function findMaxOpaqueOntologyIriNumber(iris, settings = {}) {
  const used = new Set();
  for (const value of iris || []) {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) used.add(value);
    } else {
      for (const number of collectUsedOpaqueOntologyIriNumbers([value], settings)) used.add(number);
    }
  }
  const opaqueStart = firstNumber(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerStartValue], settings.opaqueStart, 1);
  let max = opaqueStart ? opaqueStart - 1 : 0;
  for (const number of used) if (number > max) max = number;
  return max;
}

function createOpaqueOntologyIriMatcher(settings = {}) {
  const { base, delimiter } = getOntologyIriBaseAndDelimiter(settings);
  const leading = firstValue(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNamePrefixTextValue]) || settings.opaqueLeading || 'ont';
  const digits = Math.max(1, firstNumber(settings[COMMON_NAMESPACE_IRIS.okea.hasOpaqueIriLocalNameIntegerWidthValue], settings.opaqueDigits, 6));
  const iriPrefix = `${base}${delimiter}${leading}`;
  return new RegExp(`^${escapeRegExp(iriPrefix)}(\\d{${digits}})$`);
}

function zeroPadNumber(number, width) {
  const text = String(Math.max(0, number | 0));
  return text.length >= width ? text : `${'0'.repeat(width - text.length)}${text}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripEmptyRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => {
    if (key === '@id') return !!value;
    if (Array.isArray(value)) return true;
    return value != null;
  }));
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstValue(value) {
  const first = asArray(value)[0];
  if (first && typeof first === 'object' && '@value' in first) return first['@value'];
  if (first && typeof first === 'object' && '@id' in first) return first['@id'];
  return first == null ? '' : String(first);
}

function firstNumber(value, fallback, defaultValue) {
  const text = firstValue(value);
  const candidate = text === '' ? fallback : text;
  const number = Number(candidate);
  return Number.isFinite(number) ? number : defaultValue;
}

function firstNodeValue(value) {
  const first = asArray(value)[0];
  if (first && typeof first === 'object' && '@id' in first) return first['@id'];
  if (typeof first === 'string') return first;
  return '';
}

function getFirstIri(value) {
  const first = firstNodeValue(value) || firstValue(value);
  return first ? String(first).trim() : '';
}

function createNodeValue(value) {
  return { '@id': String(value) };
}

function createStringValue(value) {
  return { '@value': String(value) };
}

function createLanguageValue(value, language) {
  return { '@value': String(value), '@language': String(language || 'en') };
}

function createTypedValue(value, datatypeIri) {
  return { '@value': value, '@type': datatypeIri };
}

function toNodeValues(value) {
  return asArray(value).map((item) => {
    if (item && typeof item === 'object' && '@id' in item) return createNodeValue(item['@id']);
    const text = firstValue(item);
    return text ? createNodeValue(text) : null;
  }).filter(Boolean);
}

function toNodeOrLiteralValues(value) {
  return asArray(value).map((item) => {
    if (item && typeof item === 'object' && '@id' in item) return createNodeValue(item['@id']);
    if (typeof item === 'string' && /^https?:\/\/orcid\.org\//i.test(item)) return createNodeValue(item);
    if (item && typeof item === 'object' && '@value' in item) return { ...item };
    const text = item == null ? '' : String(item).trim();
    return text ? createStringValue(text) : null;
  }).filter(Boolean);
}

function toAnyUriLiteralValues(value) {
  return asArray(value).map((item) => {
    const text = firstValue(item);
    return text ? createTypedValue(text, COMMON_NAMESPACE_IRIS.xsd.anyURI) : null;
  }).filter(Boolean);
}

function toStringValues(value) {
  return asArray(value).map((item) => {
    if (item && typeof item === 'object' && '@value' in item) return { ...item };
    const text = firstValue(item);
    return text ? createStringValue(text) : null;
  }).filter(Boolean);
}

function toPlainValues(value) {
  return asArray(value).map((item) => {
    if (item && typeof item === 'object' && '@id' in item) return item['@id'];
    if (item && typeof item === 'object' && '@value' in item) return item['@value'];
    return item;
  }).filter((item) => item != null && item !== '');
}
