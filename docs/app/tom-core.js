// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2025-2026 Jonathan Vajda
import {
  COMMON_NAMESPACE_IRIS,
  namespacePrefixMapFromRegistry
} from './shared/namespace-registry/namespace-registry.js';
import {
  mergeProjectPrefixes,
  normalizePrefixMap
} from './shared/namespace-registry/prefix-map.js';
import {
  compactIriToCurie,
  expandCurieToIri,
  findLongestPrefixMatch
} from './shared/namespace-registry/curie.js';
import {
  createN3WriterOptionsWithPrefixes,
  selectPrefixesUsedByRdfTerms
} from './shared/namespace-registry/rdf-serialization-prefixes.js';
import {
  createFormatExtensionMap,
  createFormatMimeTypeMap,
  getFilenameExtension,
  getInputKindForExtension,
  getPreferredExtensionForMimeType,
  getSupportedMimeTypeForFilename
} from './shared/format-registry/mime-registry.js';
import { guessRdfMimeTypeFromText } from './shared/format-registry/browser-file-actions.js';
import {
  downloadTextFile,
  readFileAsArrayBuffer,
  readFileAsText
} from './shared/browser-file-io/index.js';
import { serializeDelimitedRows } from './shared/tabular-io/index.js';
import {
  parseRdfTextWithN3,
  parseRdfTextWithAdapters,
  serializeRdfDatasetWithAdapters
} from './shared/rdf-io/index.js';
import { isBlankNodeTerm, normalizeIriToken } from './shared/ontology-utils/index.js';
import {
  getLocalDateParts,
  normalizeStringToCase,
  normalizeStringToPascalCase
} from './shared/normalization-utils/index.js';
import {
  deleteTomOntologySettings,
  hasTomSavedSession,
  readLatestTomSavedSession,
  readTomOntologySettings,
  storeTomAuthoringSession,
  writeTomOntologySettings
} from './tom-project-storage.js';
import * as CoreUtils from './tom-core-utils.js';
import AxiomBuilder from './tom-axiom-builder.js';
import * as FeatureUtils from './tom-feature-utils.js';

(function () {
const TOM = (window.TOM = window.TOM || {});

const VIEW_KEYS = {
  ONTOLOGY: 'ontology',
  RELATA: 'relata'
};

const VIEW_LABELS = {
  [VIEW_KEYS.ONTOLOGY]: 'Ontology',
  [VIEW_KEYS.RELATA]: 'Relata'
};

const DEFAULT_VIEW = VIEW_KEYS.ONTOLOGY;

const BASE_COLUMN_HEADERS = [
  'iri',
  'label',
  'element type',
  'definition',
  'is a',
  'is curated in ontology'
];

const RELATA_BASE_COLUMN_HEADERS = [
  'subject',
  'label',
  'element type',
  'definition',
  'is a',
  'is curated in ontology'
];

const DEFAULT_HIDDEN_COLUMNS_BY_VIEW = {
  [VIEW_KEYS.ONTOLOGY]: [],
  [VIEW_KEYS.RELATA]: [2, 3, 4, 5]
};

let predicateRegistry = [];
let activeViewKey = DEFAULT_VIEW;
const hiddenColumnsByView = {
  [VIEW_KEYS.ONTOLOGY]: new Set(DEFAULT_HIDDEN_COLUMNS_BY_VIEW[VIEW_KEYS.ONTOLOGY]),
  [VIEW_KEYS.RELATA]: new Set(DEFAULT_HIDDEN_COLUMNS_BY_VIEW[VIEW_KEYS.RELATA])
};
let gridInstance = null;
let gridInitDone = false;
let currentImportFile = null;
let lastPreviewableRdfFormat = 'ttl';
let axiomRecordsBySubject = new Map();
let mountedAxiomBuilder = null;

// Base spreadsheet columns (in order):
// 0: iri, 1: label, 2: element type, 3: definition, 4: is a, 5: is curated in ontology
const BASE_COLS = 6;

const container = document.getElementById('ontology-grid');
const output = document.getElementById('rdfOutput');

let SETTINGS_CACHE = null;

// Project/user prefixes extend the canonical shared registry.
const iriPrefixes = {
  ...mergeProjectPrefixes(
    namespacePrefixMapFromRegistry(),
    { ex: 'http://example.org/' }
  ).prefixes
};

const getElementTypes = () => {
  console.info('getElementTypes happened');
  return [
    'Class',
    'NamedIndividual',
    'ObjectProperty',
    'DatatypeProperty',
    'AnnotationProperty'
  ];
};

const getIsAPredicate = (elementType) => {
  console.info('getIsAPredicate happened');
  switch (elementType) {
    case 'Class':
      return COMMON_NAMESPACE_IRIS.rdfs.subClassOf ;
    case 'ObjectProperty':
    case 'DatatypeProperty':
    case 'AnnotationProperty':
      return COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf;
    case 'NamedIndividual':
      return COMMON_NAMESPACE_IRIS.rdf.type;
    default:
      return null;
  }
};

// These indicies are used to store vocabulary entries
const vocabIndex = [];         // flat array of entries (from all sources)
let vocabByIri = new Map();    // quick deref
let vocabByCurie = new Map();
let vocabByLabelLC = new Map(); 

/*
  These functions are used to manage ontology settings:
    generateOntologySettings creates a default ontology settings object and saves it.
    loadOntologySettings retrieves the ontology settings or generates default settings if none exist.
    openOntologySettingsModal opens a modal to edit the ontology settings.
    saveOntologySettingsFromModal saves the edited ontology settings back.
    openImportsModal opens a modal to manage ontology imports.
    handleImportFileUpload handles the upload of ontology import files and validates them.
    addImportIRI adds a new import IRI to the ontology settings.
    saveImportsAndClose saves the current imports and closes the modal.
    
*/

// Read from shared project storage (or create defaults) and cache.
async function settingsLoad() {
  SETTINGS_CACHE = await readTomOntologySettings();
  if (SETTINGS_CACHE) return SETTINGS_CACHE;
  SETTINGS_CACHE = generateOntologySettings();
  await writeTomOntologySettings(SETTINGS_CACHE);
  return SETTINGS_CACHE;
}

// Save to shared project storage and cache.
async function saveOntologySettings(next) {
  SETTINGS_CACHE = next;
  await writeTomOntologySettings(SETTINGS_CACHE);
  showToast('Ontology settings saved to project storage.', 'success');
}

// Synchronous accessor *after* settingsLoad() has run
function getOntologySettings() {
  if (!SETTINGS_CACHE) {
    console.warn('[getOntologySettings] Cache empty - did you await settingsLoad() during init?');
    // Last-resort fallback to keep UI from crashing:
    return generateOntologySettings();
  }
  return SETTINGS_CACHE;
}

function normalizePredicateMode(mode, iri) {
  if (FeatureUtils.normalizePredicateMode) {
    return FeatureUtils.normalizePredicateMode(mode, iri, defaultModeForPredicate);
  }
  return mode === 'iri' ? 'iri' : (mode === 'literal' ? 'literal' : defaultModeForPredicate(iri));
}

function normalizePredicateIri(iri) {
  return String(iri || '').trim();
}

function normalizePredicateRecord(record, fallback = {}) {
  if (FeatureUtils.normalizePredicateRecord) {
    return FeatureUtils.normalizePredicateRecord(record, fallback, {
      normalizePredicateMode,
    });
  }
  const iri = normalizePredicateIri(record?.iri ?? fallback?.iri);
  if (!iri) return null;

  return {
    iri,
    objectMode: normalizePredicateMode(
      record?.objectMode ?? fallback?.objectMode ?? getPredicateValueModes()[iri],
      iri
    ),
    showInOntology: record?.showInOntology ?? fallback?.showInOntology ?? true,
    showInRelata: record?.showInRelata ?? fallback?.showInRelata ?? true,
  };
}

function getPredicateRegistry() {
  return predicateRegistry;
}

function getPredicateRecord(iri) {
  const normalized = normalizePredicateIri(iri);
  return getPredicateRegistry().find((record) => record.iri === normalized) || null;
}

function getPredicateRecordByColumnIndex(colIndex) {
  if (colIndex < BASE_COLS) return null;
  return getPredicateRegistry()[colIndex - BASE_COLS] || null;
}

function getActiveViewKey() {
  return activeViewKey;
}

function getBaseHeadersForView(viewKey = getActiveViewKey()) {
  return viewKey === VIEW_KEYS.RELATA ? RELATA_BASE_COLUMN_HEADERS : BASE_COLUMN_HEADERS;
}

function getHiddenColumnsForView(viewKey = getActiveViewKey()) {
  return hiddenColumnsByView[viewKey] || new Set();
}

function setHiddenColumnsForView(viewKey, hiddenIndexes) {
  hiddenColumnsByView[viewKey] = new Set(Array.isArray(hiddenIndexes) ? hiddenIndexes : Array.from(hiddenIndexes || []));
  return hiddenColumnsByView[viewKey];
}

function isPredicateUsedInView(record, viewKey) {
  if (!record) return false;
  return viewKey === VIEW_KEYS.RELATA
    ? record.showInRelata !== false
    : record.showInOntology !== false;
}

function isColumnVisibleInView(viewKey, index) {
  if (index < BASE_COLS) {
    return !getHiddenColumnsForView(viewKey).has(index);
  }

  const record = getPredicateRecordByColumnIndex(index);
  if (!record) return !getHiddenColumnsForView(viewKey).has(index);

  return isPredicateUsedInView(record, viewKey) && !getHiddenColumnsForView(viewKey).has(index);
}

function getCustomPredicateIris() {
  return getPredicateRegistry().map((record) => record.iri);
}

function replacePredicateRegistry(nextEntries) {
  const previousByIri = new Map(getPredicateRegistry().map((record) => [record.iri, record]));
  const nextRegistry = (Array.isArray(nextEntries) ? nextEntries : [])
    .map((entry) => {
      if (typeof entry === 'string') {
        return normalizePredicateRecord({ iri: entry }, previousByIri.get(normalizePredicateIri(entry)));
      }

      const iri = normalizePredicateIri(entry?.iri);
      return normalizePredicateRecord(entry, previousByIri.get(iri));
    })
    .filter(Boolean);

  predicateRegistry.splice(0, predicateRegistry.length, ...nextRegistry);
  predicateRegistry.forEach((record) => {
    const modes = getPredicateValueModes();
    modes[record.iri] = record.objectMode;
  });
  return getPredicateRegistry();
}

function upsertPredicateRecord(iri, overrides = {}) {
  const normalizedIri = normalizePredicateIri(iri);
  if (!normalizedIri) return null;

  const existingIndex = getPredicateRegistry().findIndex((record) => record.iri === normalizedIri);
  const existing = existingIndex >= 0 ? getPredicateRegistry()[existingIndex] : null;
  const nextRecord = normalizePredicateRecord({
    iri: normalizedIri,
    objectMode: overrides.objectMode ?? existing?.objectMode,
    showInOntology: overrides.showInOntology ?? existing?.showInOntology,
    showInRelata: overrides.showInRelata ?? existing?.showInRelata,
  }, existing || {});

  if (!nextRecord) return null;

  if (existingIndex >= 0) {
    getPredicateRegistry()[existingIndex] = nextRecord;
  } else {
    getPredicateRegistry().push(nextRecord);
  }

  const modes = getPredicateValueModes();
  modes[nextRecord.iri] = nextRecord.objectMode;
  return nextRecord;
}

// === Predicate Value Modes =====================================
// Store per-predicate value mode: 'iri' | 'literal' (default inferred)
function getPredicateValueModes() {
  const s = getOntologySettings();
  s.predicateValueModes = s.predicateValueModes || {};
  return s.predicateValueModes;
}
function getPredicateValueMode(iri) {
  const record = getPredicateRecord(iri);
  if (record?.objectMode) return record.objectMode;
  const m = getPredicateValueModes();
  return m[iri] || null; // null => not set
}
function setPredicateValueMode(iri, mode) {
  const normalizedIri = normalizePredicateIri(iri);
  const normalizedMode = normalizePredicateMode(mode, normalizedIri);
  const s = getOntologySettings();
  s.predicateValueModes = s.predicateValueModes || {};
  s.predicateValueModes[normalizedIri] = normalizedMode;
  const record = getPredicateRecord(normalizedIri);
  if (record) {
    record.objectMode = normalizedMode;
  }
}
async function savePredicateValueModes() {
  await saveOntologySettings(getOntologySettings());
}

function defaultModeForPredicate(iri) {
  const rec = getKnownVocabRecordForIriish(iri);
  if (FeatureUtils.defaultPredicateObjectMode) {
    return FeatureUtils.defaultPredicateObjectMode(rec?.type, iri);
  }
  const type = String(rec?.type || '').trim();

  if (type === 'ObjectProperty') return 'iri';
  if (type === 'DatatypeProperty' || type === 'AnnotationProperty') return 'literal';
  if (/ObjectProperty$/i.test(type)) return 'iri';
  if (/DatatypeProperty$/i.test(type) || /AnnotationProperty$/i.test(type)) return 'literal';

  // fallback heuristic when TOM does not know the predicate type yet
  if (/#.+Property$/.test(iri) || /sameAs$/i.test(iri)) return 'iri';
  return 'literal';
}


function getSelectedDelimiter() {
  const selected = document.querySelector('input[name="base-iri-delimiter"]:checked');
  return selected ? selected.value : "/";
}

function updateOntologyPreview() {
  try {
    const settings = getEffectiveOntologySettings();
    const base = (settings.base || '').trim() || 'http://example.org';
    const label = (document.getElementById("ontology-label-input").value || '').trim() || 'Example Ontology';
    const delimiter = settings.delimiter || getSelectedDelimiter();
    const { year, month, day } = getLocalDateParts();
    const normalizedLabel = normalizeStringToPascalCase(label);
    const entityPreview = settings.iriMode === 'readable'
      ? buildReadableIri('Example Entity', settings, new Set())
      : buildOpaqueIri(settings.opaqueStart || 1, settings);

    document.getElementById("version-iri-preview").textContent =
      `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`;
    document.getElementById("version-info-preview").textContent = `${year}-${month}-${day}`;
    document.getElementById("entity-iri-preview").textContent = entityPreview;
  } catch (e) {
    console.error("[Preview] Failed to update preview", e);
  }
}

function generateOntologySettings(
  base = "http://example.org",
  label = "Example Ontology",
  creator = "Barry Guarino",
  description = "An example ontology",
  delimiter = "/",
  iriMode = "opaque",                 // "opaque" | "readable"
  opaqueLeading = "ont",
  opaqueDigits = 6,
  opaqueStart = 1,
  readableCase = "PascalCase"         // "PascalCase" | "camelCase" | "snake_case"
) {
  if (CoreUtils.generateOntologySettings) {
    return CoreUtils.generateOntologySettings({
      base,
      label,
      creator,
      description,
      delimiter,
      iriMode,
      opaqueLeading,
      opaqueDigits,
      opaqueStart,
      readableCase,
      dateParts: getLocalDateParts()
    });
  }

  const { year, month, day } = getLocalDateParts();
  const normalizedLabel = normalizeStringToPascalCase(label);

  return {
    iri: `${base}${delimiter}${normalizedLabel}`,
    [COMMON_NAMESPACE_IRIS.owl.versionIRI]: `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`,
    [COMMON_NAMESPACE_IRIS.owl.versionInfo]: `${year}-${month}-${day}`,
    [COMMON_NAMESPACE_IRIS.rdfs.label]: label,
    [COMMON_NAMESPACE_IRIS.dcterms.creator]: creator,
    [COMMON_NAMESPACE_IRIS.dcterms.description]: description,
    iriMode,
    opaqueLeading,
    opaqueDigits,
    opaqueStart,
    readableCase,
    delimiter,
    base
  };
}

function getEffectiveOntologySettings() {
  const stored = getOntologySettings() || {};
  const modal = document.getElementById("ontology-settings-modal");

  // If modal is open, prefer the values the user currently sees
  if (modal && modal.style.display !== "none") {
    const base = (document.getElementById("ontology-base-iri-input")?.value || '').trim() || stored.base || 'http://example.org';
    const delimiter = getSelectedDelimiter() || stored.delimiter || '/';
    const iriMode = document.querySelector('input[name="iri-mode"]:checked')?.value || stored.iriMode || 'opaque';

    const opaqueLeadingInput = (document.getElementById("opaque-leading")?.value || '').trim();
    const opaqueDigitsInput  = parseInt(document.getElementById("opaque-digits")?.value, 10);
    const opaqueStartInput   = parseInt(document.getElementById("opaque-start")?.value, 10);
    const readableCase       = document.getElementById("readable-case")?.value || stored.readableCase || 'PascalCase';

    return {
      ...stored,
      base,
      delimiter,
      iriMode,
      opaqueLeading: opaqueLeadingInput || stored.opaqueLeading || 'ont',
      opaqueDigits: Number.isFinite(opaqueDigitsInput) ? opaqueDigitsInput : (stored.opaqueDigits || 6),
      opaqueStart:  Number.isFinite(opaqueStartInput)  ? opaqueStartInput  : (stored.opaqueStart  || 1),
      readableCase
    };
  }

  // Otherwise, fall back to saved settings
  return stored;
}

function getSelectedIriMode() {
  return document.querySelector('input[name="iri-mode"]:checked')?.value || 'opaque';
}

function toggleIriModeOptions() {
  const mode = getSelectedIriMode();
  const opaque = document.getElementById('opaque-opts');
  const readable = document.getElementById('readable-opts');
  if (opaque && readable) {
    opaque.style.display   = (mode === 'opaque')   ? 'block' : 'none';
    readable.style.display = (mode === 'readable') ? 'block' : 'none';
  }
}

function initializeIriModeToggles() {
  const radios = document.querySelectorAll('input[name="iri-mode"]');
  radios.forEach(r => r.addEventListener('change', toggleIriModeOptions));
  // set correct section visibility on first open/first load
  toggleIriModeOptions();
}

function openOntologySettingsModal() {
  const modal = document.getElementById("ontology-settings-modal");
  const s = getOntologySettings();

  // existing fields
  document.getElementById("ontology-base-iri-input").value = (s.base || s.iri.split("/").slice(0, -1).join("/"));
  document.getElementById("ontology-label-input").value = s[COMMON_NAMESPACE_IRIS.rdfs.label] || "";
  document.getElementById("ontology-creator-input").value = s[COMMON_NAMESPACE_IRIS.dcterms.creator] || "";
  document.getElementById("ontology-description-input").value = s[COMMON_NAMESPACE_IRIS.dcterms.description] || "";

  // delimiter
  const delim = s.delimiter || getSelectedDelimiter();
  document.querySelectorAll('input[name="base-iri-delimiter"]').forEach(r => {
    r.checked = (r.value === delim);
  });

  // NEW: IRI mode + options
  const iriMode = s.iriMode || "opaque";
  document.querySelectorAll('input[name="iri-mode"]').forEach(r => {
    r.checked = (r.value === iriMode);
  });
  document.getElementById("opaque-leading").value = s.opaqueLeading || "ont";
  document.getElementById("opaque-digits").value = s.opaqueDigits ?? 6;
  document.getElementById("opaque-start").value = s.opaqueStart ?? 1;
  document.getElementById("readable-case").value = s.readableCase || "PascalCase";

  // toggle sections
  document.getElementById('opaque-opts').style.display   = (iriMode === 'opaque')   ? 'block' : 'none';
  document.getElementById('readable-opts').style.display = (iriMode === 'readable') ? 'block' : 'none';

  modal.style.display = "block";
  toggleIriModeOptions();
  updateOntologyPreview();
}

async function saveOntologySettingsFromModal() {
  const base = document.getElementById("ontology-base-iri-input").value.trim();
  const label = document.getElementById("ontology-label-input").value.trim();
  const creator = document.getElementById("ontology-creator-input").value.trim();
  const description = document.getElementById("ontology-description-input").value.trim();
  const delimiter = document.querySelector('input[name="base-iri-delimiter"]:checked').value;
  const iriMode = document.querySelector('input[name="iri-mode"]:checked').value;
  const opaqueLeading = document.getElementById('opaque-leading').value;
  const opaqueDigits  = +document.getElementById('opaque-digits').value;
  const opaqueStart   = +document.getElementById('opaque-start').value;
  const readableCase  = document.getElementById('readable-case').value;

  const next = generateOntologySettings(
    base, label, creator, description, delimiter,
    iriMode, opaqueLeading, opaqueDigits, opaqueStart, readableCase
  );

  await saveOntologySettings(next);
  document.getElementById('ontology-settings-modal').style.display = 'none';
}

function zeroPad(n, width) {
  const s = String(Math.max(0, n|0));
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function fromLabelWithCase(label, caseStyle) {
  const raw = String(label || '').trim();
  return normalizeStringToCase(raw, caseStyle, { fallbackStyle: 'PascalCase' });
}

// Returns { base, delimiter } where base excludes trailing delimiter
function getBaseAndDelimiter(settings) {
  const base = (settings.base || '').replace(/[\/#]+$/,'') || 'http://example.org';
  const delimiter = settings.delimiter || '/';
  return { base, delimiter };
}


// Scan current grid for largest opaque number already used
function findMaxOpaqueNumber(grid, settings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const lead = settings.opaqueLeading || 'ont';
  const digits = Math.max(1, settings.opaqueDigits || 6);

  const iriPrefix = `${base}${delimiter}${lead}`;
  const re = new RegExp('^' + iriPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{' + digits + '})$');

  let max = (settings.opaqueStart ? settings.opaqueStart - 1 : 0);
  const rows = grid.getData();
  for (const row of rows) {
    const iri = row?.[0] || '';
    const m = re.exec(String(iri));
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return max;
}

function collectUsedOpaqueNumbers(grid, settings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const lead = settings.opaqueLeading || 'ont';
  const digits = Math.max(1, settings.opaqueDigits || 6);
  const iriPrefix = `${base}${delimiter}${lead}`;
  const re = new RegExp('^' + iriPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{' + digits + '})$');
  const used = new Set();
  const rows = grid.getData();

  for (const row of rows) {
    const iri = row?.[0] || '';
    const m = re.exec(String(iri));
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (Number.isFinite(num)) used.add(num);
  }

  return used;
}

function findNextAvailableOpaqueNumber(usedNumbers, settings, startAt) {
  let next = Math.max(1, Number(startAt) || 1);
  while (usedNumbers.has(next)) {
    next += 1;
  }
  return next;
}

function buildOpaqueIri(nextNum, settings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const lead   = settings.opaqueLeading || 'ont';
  const digits = Math.max(1, settings.opaqueDigits || 6);
  return `${base}${delimiter}${lead}${zeroPad(nextNum, digits)}`;
}

function buildReadableIri(label, settings, existingIris = new Set()) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const style = settings.readableCase || 'PascalCase';

  let local = fromLabelWithCase(label, style) || 'Unnamed';
  let candidate = `${base}${delimiter}${local}`;

  // Ensure uniqueness within current table
  let i = 2;
  while (existingIris.has(candidate)) {
    candidate = `${base}${delimiter}${local}_${i++}`;
  }
  return candidate;
}



// Gets the column definitions for the active Glide-backed grid.
const getColumnDefinitions = (viewKey = getActiveViewKey()) => {
  const baseColumns = [
    { type: 'text', hidden: !isColumnVisibleInView(viewKey, 0) ? true : undefined }, // IRI / Subject
    { type: 'text', hidden: !isColumnVisibleInView(viewKey, 1) ? true : undefined }, // Label
    {
      type: 'text',
      editor: 'autocomplete',
      source: getElementTypes(),
      strict: true,
      allowInvalid: false,
      hidden: !isColumnVisibleInView(viewKey, 2) ? true : undefined
    },                // Element Type
    { type: 'text', hidden: !isColumnVisibleInView(viewKey, 3) ? true : undefined }, // Definition
    {
      // "Is A" with smart lookup
      editor: 'autocomplete',
      strict: false,
      filter: false,
      allowInvalid: true,
      hidden: !isColumnVisibleInView(viewKey, 4) ? true : undefined,
      source: function (query, callback) {
        try {
          // infer type constraints from the row's Element Type
          const row = this.row;
          const elType = gridInstance.getDataAtCell(row, 2); // "element type"
          let typeHint = null;
          if (elType === 'Class' || elType === 'NamedIndividual') typeHint = 'Class';
          else if (elType === 'ObjectProperty') typeHint = 'ObjectProperty';
          else if (elType === 'DatatypeProperty') typeHint = 'DatatypeProperty';

          const results = searchVocab(query, { typeHint, max: 50 });
          callback(results.map(displayLabelAndCurie));
        } catch (e) {
          console.error('[IsA] source failed', e);
          callback([]);
        }
      },
      // Display formatting now happens in the Glide adapter via getDisplayValue.
    },
    { type: 'text', hidden: !isColumnVisibleInView(viewKey, 5) ? true : undefined }, // is curated in ontology
  ];

  const predicateColumns = getPredicateRegistry().map((record, idx) => ({
    type: 'text',
    displayHeader: formatPredicateHeaderTitle(record.iri),
    hidden: !isColumnVisibleInView(viewKey, BASE_COLS + idx) ? true : undefined
  }));

  return baseColumns.concat(predicateColumns);
};


const getInitialData = () => {
  console.info('getInitialData happened');
  return [
    ["http://example.org/ont000001", "Doctor", "Class", "A human person who has earned a doctorate.", "cco2:ont00001017", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000002", "Bob", "NamedIndividual", "An instance of a Person.", "cco2:ont00001262", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000003", "has vehicle", "ObjectProperty", "x hasVehicle y iff x possesses y and y is a Vehicle.", "ex:Owns", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000004", "Automobile", "Class", "A ground vehicle that is designed to transport passengers.", "cco2:ont00000618", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000005", "Student", "Class", "", "", "http://example.org/ExampleOntology"]
];
};

// Gets the column headers for the active Glide-backed grid.
const getColumnHeaders = (viewKey = getActiveViewKey()) => {
  console.info('getColumnHeaders happened');
  return getBaseHeadersForView(viewKey).concat(getCustomPredicateIris());
};

// Creates the active Glide-backed grid in the given container with the provided data and column definitions.
const createTable = (container, data, colHeaders, columns) => {
  console.info('createTable happened');
  return TOM.Grid.createGrid(container, {
    
    data,
    colHeaders,
    columns,
    editOnType: true,

    // inject validator for first column across all rows
    cells: (row, col) => {
      const cellProps = {};

      // your existing per-column logic

      // For custom predicate columns, enforce IRI vs literal
      if (col >= BASE_COLS) {
        const predIri = getPredicateRecordByColumnIndex(col)?.iri;
        const mode = getPredicateValueMode(predIri) || defaultModeForPredicate(predIri);

        if (mode === 'iri') {
          // basic validator: must resolve to IRI (absolute or CURIE)
          cellProps.validator = (value, cb) => {
            if (value == null || String(value).trim() === '') return cb(true); // allow empty
            return cb(Boolean(resolveNamedNodeIri(value)));
          };
          // Optionally a nice tooltip:
          cellProps.allowInvalid = false;
        } else {
          // 'literal' - no special validator (or add your own literal constraints)
        }
      }

      return cellProps;
    },
    getDisplayValue({ colIndex, value }) {
      if (colIndex === 4) {
        const rec = vocabByIri.get(String(value || '').trim());
        if (rec) return displayLabelAndCurie(rec);
      }
      return value;
    },
    validateCell({ colIndex, value }) {
      if (colIndex === 0) {
        return Boolean(resolveToIri(value));
      }

      if (colIndex === 2) {
        if (value == null || String(value).trim() === '') return true;
        return getElementTypes().includes(String(value).trim());
      }

      if (colIndex >= BASE_COLS) {
        const predIri = getPredicateRecordByColumnIndex(colIndex)?.iri;
        const mode = getPredicateValueMode(predIri) || defaultModeForPredicate(predIri);

        if (mode === 'iri') {
          if (value == null || String(value).trim() === '') return true;
          return Boolean(resolveNamedNodeIri(value));
        }
      }

      return true;
    },
    getContextMenuItems(context) {
      return buildGridContextMenuItems(context);
    },
    
  });
};

/**
 * Sets cco2:ont00001760 ('is curated in ontology') value for rows with empty cells in that column,
 * using the ontology's IRI from ontology settings.
 */
function setIsCuratedInForAllRows() {
  const settings = getOntologySettings();
  const ontologyIRI = settings["iri"];

  if (!ontologyIRI) {
    console.warn("[setIsCuratedInForAllRows] Ontology IRI not found in settings");
    return;
  }

  const headers = gridInstance.getColHeader();
  const columnIndex = headers.indexOf("is curated in ontology");

  if (columnIndex === -1) {
    console.warn("[setIsCuratedInForAllRows] 'cco2:ont00001760' column not found in table");
    return;
  }

  const totalRows = gridInstance.countRows();
  let updatedCount = 0;

  for (let row = 0; row < totalRows; row++) {
    const currentValue = gridInstance.getDataAtCell(row, columnIndex);
    if (currentValue === null || currentValue === "") {
      gridInstance.setDataAtCell(row, columnIndex, ontologyIRI);
      updatedCount++;
    }
  }

  console.info(`[setIsCuratedInForAllRows] Set for ${updatedCount} of ${totalRows} rows (only empty cells updated)`);
}

function syncCurrentViewHiddenColumns() {
  if (!gridInstance?.getHiddenColumns) return;
  setHiddenColumnsForView(getActiveViewKey(), gridInstance.getHiddenColumns());
}

function updateViewToggleButtons() {
  document.querySelectorAll('[data-view-switch]').forEach((button) => {
    const isActive = button.dataset.viewSwitch === getActiveViewKey();
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
    button.style.fontWeight = isActive ? '700' : '400';
    button.style.outline = isActive ? '2px solid var(--ont-accent, #2563eb)' : '';
  });
}

function applyViewSchema(viewKey, options = {}) {
  if (!gridInstance) return;

  const targetView = viewKey || DEFAULT_VIEW;
  const previousView = getActiveViewKey();
  if (options.captureCurrent !== false && gridInstance && previousView) {
    syncCurrentViewHiddenColumns();
  }

  activeViewKey = targetView;
  gridInstance.setSchema(getColumnHeaders(targetView), getColumnDefinitions(targetView));

  const hidden = Array.from(getHiddenColumnsForView(targetView));
  gridInstance.setHiddenColumns(hidden);
  updateViewToggleButtons();
}

function switchView(nextViewKey) {
  if (!gridInstance) return;
  if (!Object.values(VIEW_KEYS).includes(nextViewKey)) return;
  if (nextViewKey === getActiveViewKey()) return;
  applyViewSchema(nextViewKey);
  showToast(`Switched to ${VIEW_LABELS[nextViewKey]} view`, 'info');
}

/**
 * Initializes the active Glide-backed grid once.
 */
function initializeOntologyGrid() {
  if (gridInitDone) return;
  if (gridInstance) { try { gridInstance.destroy(); } catch (_) {} }

  // 1) Build rows/schema
  const rows     = getInitialData();
  const headers  = getColumnHeaders();
  const columns  = getColumnDefinitions();
  const settings = getOntologySettings(); // IndexedDB-backed cache

  // 2) Create the grid using the active adapter.
  gridInstance = createTable(container, rows, headers, columns);
  attachGridHooks?.();
  applyViewSchema(getActiveViewKey(), { captureCurrent: false });

  // 3) Finish init
  harvestRowsIntoVocab?.(rows);
  gridInitDone = true;
  updateViewToggleButtons();
}


// This function checks if the element type is a predicate
window.getIsAPredicateForRow = (rowIndex) => {
  const row = gridInstance.getSourceDataAtRow(rowIndex);
  const elementType = row ? row[2] : null;
  return getIsAPredicate(elementType);
};

// This set of functions are used for outputting RDF.
// getOntologyIRI retrieves the ontology IRI or returns a default value.
// generateRdfString takes the grid rows and converts them into an RDF string in the specified format.
// handleExport generates the file

function getOntologyIRI() {
  const settings = getOntologySettings();
  return settings.iri || "http://example.org/ExampleOntology";
}

function quadSignature(quad) {
  const s = `${quad.subject.termType}:${quad.subject.value}`;
  const p = `${quad.predicate.termType}:${quad.predicate.value}`;
  const o = `${quad.object.termType}:${quad.object.value}`;
  return `${s}|${p}|${o}`;
}

function pushUniqueQuad(quads, seen, quad) {
  const key = quadSignature(quad);
  if (seen.has(key)) return;
  seen.add(key);
  quads.push(quad);
}

function parseRawAxiomRdf(rawRdf) {
  const text = String(rawRdf || '').trim();
  if (!text) return [];
  return parseRdfTextWithN3(text, {
    format: 'text/turtle',
    runtime: { N3 }
  }).quads;
}

function appendAxiomRecordQuads(quads, seen, record) {
  const normalized = normalizeAxiomRecord(record);
  if (!normalized.subjectIri) return;
  const factory = N3.DataFactory;

  normalized.axioms.forEach((axiom) => {
    try {
      const parsedAxiom = {
        ...axiom,
        expressionAst:
          axiom.expressionAst ||
          AxiomBuilder.parseExpression?.(axiom.expressionText, (value) => resolveToIri(value)),
      };
      (AxiomBuilder.axiomToQuads?.(parsedAxiom, normalized.subjectIri, factory) || [])
        .forEach((quad) => pushUniqueQuad(quads, seen, quad));
    } catch (error) {
      console.warn('[axioms] Could not export structured axiom', axiom, error);
    }
  });

  normalized.preservedTriples.forEach((triple) => {
    if (!triple.subject || !triple.predicate || !triple.object) return;
    pushUniqueQuad(quads, seen, factory.quad(
      termFromSnapshot(triple.subject),
      termFromSnapshot(triple.predicate),
      termFromSnapshot(triple.object)
    ));
  });

  parseRawAxiomRdf(normalized.rawRdf).forEach((quad) => pushUniqueQuad(quads, seen, quad));
}

function termFromSnapshot(term) {
  if (term.termType === 'NamedNode') return N3.DataFactory.namedNode(term.value);
  if (isBlankNodeTerm(term)) return N3.DataFactory.blankNode(term.value);
  if (term.termType === 'Literal') {
    if (term.language) return N3.DataFactory.literal(term.value, term.language);
    if (term.datatype?.value) return N3.DataFactory.literal(term.value, N3.DataFactory.namedNode(term.datatype.value));
    return N3.DataFactory.literal(term.value);
  }
  return N3.DataFactory.namedNode(String(term.value || ''));
}

function buildOntologyExportQuads(rows) {
  const quads = [];
  const seen = new Set();
  const settings = getOntologySettings();
  const ontologyIRI = settings["iri"];
  const namedNode = N3.DataFactory.namedNode;
  const literal = N3.DataFactory.literal;

  pushUniqueQuad(quads, seen,
    N3.DataFactory.quad(
      namedNode(ontologyIRI),
      namedNode(COMMON_NAMESPACE_IRIS.rdf.type),
      namedNode(COMMON_NAMESPACE_IRIS.owl.Ontology)
    )
  );

  const resolvePredicate = (k) => {
    return resolveNamedNodeIri(k);
  };

  for (const [key, value] of Object.entries(settings)) {
    if (key === 'iri' || key === 'owlImportsLocal') continue;
    if (key === COMMON_NAMESPACE_IRIS.owl.imports && Array.isArray(value)) {
      for (const importIRI of value) {
        pushUniqueQuad(quads, seen, N3.DataFactory.quad(
          namedNode(ontologyIRI),
          namedNode(COMMON_NAMESPACE_IRIS.owl.imports),
          namedNode(importIRI)
        ));
      }
      continue;
    }

    const pred = resolvePredicate(key);
    const isScalar = ['string', 'number', 'boolean'].includes(typeof value);
    if (pred && isScalar) {
      pushUniqueQuad(quads, seen, N3.DataFactory.quad(
        namedNode(ontologyIRI),
        namedNode(pred),
        literal(String(value))
      ));
    }
  }

  rows.forEach((row) => {
    const [subject, label, type, definition, isAObject, isCuratedInOntology] = row;
    if (!subject) return;

    const structuralTypeMap = {
      Class: COMMON_NAMESPACE_IRIS.owl.Class,
      NamedIndividual: COMMON_NAMESPACE_IRIS.owl.NamedIndividual,
      ObjectProperty: COMMON_NAMESPACE_IRIS.owl.ObjectProperty,
      DatatypeProperty: COMMON_NAMESPACE_IRIS.owl.DatatypeProperty,
      AnnotationProperty: COMMON_NAMESPACE_IRIS.owl.AnnotationProperty,
    };
    const structuralTypeIri = structuralTypeMap[type];
    if (structuralTypeIri) {
      pushUniqueQuad(quads, seen, N3.DataFactory.quad(
        namedNode(subject),
        namedNode(COMMON_NAMESPACE_IRIS.rdf.type),
        namedNode(structuralTypeIri)
      ));
    }

    if (label) {
      pushUniqueQuad(quads, seen, N3.DataFactory.quad(
        namedNode(subject),
        namedNode(COMMON_NAMESPACE_IRIS.rdfs.label),
        literal(label)
      ));
    }

    if (definition) {
      pushUniqueQuad(quads, seen, N3.DataFactory.quad(
        namedNode(subject),
        namedNode(COMMON_NAMESPACE_IRIS.skos.definition),
        literal(definition)
      ));
    }

    const isAPredicate = getIsAPredicate(type);
    if (isAPredicate && isAObject) {
      const objIri = resolveToIri(isAObject);
      if (objIri) {
        pushUniqueQuad(quads, seen, N3.DataFactory.quad(
          namedNode(subject),
          namedNode(isAPredicate),
          namedNode(objIri)
        ));
      } else {
        console.warn(`[export] Could not resolve IsA value "${isAObject}" to an IRI for subject ${subject}`);
      }
    }

    if (isCuratedInOntology) {
      pushUniqueQuad(quads, seen, N3.DataFactory.quad(
        namedNode(subject),
        namedNode(COMMON_NAMESPACE_IRIS.cco2.curatedIn),
        asObjectTerm(isCuratedInOntology)
      ));
    }

    getPredicateRegistry().forEach((predicateRecord, idx) => {
      const predicate = predicateRecord.iri;
      const colIndex = BASE_COLS + idx;
      const cellValue = row[colIndex];
      if (!cellValue) return;

      const mode = predicateRecord.objectMode || getPredicateValueMode(predicate);
      const valueText = String(cellValue).trim();

      if (mode === 'iri') {
        const namedNodeIri = resolveNamedNodeIri(valueText);
        const obj = namedNodeIri ? namedNode(namedNodeIri) : null;

        pushUniqueQuad(quads, seen, N3.DataFactory.quad(
          namedNode(subject),
          namedNode(predicate),
          obj || literal(valueText)
        ));
      } else {
        pushUniqueQuad(quads, seen, N3.DataFactory.quad(
          namedNode(subject),
          namedNode(predicate),
          literal(String(cellValue))
        ));
      }
    });
  });

  getPersistableAxiomRecords().forEach((record) => appendAxiomRecordQuads(quads, seen, record));

  return quads;
}

async function serializeQuads(quads, format = 'ttl') {
  const mimeType = mimeTypes[format] || format;
  const usedPrefixes = selectPrefixesUsedByRdfTerms(iriPrefixes, quads);
  const prefixOptions = createN3WriterOptionsWithPrefixes({ prefixes: usedPrefixes.value });
  const prefixWarnings = [
    ...(usedPrefixes.warnings || []),
    ...(prefixOptions.warnings || [])
  ];
  if (prefixWarnings.length) {
    console.warn('[export] Ignored invalid prefixes:', prefixWarnings);
  }
  const serialized = await serializeRdfDatasetWithAdapters(quads, {
    format: mimeType,
    prefixes: prefixOptions.value.prefixes,
    runtime: { N3, jsonld: window.jsonld, $rdf: window.$rdf }
  });
  return serialized.text;
}

function buildJsonLdContext(quads = []) {
  const usedPrefixes = selectPrefixesUsedByRdfTerms(iriPrefixes, quads);
  const context = {};
  Object.entries(usedPrefixes.value).forEach(([prefix, iri]) => {
    context[prefix] = iri;
  });
  return context;
}

async function generateRdfString(rows, format = 'ttl') {
  console.info('generateRdfString happened');
  const quads = buildOntologyExportQuads(rows);
  if (format === 'jsonld') {
    const serialized = await serializeRdfDatasetWithAdapters(quads, {
      format: mimeTypes.jsonld,
      context: buildJsonLdContext(quads),
      runtime: { N3, jsonld: window.jsonld, $rdf: window.$rdf }
    });
    return serialized.text;
  }
  return serializeQuads(quads, format);
}

function buildCsvExportRows(rows) {
  const headers = getColumnHeaders();
  if (CoreUtils.buildCsvExportRows) {
    return CoreUtils.buildCsvExportRows({
      headers,
      rows,
      resolveCellValue: (_, index, raw) => {
        if (index === 4) return resolveToIri(raw) || String(raw || '');
        return String(raw ?? '');
      }
    });
  }

  const csvRows = [headers];
  rows.forEach((row) => {
    const next = headers.map((_, index) => {
      const raw = row[index] ?? '';
      if (index === 4) {
        return resolveToIri(raw) || String(raw || '');
      }
      return String(raw ?? '');
    });
    csvRows.push(next);
  });
  return csvRows;
}

function generateCsvString(rows) {
  return serializeDelimitedRows(buildCsvExportRows(rows), {
    delimiter: ',',
    newline: '\r\n',
    trailingNewline: false
  });
}

function getPreviewFormat(selectedFormat) {
  if (selectedFormat === 'csv') return lastPreviewableRdfFormat || 'ttl';
  lastPreviewableRdfFormat = selectedFormat;
  return selectedFormat;
}

function getSaveableRdfFormat(selectedFormat) {
  return selectedFormat === 'csv' ? (lastPreviewableRdfFormat || 'ttl') : selectedFormat;
}

const exportFormatKeys = ['ttl', 'rdf', 'jsonld', 'nt', 'trig', 'csv', 'nquads'];
const mimeTypes = createFormatMimeTypeMap(exportFormatKeys);
const extensions = createFormatExtensionMap(exportFormatKeys);

function cloneRowsForWorkspace(rows, expectedColumnCount = null) {
  if (FeatureUtils.cloneRowsForWorkspace) {
    return FeatureUtils.cloneRowsForWorkspace(rows, expectedColumnCount);
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const nextRow = Array.isArray(row) ? row.slice() : [];
    if (expectedColumnCount == null) return nextRow;
    if (nextRow.length < expectedColumnCount) {
      nextRow.push(...Array.from({ length: expectedColumnCount - nextRow.length }, () => ''));
    }
    return nextRow.slice(0, expectedColumnCount);
  });
}

function readCurrentTableRows() {
  const headers = getColumnHeaders();
  const fields = typeof gridInstance?.getFields === 'function'
    ? gridInstance.getFields()
    : ['iri', 'label', 'elementType', 'definition', 'isA', 'isCuratedInOntology'];
  const expectedColumnCount = headers.length;
  const directRows = CoreUtils.normalizeTomTableRows(gridInstance?.getData?.() || [], {
    headers,
    fields,
    expectedColumnCount,
  });
  if (directRows.some((row) => row.some((cell) => String(cell || '').trim()))) {
    return directRows;
  }

  if (!gridInstance || typeof gridInstance.countRows !== 'function' || typeof gridInstance.getDataAtCell !== 'function') {
    return directRows;
  }

  const fallbackRows = [];
  const rowCount = gridInstance.countRows();
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = [];
    for (let colIndex = 0; colIndex < expectedColumnCount; colIndex += 1) {
      row.push(String(gridInstance.getDataAtCell(rowIndex, colIndex) ?? ''));
    }
    fallbackRows.push(row);
  }
  return fallbackRows;
}

function isValidViewKey(viewKey) {
  return Object.values(VIEW_KEYS).includes(viewKey);
}

function getPersistablePredicateRegistry() {
  return getPredicateRegistry().map((record) => ({
    iri: record.iri,
    objectMode: normalizePredicateMode(record.objectMode, record.iri),
  }));
}

function normalizeAxiomRecord(record) {
  if (AxiomBuilder.normalizeAxiomRecord) return AxiomBuilder.normalizeAxiomRecord(record);
  return {
    subjectIri: String(record?.subjectIri || '').trim(),
    axioms: Array.isArray(record?.axioms) ? record.axioms : [],
    rawRdf: String(record?.rawRdf || ''),
    preservedTriples: Array.isArray(record?.preservedTriples) ? record.preservedTriples : [],
  };
}

function getAxiomRecord(subjectIri) {
  const subject = String(subjectIri || '').trim();
  return normalizeAxiomRecord(axiomRecordsBySubject.get(subject) || { subjectIri: subject });
}

function setAxiomRecord(record) {
  const normalized = normalizeAxiomRecord(record);
  if (!normalized.subjectIri) return;
  const hasContent =
    normalized.axioms.length ||
    normalized.rawRdf.trim() ||
    normalized.preservedTriples.length;
  if (hasContent) axiomRecordsBySubject.set(normalized.subjectIri, normalized);
  else axiomRecordsBySubject.delete(normalized.subjectIri);
}

function mergeAxiomRecords(records, { replace = false } = {}) {
  if (replace) axiomRecordsBySubject = new Map();
  (Array.isArray(records) ? records : []).forEach(setAxiomRecord);
}

function getPersistableAxiomRecords() {
  return Array.from(axiomRecordsBySubject.values()).map(normalizeAxiomRecord);
}

function buildWorkspaceSnapshot(timestamp = new Date().toISOString()) {
  const predicates = getPersistablePredicateRegistry();
  return {
    version: 1,
    timestamp,
    activeView: isValidViewKey(getActiveViewKey()) ? getActiveViewKey() : DEFAULT_VIEW,
    predicates,
    axioms: getPersistableAxiomRecords(),
    rows: cloneRowsForWorkspace(readCurrentTableRows(), BASE_COLS + predicates.length),
  };
}

function normalizeWorkspaceSnapshot(snapshot) {
  if (FeatureUtils.normalizeWorkspaceSnapshot) {
    const normalized = FeatureUtils.normalizeWorkspaceSnapshot(snapshot, {
      baseCols: BASE_COLS,
      defaultView: DEFAULT_VIEW,
      isValidViewKey,
      normalizePredicateMode,
      normalizePredicateRecord,
    });
    if (!normalized) return null;
    return {
      ...normalized,
      axioms: (Array.isArray(snapshot?.axioms) ? snapshot.axioms : []).map(normalizeAxiomRecord),
    };
  }
  if (!snapshot || typeof snapshot !== 'object') return null;

  const seen = new Set();
  const predicates = (Array.isArray(snapshot.predicates) ? snapshot.predicates : [])
    .map((entry) => {
      const record = normalizePredicateRecord(entry);
      if (!record || seen.has(record.iri)) return null;
      seen.add(record.iri);
      return {
        iri: record.iri,
        objectMode: normalizePredicateMode(record.objectMode, record.iri),
      };
    })
    .filter(Boolean);

  const expectedColumnCount = BASE_COLS + predicates.length;
  return {
    version: Number(snapshot.version) || 1,
    timestamp: snapshot.timestamp || new Date().toISOString(),
    activeView: isValidViewKey(snapshot.activeView) ? snapshot.activeView : DEFAULT_VIEW,
    predicates,
    axioms: (Array.isArray(snapshot.axioms) ? snapshot.axioms : []).map(normalizeAxiomRecord),
    rows: cloneRowsForWorkspace(snapshot.rows, expectedColumnCount),
  };
}

function getRecordOrderValue(record) {
  if (FeatureUtils.getRecordOrderValue) {
    return FeatureUtils.getRecordOrderValue(record);
  }
  const parsedTimestamp = Date.parse(record?.timestamp || '');
  if (Number.isFinite(parsedTimestamp)) return parsedTimestamp;
  return typeof record?.id === 'number' ? record.id : -1;
}

function applyWorkspaceSnapshot(snapshot) {
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  if (!normalized || !gridInstance) return null;

  replacePredicateRegistry(normalized.predicates);
  mergeAxiomRecords(normalized.axioms, { replace: true });
  applyViewSchema(normalized.activeView, { captureCurrent: false });
  gridInstance.replaceRows(normalized.rows, 'LoadData');
  harvestRowsIntoVocab?.(normalized.rows);

  try {
    renderPredicateModesChecklist('predicate-modes-list');
  } catch (_) {}

  return normalized;
}

// Delete (optional)
async function clearOntologySettings() {
  await deleteTomOntologySettings();
  SETTINGS_CACHE = null;
  showToast('Ontology settings cleared from project storage.', 'info');
}

const handleExport = async (shouldDownload = false) => {
  console.info('handleExport happened');
  const rows = readCurrentTableRows();
  const selectedFormat = document.getElementById('exportFormat')?.value || 'ttl';
  const format = shouldDownload ? selectedFormat : getPreviewFormat(selectedFormat);

  try {
    const exportString = format === 'csv'
      ? generateCsvString(rows)
      : await generateRdfString(rows, format);
    output.value = exportString;

    if (shouldDownload) {
      const fileName = `ontology.${extensions[format] || 'txt'}`;
      downloadTextFile(fileName, exportString, { mimeType: mimeTypes[format] || 'text/plain' });
    }
  } catch (e) {
    console.error('handleExport failed:', e);
    showToast(`Export failed: ${e.message}`, 'error');
  }
};

/**
 * Stores the current TOM workspace and generated RDF in shared project storage.
 *
 * @returns {Promise<void>}
 */
async function storeTomWorkspaceProjectState() {
  console.info('storeTomWorkspaceProjectState happened');
  const rows = readCurrentTableRows();
  const selectedFormat = document.getElementById('exportFormat')?.value || 'ttl';
  const format = getSaveableRdfFormat(selectedFormat);

  try {
    const rdfString = await generateRdfString(rows, format);
    output.value = rdfString;

    const timestamp = new Date().toISOString();
    await storeTomAuthoringSession({
      workspaceSnapshot: buildWorkspaceSnapshot(timestamp),
      rdfString,
      format,
      timestamp
    });

    console.info('Workspace and RDF artifact saved to shared project storage successfully.');
    showToast('Workspace and RDF artifact saved to project storage successfully.', 'success');

    updateReloadSessionButton(); // reflect availability immediately
  } catch (e) {
    console.error('storeTomWorkspaceProjectState failed:', e);
    showToast('Failed to save workspace data to project storage.', 'error');
  }
};

/**
 * Checks if there is a prior saved session in shared or legacy project storage.
 * @params none
 * @returns {Promise<boolean>} 
 */
async function hasPriorSession() {
  return hasTomSavedSession();
}

// Show/hide + enable/disable the button
function setReloadBtnVisible(isVisible) {
  const btn = document.getElementById('reloadSavedSessionBtn');
  if (!btn) return;
  btn.hidden = !isVisible;
  btn.disabled = !isVisible;
}
// Check and update the button (call on load and after saves)
async function updateReloadSessionButton() {
  try {
    console.info('updateReloadSessionButton happened');
    const visible = await hasPriorSession();
    setReloadBtnVisible(visible);
  }
    catch (e) {
    console.warn('updateReloadSessionButton failed', e);}
}

function firstLiteral(objs) {
  // pick the first literal lexical form from an array of objects (already stringified below)
  for (const o of objs) {
    if (!o.startsWith('"')) continue;
    const lastQuote = o.lastIndexOf('"');
    if (lastQuote <= 0) continue;
    const lexical = o.slice(1, lastQuote).replace(/\\"/g, '"');
    return lexical;
  }
  return '';
}

function iriFromObjects(objs) {
  // pick the first IRI-looking object like <http://...>
  for (const o of objs) {
    const m = /^<([^>]+)>$/.exec(o);
    if (m) return m[1];
  }
  return '';
}

function getSemanticRdfTypes(rdfTypes) {
  const structuralTypes = new Set([
    COMMON_NAMESPACE_IRIS.owl.Class,
    COMMON_NAMESPACE_IRIS.owl.ObjectProperty,
    COMMON_NAMESPACE_IRIS.owl.DatatypeProperty,
    COMMON_NAMESPACE_IRIS.owl.AnnotationProperty,
    COMMON_NAMESPACE_IRIS.owl.NamedIndividual,
    COMMON_NAMESPACE_IRIS.owl.Ontology,
  ]);

  return (rdfTypes || [])
    .map(v => /^<([^>]+)>$/.exec(v)?.[1])
    .filter(u => u && !structuralTypes.has(u));
}

function resolveNamedNodeIri(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;

  if (/^<[^>\s]+>$/.test(v)) {
    return v.slice(1, -1);
  }

  if (/^[A-Za-z][\w-]*:[\w.-]+$/.test(v)) {
    const iri = curieToIri(v);
    if (iri) return iri;
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/.test(v)) {
    return v;
  }

  return null;
}

function asObjectTerm(value) {
  if (value == null) return null;
  const v = String(value).trim();
  const namedNodeIri = resolveNamedNodeIri(v);
  if (namedNodeIri) {
    return N3.DataFactory.namedNode(namedNodeIri);
  }
  // Fallback: literal
  return N3.DataFactory.literal(v);
}

// Reloads the most recent saved session from shared project storage, with legacy fallback.
async function reloadSavedSession() {
  try {
    const { latestWorkspace, latestRdfRecord, source } = await readLatestTomSavedSession();

    if (!latestWorkspace && !latestRdfRecord) {
      console.warn('No prior TOM session found in project or legacy IndexedDB storage.');
      showToast('No prior session found.', 'info');
      return;
    }

    const shouldUseWorkspace = latestWorkspace &&
      (!latestRdfRecord || getRecordOrderValue(latestWorkspace) >= getRecordOrderValue(latestRdfRecord));

    if (shouldUseWorkspace) {
      const restoredWorkspace = applyWorkspaceSnapshot(latestWorkspace);
      if (restoredWorkspace) {
        showToast(`Reloaded ${restoredWorkspace.rows.length} row${restoredWorkspace.rows.length !== 1 ? 's' : ''} from latest saved workspace (${source})`, 'success');
        return;
      }
    }

    if (!latestRdfRecord) {
      console.warn('Latest workspace snapshot could not be restored and no RDF fallback was found.');
      showToast('No compatible saved session was found.', 'info');
      return;
    }

    const { rdfData, format } = latestRdfRecord;

    // Parse RDF -> quads through the shared RDF IO adapter layer.
    const parsed = await parseRdfTextWithAdapters(rdfData, {
      format: mimeTypes[String(format || '').toLowerCase()] || format || 'text/turtle',
      runtime: { N3, jsonld: window.jsonld, $rdf: window.$rdf }
    });
    const quads = parsed.quads;

    // Build subject -> predicate->values map + set of all predicates
    const subjMap = new Map();
    const extraPreds = new Set();

    for (const q of quads) {
      const s = isBlankNodeTerm(q.subject) ? `_:${q.subject.value}` : q.subject.value;
      const p = q.predicate.value;

      let o;
      if (q.object.termType === 'Literal') {
        const lang = q.object.language ? `@${q.object.language}` : '';
        const dt = q.object.datatype && q.object.datatype.value !== COMMON_NAMESPACE_IRIS.xsd.string
          ? `^^<${q.object.datatype.value}>` : '';
        o = `"${q.object.value}"${lang}${dt}`;
      } else if (isBlankNodeTerm(q.object)) {
        o = `_:${q.object.value}`;
      } else {
        o = `<${q.object.value}>`;
      }

      if (!subjMap.has(s)) subjMap.set(s, new Map());
      const pMap = subjMap.get(s);
      if (!pMap.has(p)) pMap.set(p, new Set());
      pMap.get(p).add(o);
    }

    const firstLiteral = (arr) =>
      (arr || []).find(v => v.startsWith('"'))?.replace(/^"(.*)"(?:@[\w-]+|\^\^<[^>]+>)?$/, '$1') || '';

    const iriFromObjects = (arr) => {
      for (const o of arr || []) {
        const m = /^<([^>]+)>$/.exec(o);
        if (m) return m[1];
      }
      return '';
    };

    const ontologyIriFromSettings = getOntologyIRI();

    const rowsTmp = [];
    const rdfFallbackAxiomRecords = [];
    for (const [s, pMap] of subjMap.entries()) {

      if (s === ontologyIriFromSettings) continue;
      const rdfTypes = Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdf.type)?.values() || []);
      const hasType = iri => rdfTypes.includes(`<${iri}>`);
      if (hasType(COMMON_NAMESPACE_IRIS.owl.Ontology)) continue;

      let elementType = '';
      if (hasType(COMMON_NAMESPACE_IRIS.owl.Class))           elementType = 'Class';
      else if (hasType(COMMON_NAMESPACE_IRIS.owl.ObjectProperty))    elementType = 'ObjectProperty';
      else if (hasType(COMMON_NAMESPACE_IRIS.owl.DatatypeProperty))   elementType = 'DatatypeProperty';
      else if (hasType(COMMON_NAMESPACE_IRIS.owl.AnnotationProperty))   elementType = 'AnnotationProperty';
      else if (hasType(COMMON_NAMESPACE_IRIS.owl.NamedIndividual))   elementType = 'NamedIndividual';
      else if (hasType(COMMON_NAMESPACE_IRIS.owl.Ontology))   elementType = 'Ontology'; // This is an outlier case, mostly for error handling
      else if (rdfTypes.length)                elementType = 'NamedIndividual';

      const label = firstLiteral(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.label)?.values() || []));
      const definition = firstLiteral(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.skos.definition)?.values() || []));

      let isA = '';
      if (elementType === 'Class') {
        isA = iriFromObjects(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.subClassOf)?.values() || []));
      } else if (elementType === 'ObjectProperty' || elementType === 'DatatypeProperty' || elementType === 'AnnotationProperty') {
        isA = iriFromObjects(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf)?.values() || []));
      } else if (elementType === 'NamedIndividual') {
        const classish = getSemanticRdfTypes(rdfTypes);
        if (classish.length) isA = classish[0];
      }

      const curatedVals = Array.from(pMap.get(COMMON_NAMESPACE_IRIS.cco2.curatedIn)?.values() || []);
      const curatedIn = iriFromObjects(curatedVals) || firstLiteral(curatedVals);

      // base row
      const row = Array.from({ length: BASE_COLS }, () => '');
      row[0] = s;
      row[1] = label;
      row[2] = elementType;
      row[3] = definition;
      row[4] = isA;
      row[5] = curatedIn;

      // gather extra predicates (not mapped to base columns)
      for (const p of pMap.keys()) {
        if (
          p === COMMON_NAMESPACE_IRIS.rdfs.label || p === COMMON_NAMESPACE_IRIS.skos.definition || p === COMMON_NAMESPACE_IRIS.rdf.type ||
          p === COMMON_NAMESPACE_IRIS.rdfs.subClassOf || p === COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf || p === COMMON_NAMESPACE_IRIS.cco2.curatedIn
        ) continue;
        extraPreds.add(p);
      }

      rowsTmp.push({ row, pMap });

      if (elementType === 'Class' && AxiomBuilder.extractClassAxioms) {
        const record = AxiomBuilder.extractClassAxioms(quads, {
          subjectIri: s,
          primaryIsA: isA,
          prefixes: iriPrefixes,
        });
        if (record.axioms?.length || record.rawRdf?.trim() || record.preservedTriples?.length) {
          rdfFallbackAxiomRecords.push(record);
        }
      }
    }

    // adopt discovered extra predicates as your custom columns (sorted for stability)
    const extraList = Array.from(extraPreds).sort();
    replacePredicateRegistry(extraList);

    const finalRows = rowsTmp.map(({ row, pMap }) => {
      const extended = row.concat(extraList.map(() => ''));
      extraList.forEach((predIri, i) => {
        const vals = Array.from(pMap.get(predIri)?.values() || []);
        extended[BASE_COLS + i] = vals.join(' ; ');
      });
      return extended;
    });

    const newHeaders = getColumnHeaders();
    const newColumns = getColumnDefinitions();
    gridInstance.setSchema(newHeaders, newColumns);
    gridInstance.replaceRows(finalRows, 'LoadData');
    mergeAxiomRecords(rdfFallbackAxiomRecords, { replace: true });
    harvestRowsIntoVocab?.(finalRows);

    showToast(`Reloaded ${subjMap.size} subject${subjMap.size!==1?'s':''} from latest saved RDF`, 'success');
  } catch (e) {
    console.error('[reloadSavedSession] failed:', e);
    showToast('Failed to reload prior session - see console', 'error');
  }
}

/*
* This set of functions are used to assist the user with a quick lookup service.
*/

// Add entries to the index
function addToVocabIndex(entries, source = "External") {
  for (const e of entries) {
    const rec = {
      iri: e.iri,
      curie: e.curie || iriToCurie(e.iri),
      label: e.label || "",
      type: e.type || "Class",
      altLabels: Array.isArray(e.altLabels) ? e.altLabels : [],
      source: e.source || source,
      deprecated: !!e.deprecated
    };
    if (!rec.iri) continue;
    const existing = vocabByIri.get(rec.iri);
    if (existing) {
      existing.curie = rec.curie || existing.curie;
      existing.label = rec.label || existing.label;
      existing.type = rec.type || existing.type;
      existing.altLabels = Array.isArray(rec.altLabels) ? rec.altLabels : existing.altLabels;
      existing.source = rec.source || existing.source;
      existing.deprecated = rec.deprecated || existing.deprecated;
      if (existing.curie) vocabByCurie.set(existing.curie, existing);
      if (existing.label) vocabByLabelLC.set(existing.label.toLowerCase(), existing);
      for (const alt of existing.altLabels || []) {
        if (alt) vocabByLabelLC.set(String(alt).toLowerCase(), existing);
      }
      continue;
    }
    vocabIndex.push(rec);
    vocabByIri.set(rec.iri, rec);
    if (rec.curie) vocabByCurie.set(rec.curie, rec);
    if (rec.label) vocabByLabelLC.set(rec.label.toLowerCase(), rec);
    for (const alt of rec.altLabels) {
      if (alt) vocabByLabelLC.set(String(alt).toLowerCase(), rec);
    }
  }
}

function extractOntologyVocabEntries(quads, source = "Imported Ontology") {
  const subjectData = new Map();

  for (const quad of quads || []) {
    const subject = quad.subject?.value;
    const predicate = quad.predicate?.value;
    const object = quad.object?.value;
    if (!subject || !predicate || !object) continue;

    if (!subjectData.has(subject)) {
      subjectData.set(subject, { label: '', type: '', altLabels: [] });
    }
    const entry = subjectData.get(subject);

    if (predicate === COMMON_NAMESPACE_IRIS.rdfs.label && !entry.label) entry.label = object;
    if (predicate === COMMON_NAMESPACE_IRIS.skos.altLabel) entry.altLabels.push(object);
    if (predicate === COMMON_NAMESPACE_IRIS.rdf.type) {
      if (object === COMMON_NAMESPACE_IRIS.owl.Class) entry.type = 'Class';
      else if (object === COMMON_NAMESPACE_IRIS.owl.ObjectProperty) entry.type = 'ObjectProperty';
      else if (object === COMMON_NAMESPACE_IRIS.owl.DatatypeProperty) entry.type = 'DatatypeProperty';
      else if (object === COMMON_NAMESPACE_IRIS.owl.AnnotationProperty) entry.type = 'AnnotationProperty';
      else if (object === COMMON_NAMESPACE_IRIS.owl.NamedIndividual) entry.type = 'NamedIndividual';
    }
  }

  return Array.from(subjectData.entries())
    .filter(([iri, entry]) => iri && entry.type && iri !== getOntologyIRI())
    .map(([iri, entry]) => ({
      iri,
      label: entry.label || '',
      type: entry.type,
      altLabels: Array.from(new Set(entry.altLabels)),
      source
    }));
}

// Fetch the lookup file file once at startup
async function loadVocabFrom(url, source = "External") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Index JSON must be an array");
    addToVocabIndex(data, source);
    console.info(`[vocab] Loaded ${data.length} entries from ${source}`);
  } catch (e) {
    console.error("[vocab] Failed to load index:", e);
    showToast("Could not load lookup index", "error");
  }
}

// Load BFO+CCO compact index (your path)
loadVocabFrom('./json/bfo-cco-lookup.json', 'BFO/CCO');

const PREDICATE_LOOKUP_TYPES = ['AnnotationProperty', 'ObjectProperty', 'DatatypeProperty', 'Property'];

function isPredicateVocabRecord(rec) {
  const type = String(rec?.type || '').trim();
  if (!type) return false;
  return PREDICATE_LOOKUP_TYPES.includes(type) || /Property$/i.test(type);
}

function iriToCurie(iri) {
  const result = compactIriToCurie(iri, iriPrefixes);
  if (result.ok) return result.value;

  const match = findLongestPrefixMatch(iri, iriPrefixes);
  if (match.ok) return `${match.prefix}:${String(iri || '').slice(match.namespaceIri.length)}`;

  return null;
}


// This function searches the vocabulary index for terms matching the query.
function searchVocab(q, { max = 50, typeHint = null } = {}) {
  const term = (q || "").trim().toLowerCase();
  if (!term) return [];

  const typeHints =
    typeHint == null
      ? null
      : Array.isArray(typeHint)
      ? typeHint
      : typeHint instanceof Set
      ? Array.from(typeHint)
      : [typeHint];
  const pool = typeHints ? vocabIndex.filter((x) => typeHints.includes(x.type)) : vocabIndex;

  const score = (rec) => {
    const fields = [
      rec.label,
      rec.curie || "",
      rec.iri,
      ...(rec.altLabels || [])
    ].map(s => (s || "").toLowerCase());

    if (fields.some(f => f === term)) return 0;          // exact
    if (fields.some(f => f.startsWith(term))) return 1;  // prefix
    if (fields.some(f => f.includes(term))) return 2;    // substring
    return 9;
  };

  const hits = [];
  for (const r of pool) {
    const s = score(r);
    if (s < 9) hits.push([s, r]);
  }
  hits.sort((a,b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label));
  return hits.slice(0, max).map(([,r]) => r);
}

function displayLabelAndCurie(rec) {
  return `${rec.label || rec.curie || rec.iri} - ${(rec.curie || rec.iri)}`;
}

function searchPredicateVocab(q, { max = 20 } = {}) {
  return searchVocab(q, { max, typeHint: PREDICATE_LOOKUP_TYPES }).filter(isPredicateVocabRecord);
}

function getKnownVocabRecordForIriish(value) {
  if (!value) return null;
  const v = String(value).trim();
  const token = normalizeIriToken(v);

  if (vocabByIri.has(token)) return vocabByIri.get(token);
  if (vocabByCurie.has(token)) return vocabByCurie.get(token);

  const fullIri = curieToIri(token);
  if (fullIri && vocabByIri.has(fullIri)) return vocabByIri.get(fullIri);
  return null;
}

function formatPredicateDisplayValue(value) {
  const rec = getKnownVocabRecordForIriish(value);
  if (rec && isPredicateVocabRecord(rec)) return displayLabelAndCurie(rec);
  return iriToCurie?.(String(value || '').trim()) || String(value || '').trim();
}

function formatPredicateHeaderTitle(value) {
  const rec = getKnownVocabRecordForIriish(value);
  return rec?.label || rec?.curie || rec?.iri || iriToCurie?.(String(value || '').trim()) || String(value || '').trim();
}

function resolvePredicateInputToIri(value) {
  if (!value) return null;
  const v = String(value).trim();
  const token = normalizeIriToken(v);

  if (/^https?:\/\/\S+$/i.test(token) || /^urn:[^:\s]+:.+/i.test(token) || /^<[^>\s]+>$/.test(token)) {
    return token.replace(/^<|>$/g, '');
  }

  if (token.includes(':')) {
    const expanded = expandCurieToIri(token, iriPrefixes);
    if (expanded.ok) return expanded.value;

    const rec = vocabByCurie.get(token);
    if (rec && isPredicateVocabRecord(rec)) return rec.iri;
  }

  const predicateMatches = searchPredicateVocab(v, { max: 20 });
  const loweredToken = token.toLowerCase();
  const loweredValue = v.toLowerCase();
  const exactMatch = predicateMatches.find((rec) => {
    const fields = [rec.label, rec.curie, rec.iri, ...(rec.altLabels || [])]
      .filter(Boolean)
      .map((field) => String(field).toLowerCase());
    return fields.includes(loweredToken) || fields.includes(loweredValue);
  });

  return exactMatch?.iri || null;
}

function updatePredicateIriSuggestions() {
  const input = document.getElementById('predicate-iri');
  const datalist = document.getElementById('predicate-iri-suggestions');
  const help = document.getElementById('predicate-iri-help');
  if (!input || !datalist || !help) return;

  const query = String(input.value || '').trim();
  datalist.innerHTML = '';

  if (!query) {
    help.textContent = 'Suggestions only include annotation, object, and datatype properties.';
    return;
  }

  const matches = searchPredicateVocab(query, { max: 12 });
  matches.forEach((rec) => {
    const option = document.createElement('option');
    option.value = displayLabelAndCurie(rec);
    datalist.appendChild(option);
  });

  const resolved = resolvePredicateInputToIri(query);
  const resolvedRecord = getKnownVocabRecordForIriish(resolved);
  if (resolvedRecord && isPredicateVocabRecord(resolvedRecord)) {
    help.textContent = `Will use ${displayLabelAndCurie(resolvedRecord)}.`;
    return;
  }

  if (matches.length) {
    help.textContent = `Showing ${matches.length} property match${matches.length !== 1 ? 'es' : ''}.`;
    return;
  }

  if (curieToIri(query) || /^https?:\/\/\S+$/i.test(query) || /^urn:[^:\s]+:.+/i.test(query) || /^<[^>\s]+>$/.test(query)) {
    help.textContent = 'Custom IRI/CURIE will be used as entered.';
    return;
  }

  help.textContent = 'No property match found yet. Enter a full IRI or CURIE to add a custom predicate.';
}

// Try to resolve whatever the user typed to an IRI
function resolveToIri(value) {
  if (!value) return null;
  const v = String(value).trim();
  const displayParts = v.split(/\s(?:-|::)\s/);
  const maybeCode = displayParts.length > 1 ? displayParts[displayParts.length - 1].trim() : v;

  if (/^https?:\/\/\S+$/i.test(maybeCode) || /^urn:[^:\s]+:.+/i.test(maybeCode) || /^<[^>\s]+>$/.test(maybeCode)) {
    return maybeCode.replace(/^<|>$/g, '');
  }

  if (maybeCode.includes(':')) {
    const expanded = expandCurieToIri(maybeCode, iriPrefixes);
    if (expanded.ok) return expanded.value;

    const rec = vocabByCurie.get(maybeCode);
    if (rec) return rec.iri;
  }

  const exactByIri = vocabByIri.get(maybeCode) || vocabByIri.get(v);
  if (exactByIri) return exactByIri.iri;

  const byLabel =
    vocabByLabelLC.get(String(maybeCode).toLowerCase()) ||
    vocabByLabelLC.get(String(v).toLowerCase());
  if (byLabel) return byLabel.iri;

  return null;
}

// This function is used to harvest rows from the grid into the vocabulary index.
function harvestRowsIntoVocab(rows) {
  const IRI_COL = 0, LABEL_COL = 1, TYPE_COL = 2;
  const entries = [];
  for (const r of rows) {
    const iri = r[IRI_COL];
    const label = r[LABEL_COL];
    const type = r[TYPE_COL];
    if (iri && type) {
      entries.push({ iri, label: label || "", type: type, source: "Local" });
    }
  }
  if (entries.length) addToVocabIndex(entries, "Local");
}

// This function normalizes "Is A" edits by resolving them to IRIs.
function normalizeIsAEdits(changes, source) {
  if (!Array.isArray(changes)) return;
  for (const ch of changes) {
    // [row, prop(or col index), oldValue, newValue]
    const row = ch[0];
    const prop = ch[1];
    const newVal = ch[3];

    // Resolve prop to column index
    const col = (typeof prop === 'number') ? prop : gridInstance.propToCol(prop);
    if (col !== 4) continue; // only "Is A" column

    const iri = resolveToIri(newVal);
    if (iri) ch[3] = iri; // overwrite with IRI to store canonically
  }
}

function attachGridHooks() {
  gridInstance.addHook('beforeChange', normalizeIsAEdits);

  // NEW: when rows are created, auto-assign IRIs
  gridInstance.addHook('afterCreateRow', (index, amount, source) => {
    try {
      const s = getOntologySettings();
      const mode = s.iriMode || 'opaque';

      if (mode === 'opaque') {
        let maxNum = findMaxOpaqueNumber(gridInstance, s);
        for (let r = 0; r < amount; r++) {
          const rowIndex = index + r;
          maxNum += 1;
          const iri = buildOpaqueIri(maxNum, s);
          gridInstance.setDataAtCell(rowIndex, 0, iri); // col 0 = IRI
        }
      } else {
        // readable: we'll fill when/if label appears (see afterChange)
        for (let r = 0; r < amount; r++) {
          const rowIndex = index + r;
          // leave IRI blank for now
          gridInstance.setDataAtCell(rowIndex, 0, '');
        }
      }
    } catch (e) {
      console.error('[IRI] afterCreateRow failed', e);
    }
  });

  // NEW: when label changes in readable mode, (re)build IRI if empty or previously auto-generated
  gridInstance.addHook('afterChange', (changes, source) => {
    if (!Array.isArray(changes) || source === 'LoadData') return;
    try {
      const s = getOntologySettings();
      if ((s.iriMode || 'opaque') !== 'readable') return;

      // gather existing iris for uniqueness checks
      const allIris = new Set(readCurrentTableRows().map(r => String(r?.[0] || '')));

      for (const ch of changes) {
        const row = ch[0];
        const col = (typeof ch[1] === 'number') ? ch[1] : gridInstance.propToCol(ch[1]);
        const newVal = ch[3];

        // Column 1 = label
        if (col === 1) {
          const currentIri = String(gridInstance.getDataAtCell(row, 0) || '');
          const label = String(newVal || '').trim();
          if (!label) continue;

          // Rebuild if IRI is blank OR was previously auto-generated (matches our base+delimiter)
          const { base, delimiter } = getBaseAndDelimiter(s);
          const looksAuto = currentIri.startsWith(`${base}${delimiter}`);

          if (!currentIri || looksAuto) {
            // Temporarily exclude our own current IRI to avoid self-collision logic
            if (currentIri) allIris.delete(currentIri);

            const iri = buildReadableIri(label, s, allIris);
            gridInstance.setDataAtCell(row, 0, iri);

            allIris.add(iri); // reserve
          }
        }
      }
    } catch (e) {
      console.error('[IRI] afterChange label->IRI sync failed', e);
    }
  });
}

// This function backfills IRIs in the grid based on the selected mode.
function backfillIris() {
  try {
    if (!gridInstance) {
      console.warn('[IRI] No table instance');
      showToast('Table not ready', 'error');
      return;
    }

    const s = getEffectiveOntologySettings();
    const mode = s.iriMode || 'opaque';

    const total = gridInstance.countRows();

    // collect already-used IRIs to ensure uniqueness
    const existing = new Set();
    for (let r = 0; r < total; r++) {
      const iri = String(gridInstance.getDataAtCell(r, 0) || '').trim();
      if (iri) existing.add(iri);
    }

    let filled = 0;
    let skipped = 0;

    if (mode === 'opaque') {
      const startAt = Math.max(1, s.opaqueStart || 1);
      const usedOpaqueNumbers = collectUsedOpaqueNumbers(gridInstance, s);

      for (let r = 0; r < total; r++) {
        const iri = String(gridInstance.getDataAtCell(r, 0) || '').trim();
        if (!iri) {
          const next = findNextAvailableOpaqueNumber(usedOpaqueNumbers, s, startAt);
          const newIri = buildOpaqueIri(next, s);
          gridInstance.setDataAtCell(r, 0, newIri);
          existing.add(newIri);
          usedOpaqueNumbers.add(next);
          filled++;
        }
      }
    } else {
      // human-readable: derive from label when present
      for (let r = 0; r < total; r++) {
        const iri = String(gridInstance.getDataAtCell(r, 0) || '').trim();
        if (!iri) {
          const label = String(gridInstance.getDataAtCell(r, 1) || '').trim();
          if (!label) { skipped++; continue; }
          const newIri = buildReadableIri(label, s, existing);
          gridInstance.setDataAtCell(r, 0, newIri);
          existing.add(newIri);
          filled++;
        }
      }
    }

    showToast(`Backfilled ${filled} IRI${filled!==1?'s':''}` + (skipped ? ` (skipped ${skipped} unlabeled row${skipped!==1?'s':''})` : ''), 'success');
  } catch (e) {
    console.error('[IRI] Backfill failed', e);
    showToast('Backfill failed - see console', 'error');
  }
}

// Gets n rows to the bottom of the grid.
function getRowCountInput() {
  const n = parseInt(document.getElementById("row-count").value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}


// This function adds n blank rows to the bottom of the grid.
function addRowsToTable(n = 1) {
  if (!gridInstance || n < 1) return;
  gridInstance.insertRows(gridInstance.countRows(), n);
}

// This function deletes n rows from the bottom of the grid.
function removeRowsFromBottom(n = 1) {
  if (!gridInstance || n < 1) return;
  const total = gridInstance.countRows();
  const toRemove = Math.min(n, total);
  if (toRemove > 0) gridInstance.removeRows(total - toRemove, toRemove);
}



/**
 * Returns [ {index, header} ] for custom predicate columns (all columns after BASE_COLS).
 */
function getCustomPredicateColumns() {
  if (!gridInstance) return [];
  const headers = gridInstance.getColHeader(); // includes hidden columns
  const out = [];
  for (let c = BASE_COLS; c < headers.length; c++) {
    out.push({ index: c, header: String(headers[c]) });
  }
  return out;
}

function getHiddenColumnIndexes() {
  return gridInstance?.getHiddenColumns?.() || [];
}

function getHiddenColumnSet() {
  return new Set(getHiddenColumnIndexes());
}

function setPredicateViewVisibility(record, viewKey, visible) {
  if (!record) return;
  if (viewKey === VIEW_KEYS.RELATA) {
    record.showInRelata = visible;
  } else {
    record.showInOntology = visible;
  }
}

function getPredicateViewPlacement(record) {
  if (FeatureUtils.getPredicateViewPlacement) {
    return FeatureUtils.getPredicateViewPlacement(record);
  }
  if (!record) return 'hidden';
  const inOntology = record.showInOntology !== false;
  const inRelata = record.showInRelata !== false;
  if (inOntology && inRelata) return 'both';
  if (inOntology) return 'ontology';
  if (inRelata) return 'relata';
  return 'hidden';
}

function applyPredicateViewPlacement(record, placement) {
  if (FeatureUtils.applyPredicateViewPlacement) {
    return FeatureUtils.applyPredicateViewPlacement(record, placement);
  }
  if (!record) return null;
  const normalized = String(placement || 'both').trim().toLowerCase();
  record.showInOntology = normalized === 'both' || normalized === 'ontology';
  record.showInRelata = normalized === 'both' || normalized === 'relata';
  return record;
}

function syncPredicatePlacementToHiddenState(index, record) {
  if (!record || !Number.isInteger(index) || index < BASE_COLS) return;

  const ontologyHidden = new Set(getHiddenColumnsForView(VIEW_KEYS.ONTOLOGY));
  const relataHidden = new Set(getHiddenColumnsForView(VIEW_KEYS.RELATA));

  if (record.showInOntology === false) ontologyHidden.add(index);
  else ontologyHidden.delete(index);

  if (record.showInRelata === false) relataHidden.add(index);
  else relataHidden.delete(index);

  setHiddenColumnsForView(VIEW_KEYS.ONTOLOGY, ontologyHidden);
  setHiddenColumnsForView(VIEW_KEYS.RELATA, relataHidden);
}

function setColumnsVisibilityForView(viewKey, indexes, visible) {
  const hidden = new Set(getHiddenColumnsForView(viewKey));
  (Array.isArray(indexes) ? indexes : []).forEach((index) => {
    if (!Number.isInteger(index) || index < 0) return;
    if (visible) hidden.delete(index);
    else hidden.add(index);
  });

  setHiddenColumnsForView(viewKey, hidden);
  if (viewKey === getActiveViewKey() && gridInstance) {
    gridInstance.setHiddenColumns(Array.from(hidden));
  }

  try {
    renderPredicateModesChecklist('predicate-modes-list');
  } catch (_) {}

  return Array.from(hidden).sort((a, b) => a - b);
}

function setViewColumnVisibility(viewKey, index, visible) {
  setColumnsVisibilityForView(viewKey, [index], visible);
}

function showAllViewColumns(viewKey) {
  setColumnsVisibilityForView(viewKey, gridInstance?.getColHeader?.().map((_, index) => index) || [], true);
}

function openManagePredicatesModal() {
  document.getElementById('predicate-iri').value = '';
  document.getElementById('predicate-target-view').value = 'both';
  document.getElementById('predicate-object-mode').value = 'auto';
  updatePredicateIriSuggestions();
  renderPredicateModesChecklist('predicate-modes-list');
  document.getElementById('manage-predicates-modal').style.display = 'block';
}

function closeAxiomBuilderDrawer() {
  const drawer = document.getElementById('axiom-builder-drawer');
  const backdrop = document.getElementById('axiom-builder-backdrop');
  if (mountedAxiomBuilder?.destroy) mountedAxiomBuilder.destroy();
  mountedAxiomBuilder = null;
  drawer?.classList.remove('is-open');
  drawer?.setAttribute('aria-hidden', 'true');
  if (backdrop) backdrop.hidden = true;
}

function openAxiomBuilderDrawer(rowIndex) {
  if (!gridInstance || !AxiomBuilder.mount) {
    showToast('Axiom builder is not available.', 'error');
    return;
  }

  harvestRowsIntoVocab?.(gridInstance.getData?.() || []);
  const row = gridInstance.getSourceDataAtRow(rowIndex);
  if (!row) return;
  const subjectIri = resolveToIri(row[0]) || String(row[0] || '').trim();
  if (!subjectIri) {
    showToast('Add an IRI for this row before editing axioms.', 'error');
    return;
  }

  const subjectLabel = String(row[1] || '').trim() || subjectIri;
  const subjectType = String(row[2] || '').trim();
  const drawer = document.getElementById('axiom-builder-drawer');
  const backdrop = document.getElementById('axiom-builder-backdrop');
  const subtitle = document.getElementById('axiom-builder-drawer-subtitle');
  const root = document.getElementById('axiom-builder-root');
  if (!drawer || !root) return;

  if (mountedAxiomBuilder?.destroy) mountedAxiomBuilder.destroy();
  if (subtitle) subtitle.textContent = `${subjectType || 'Entity'}: ${subjectLabel}`;
  mountedAxiomBuilder = AxiomBuilder.mount(root, {
    subjectIri,
    subjectLabel,
    subjectType,
    record: getAxiomRecord(subjectIri),
    prefixes: iriPrefixes,
    lookup(query, options) {
      return searchVocab(query, { max: options?.max || 8 }).map((rec) => ({
        iri: rec.iri,
        curie: rec.curie || iriToCurie(rec.iri),
        label: rec.label || rec.curie || rec.iri,
        type: rec.type || '',
        source: rec.source || '',
      }));
    },
    resolveTerm(value) {
      return resolveToIri(value);
    },
    validateRaw(value, subjectIriForRaw) {
      try {
        const quads = parseRawAxiomRdf(value);
        const hasSelectedSubject = quads.some((quad) => quad.subject?.value === subjectIriForRaw);
        if (quads.length && !hasSelectedSubject) {
          return { valid: true, message: 'Valid Turtle. Warning: no triples use the selected row IRI as subject.' };
        }
        return { valid: true, message: quads.length ? 'Valid Turtle.' : 'Raw RDF is empty.' };
      } catch (error) {
        return { valid: false, message: error.message || 'Raw Turtle could not be parsed.' };
      }
    },
    onChange(record) {
      setAxiomRecord(record);
    },
  });

  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  if (backdrop) backdrop.hidden = false;
}

function buildGridContextMenuItems(context) {
  if (!gridInstance || !context) return [];

  const activeView = getActiveViewKey();
  const totalColumns = gridInstance.getColHeader().length;
  const hiddenColumns = new Set(getHiddenColumnsForView(activeView));
  const selectedColumnIndexes = Array.from(new Set(context.colIndexes || []))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < totalColumns);
  const selectedRowIndexes = Array.from(new Set(context.rowIndexes || []))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < gridInstance.countRows())
    .sort((a, b) => a - b);

  const items = [];

  if (context.kind === 'header' && selectedColumnIndexes.length) {
    const visibleColumns = Array.from({ length: totalColumns }, (_, index) => index)
      .filter((index) => isColumnVisibleInView(activeView, index))
      .length;
    const canHideColumns = selectedColumnIndexes.length < visibleColumns;
    const hideLabel = selectedColumnIndexes.length === 1 ? 'Hide Column' : `Hide ${selectedColumnIndexes.length} Columns`;

    items.push({
      id: 'hide-columns',
      label: hideLabel,
      disabled: !canHideColumns,
      onSelect: () => {
        setColumnsVisibilityForView(activeView, selectedColumnIndexes, false);
        showToast(`${selectedColumnIndexes.length} column${selectedColumnIndexes.length !== 1 ? 's' : ''} hidden in ${VIEW_LABELS[activeView]} view`, 'info');
      },
    });
    items.push({
      id: 'show-all-columns',
      label: `Show All ${VIEW_LABELS[activeView]} Columns`,
      disabled: hiddenColumns.size === 0,
      onSelect: () => {
        showAllViewColumns(activeView);
        showToast(`Showing all ${VIEW_LABELS[activeView]} columns`, 'success');
      },
    });
    items.push({ separator: true });
    items.push({
      id: 'manage-columns',
      label: 'Manage Predicates & Columns',
      onSelect: openManagePredicatesModal,
    });
  }

  if (context.kind === 'cell' && selectedRowIndexes.length) {
    const startRow = selectedRowIndexes[0];
    const rowCount = selectedRowIndexes.length;
    const endRow = selectedRowIndexes[rowCount - 1];
    const rowLabel = rowCount === 1 ? 'Row' : `${rowCount} Rows`;

    items.push({
      id: 'insert-rows-above',
      label: rowCount === 1 ? 'Insert Row Above' : `Insert ${rowCount} Rows Above`,
      onSelect: () => {
        gridInstance.insertRows(startRow, rowCount);
        showToast(`${rowCount} row${rowCount !== 1 ? 's' : ''} inserted above`, 'success');
      },
    });
    items.push({
      id: 'insert-rows-below',
      label: rowCount === 1 ? 'Insert Row Below' : `Insert ${rowCount} Rows Below`,
      onSelect: () => {
        gridInstance.insertRows(endRow + 1, rowCount);
        showToast(`${rowCount} row${rowCount !== 1 ? 's' : ''} inserted below`, 'success');
      },
    });
    items.push({
      id: 'add-row-end',
      label: 'Add Row at End',
      onSelect: () => {
        gridInstance.insertRows(gridInstance.countRows(), 1);
        showToast('1 row added at end', 'success');
      },
    });
    items.push({ separator: true });
    if (rowCount === 1) {
      items.push({
        id: 'edit-axioms',
        label: 'Edit OWL Axioms',
        onSelect: () => openAxiomBuilderDrawer(startRow),
      });
      items.push({ separator: true });
    }
    items.push({
      id: 'remove-rows',
      label: rowCount === 1 ? 'Remove Row' : `Remove ${rowLabel}`,
      onSelect: () => {
        gridInstance.removeRows(startRow, rowCount);
        showToast(`${rowCount} row${rowCount !== 1 ? 's' : ''} removed`, 'info');
      },
    });
  }

  return items;
}

/**
 * Build the predicate and column management table.
 * containerOrId: element or element id where the list goes.
 */
function renderPredicateModesChecklist(containerOrId) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) return;

  const headers = getColumnHeaders();
  container.innerHTML = '';

  const intro = document.createElement('p');
  intro.style.margin = '0 0 0.75rem';
  intro.style.fontSize = '0.92rem';
  intro.textContent = 'Use In controls whether a predicate belongs to Ontology, Relata, or both. Show is a session-only visibility toggle for predicates already used in that view.';
  container.appendChild(intro);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.justifyContent = 'space-between';
  controls.style.alignItems = 'center';
  controls.style.marginBottom = '0.75rem';

  const viewLabel = document.createElement('span');
  viewLabel.style.fontSize = '0.92rem';
  viewLabel.textContent = `Active view: ${VIEW_LABELS[getActiveViewKey()]}`;

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.gap = '0.5rem';

  [VIEW_KEYS.ONTOLOGY, VIEW_KEYS.RELATA].forEach((viewKey) => {
    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.textContent = `Show All ${VIEW_LABELS[viewKey]} Columns`;
    showAllBtn.addEventListener('click', () => {
      showAllViewColumns(viewKey);
      renderPredicateModesChecklist(container);
    });
    buttonRow.appendChild(showAllBtn);
  });
  controls.appendChild(viewLabel);
  controls.appendChild(buttonRow);
  container.appendChild(controls);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.padding = '0';
  table.style.margin = '0';

  const tableHead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  [
    { label: 'Column', align: 'left' },
    { label: 'Use In', align: 'center' },
    { label: `Show in ${VIEW_LABELS[VIEW_KEYS.ONTOLOGY]}`, align: 'center' },
    { label: `Show in ${VIEW_LABELS[VIEW_KEYS.RELATA]}`, align: 'center' },
    { label: 'Object is IRI?', align: 'center' },
  ].forEach(({ label, align }) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.style.textAlign = align;
    th.style.padding = '2px 4px';
    th.style.borderBottom = '1px solid #ccc';
    headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  const tBody = document.createElement('tbody');

  headers.forEach((header, index) => {
    const predicateRecord = getPredicateRecordByColumnIndex(index);
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.style.padding = '4px';
    tdLabel.style.borderBottom = '1px solid #f0f0f0';
    const label = document.createElement('label');
    label.textContent = predicateRecord ? formatPredicateDisplayValue(header) : header;
    label.title = header;
    tdLabel.appendChild(label);

    const tdOntology = document.createElement('td');
    tdOntology.style.padding = '4px';
    tdOntology.style.borderBottom = '1px solid #f0f0f0';
    tdOntology.style.textAlign = 'center';

    const tdPlacement = document.createElement('td');
    tdPlacement.style.padding = '4px';
    tdPlacement.style.borderBottom = '1px solid #f0f0f0';
    tdPlacement.style.textAlign = 'center';

    const ontologyCheckbox = document.createElement('input');
    ontologyCheckbox.type = 'checkbox';
    const predicateUsedInOntology = isPredicateUsedInView(predicateRecord, VIEW_KEYS.ONTOLOGY);
    ontologyCheckbox.checked = predicateRecord
      ? isColumnVisibleInView(VIEW_KEYS.ONTOLOGY, index)
      : isColumnVisibleInView(VIEW_KEYS.ONTOLOGY, index);
    ontologyCheckbox.disabled = Boolean(predicateRecord) && !predicateUsedInOntology;
    if (ontologyCheckbox.disabled) {
      ontologyCheckbox.title = `Not used in ${VIEW_LABELS[VIEW_KEYS.ONTOLOGY]}`;
    }
    ontologyCheckbox.addEventListener('change', (event) => {
      setViewColumnVisibility(VIEW_KEYS.ONTOLOGY, index, event.currentTarget.checked);
    });
    tdOntology.appendChild(ontologyCheckbox);

    const tdRelata = document.createElement('td');
    tdRelata.style.padding = '4px';
    tdRelata.style.borderBottom = '1px solid #f0f0f0';
    tdRelata.style.textAlign = 'center';

    const tdMode = document.createElement('td');
    tdMode.style.padding = '4px';
    tdMode.style.borderBottom = '1px solid #f0f0f0';
    tdMode.style.textAlign = 'center';

    const relataCheckbox = document.createElement('input');
    relataCheckbox.type = 'checkbox';
    const predicateUsedInRelata = isPredicateUsedInView(predicateRecord, VIEW_KEYS.RELATA);
    relataCheckbox.checked = predicateRecord
      ? isColumnVisibleInView(VIEW_KEYS.RELATA, index)
      : isColumnVisibleInView(VIEW_KEYS.RELATA, index);
    relataCheckbox.disabled = Boolean(predicateRecord) && !predicateUsedInRelata;
    if (relataCheckbox.disabled) {
      relataCheckbox.title = `Not used in ${VIEW_LABELS[VIEW_KEYS.RELATA]}`;
    }
    relataCheckbox.addEventListener('change', (event) => {
      setViewColumnVisibility(VIEW_KEYS.RELATA, index, event.currentTarget.checked);
    });
    tdRelata.appendChild(relataCheckbox);

    if (predicateRecord) {
      const placementSelect = document.createElement('select');
      placementSelect.style.width = '100%';
      [
        { value: 'both', label: 'Both views' },
        { value: 'ontology', label: 'Ontology only' },
        { value: 'relata', label: 'Relata only' },
        { value: 'hidden', label: 'Hidden in both' },
      ].forEach((option) => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        placementSelect.appendChild(optionEl);
      });
      placementSelect.value = getPredicateViewPlacement(predicateRecord);
      placementSelect.addEventListener('change', (event) => {
        applyPredicateViewPlacement(predicateRecord, event.currentTarget.value);
        syncPredicatePlacementToHiddenState(index, predicateRecord);

        const currentView = getActiveViewKey();
        if (gridInstance) {
          gridInstance.setHiddenColumns(Array.from(getHiddenColumnsForView(currentView)));
        }
        renderPredicateModesChecklist(container);
      });
      tdPlacement.appendChild(placementSelect);

      const modeCheckbox = document.createElement('input');
      modeCheckbox.type = 'checkbox';
      modeCheckbox.checked = predicateRecord.objectMode === 'iri';
      modeCheckbox.dataset.predicateIri = predicateRecord.iri;
      modeCheckbox.addEventListener('change', (event) => {
        const pred = event.currentTarget.dataset.predicateIri;
        setPredicateValueMode(pred, event.currentTarget.checked ? 'iri' : 'literal');
      });
      tdMode.appendChild(modeCheckbox);
    } else {
      tdPlacement.textContent = 'Base column';
      tdPlacement.style.color = '#666';
      tdMode.textContent = '-';
      tdMode.style.color = '#666';
    }

    tr.appendChild(tdLabel);
    tr.appendChild(tdPlacement);
    tr.appendChild(tdOntology);
    tr.appendChild(tdRelata);
    tr.appendChild(tdMode);
    tBody.appendChild(tr);
  });

  table.appendChild(tBody);
  container.appendChild(table);
}


/**
 * Render a checklist of custom predicates into a container.
 *
 * @param {string|HTMLElement} containerOrId  Element or element id of the container
 * @param {Object} [opts]
 * @param {Set<string>|Set<number>} [opts.prechecked]  Headers or indices to start checked
 * @param {boolean} [opts.defaultChecked=false]        Checked state if not in `prechecked`
 * @param {(info:{index:number, header:string, checked:boolean, event:Event})=>void} [opts.onToggle]
 * @param {(h:string)=>string} [opts.labelize]         Optional fn to prettify labels (e.g., iriToNiceLabel)
 */
function renderCustomPredicateChecklist(containerOrId, opts = {}) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) {
    console.warn('[renderCustomPredicateChecklist] container not found');
    return;
  }

  const {
    prechecked,
    defaultChecked = false,
    onToggle,
    labelize = (h) => (typeof iriToNiceLabel === 'function' ? iriToNiceLabel(h) : h),
  } = opts;

  // Build list of items
  const items = getCustomPredicateColumns();
  const hiddenColumns = getHiddenColumnSet();

  // Clear and render
  container.innerHTML = '';
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  ul.style.margin = '0';

  items.forEach(({ index, header }) => {
    const id = `pred-${index}`;
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '8px';
    li.style.margin = '6px 0';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;

    // Determine initial checked state
    let startChecked = defaultChecked;
    if (prechecked instanceof Set) {
      // Support either header names or indices in the set
      startChecked = prechecked.has(header) || prechecked.has(index);
    }
    checkbox.checked = startChecked;

    // Optionally show if currently hidden in the grid.
    const hiddenBadge = hiddenColumns.has(index) ? ' (hidden)' : '';

    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = `${labelize(header)}${hiddenBadge}`;

    checkbox.addEventListener('change', (ev) => {
      onToggle?.({ index, header, checked: ev.target.checked, event: ev });
    });

    li.appendChild(checkbox);
    li.appendChild(label);
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

/*
  These functions are used to manage predicates:
    confirmAddPredicate adds a new predicate to the ontology spreadsheet.
*/
async function confirmAddPredicate() {
  try {
    // 1) Handle add predicate (existing flow)
    const select = document.getElementById('predicate-select');
    const iriInput = document.getElementById('predicate-iri');
    const targetViewSelect = document.getElementById('predicate-target-view');
    const objectModeSelect = document.getElementById('predicate-object-mode');
    const selectedIRI = select?.value.trim() || '';
    const rawCustomInput = iriInput?.value.trim() || '';
    const customIRI = resolvePredicateInputToIri(rawCustomInput);
    const finalIRI = customIRI || selectedIRI;

    if (rawCustomInput && !customIRI) {
      showToast('Custom predicate input must resolve to a property label, CURIE, or full IRI.', 'error');
      return;
    }

    if (finalIRI) {
      if (getPredicateRecord(finalIRI)) {
        alert("Predicate already added.");
      } else {
        const placement = targetViewSelect?.value || 'both';
        const selectedMode = objectModeSelect?.value || 'auto';
        const nextRecord = upsertPredicateRecord(finalIRI, {
          objectMode:
            selectedMode === 'iri' || selectedMode === 'literal'
              ? selectedMode
              : (getPredicateValueMode(finalIRI) || defaultModeForPredicate(finalIRI)),
          showInOntology: true,
          showInRelata: true,
        });
        applyPredicateViewPlacement(nextRecord, placement);
        syncPredicatePlacementToHiddenState(BASE_COLS + getPredicateRegistry().findIndex((record) => record.iri === finalIRI), nextRecord);

        const newHeaders = getColumnHeaders(); // base + customs
        const newColumns = getColumnDefinitions();
        const oldData = readCurrentTableRows();
        const validTypes = getElementTypes();

        const cleanedRows = oldData.map(row => {
          const fixed = Array.from({ length: BASE_COLS + getPredicateRegistry().length }, (_, i) => row[i] ?? '');

          // sanitize element type
          if (!validTypes.includes(fixed[2])) fixed[2] = '';

          return fixed;
        });

        gridInstance.setSchema(newHeaders, newColumns);
        gridInstance.replaceRows(cleanedRows, 'LoadData');
        harvestRowsIntoVocab?.(cleanedRows);
         // Refresh the modes UI if the modal is open
         try { renderPredicateModesChecklist('predicate-modes-list'); } catch (_) {}
      }
    }

    showToast('Predicates/columns updated', 'success');
  } catch (e) {
    console.error('[ManagePredicates] confirmAddPredicate failed', e);
    showToast('Failed to update predicates/columns', 'error');
  }
}

// Try to resolve CURIE-like strings to IRIs; pass full IRIs through
function curieToIri(maybe) {
  if (!maybe) return null;
  const v = String(maybe).trim();
  if (/^https?:\/\//i.test(v)) return v;
  const expanded = expandCurieToIri(v, iriPrefixes);
  if (expanded.ok) return expanded.value;
  return null;
}

// For UI labels: prefer CURIE if we can build one
function iriToNiceLabel(iri) {
  return iriToCurie?.(iri) || iri;
}

// base header map
const BASE_HEADER_TO_PRED = new Map([
  ['label',        COMMON_NAMESPACE_IRIS.rdfs.label],
  ['definition',   COMMON_NAMESPACE_IRIS.skos.definition],
  ['element type', COMMON_NAMESPACE_IRIS.rdf.type],
  ['is curated in ontology', COMMON_NAMESPACE_IRIS.cco2.curatedIn],
]);

// Expand a single header to one or more concrete predicate IRIs for curation rules
// - Most headers map 1:1
// - "is a" maps to three IRIs so users can choose requiredness per element-type case
function headerToPredicateIrisForRules(header) {
  const h = String(header || '').trim().toLowerCase();
  if (BASE_HEADER_TO_PRED.has(h)) return [BASE_HEADER_TO_PRED.get(h)];

  // Special: "is a" expands
  if (h === 'is a') {
    return [
      COMMON_NAMESPACE_IRIS.rdf.type,
      COMMON_NAMESPACE_IRIS.rdfs.subClassOf,
      COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf,
    ].filter(Boolean);
  }

  // If header itself is an IRI or CURIE, include it
  const iri = curieToIri(header);
  return iri ? [iri] : [];
}

// Build the predicate set from grid headers, visible or hidden.
function collectPredicateIrisFromHeaders() {
  if (!gridInstance) return [];
  const headers = gridInstance.getColHeader(); // includes hidden
  const set = new Set();
  for (const h of headers) {
    headerToPredicateIrisForRules(h).forEach((iri) => set.add(iri));
  }
  return Array.from(set);
}

// Is a value present (non-empty string after trim)?
function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim().length > 0;
}

// Given a header name and a row, return the *predicate IRI* that header contributes to.
// Special-case: "is a" column predicate depends on element type in that row.
function predicateIriForHeader(header, row) {
  const h = String(header || '').trim();

  // 1) Direct base mappings
  const base = BASE_HEADER_TO_PRED.get(h.toLowerCase());
  if (base) return base;

  // 2) Dynamic "is a"
  if (h.toLowerCase() === 'is a') {
    const elementType = row?.[2] || '';
    // Use your existing logic for the *predicate* to use
    const predCurie = getIsAPredicate(elementType); // returns rdfs:subClassOf | rdfs:subPropertyOf | rdf:type | null
    if (!predCurie) return null;
    return curieToIri(predCurie);
  }

  // 3) If the header itself is a full IRI or curie, use it
  const iri = curieToIri(h);
  if (iri) return iri;

  // 4) Not a recognized predicate-bearing column
  return null;
}

// Build a set of predicate IRIs that are "present" for this row (i.e., non-empty cells)
function presentPredicatesForRow(row, headers) {
  const present = new Set();

  for (let col = 0; col < headers.length; col++) {
    const header = headers[col];
    const predIri = predicateIriForHeader(header, row);
    if (!predIri) continue;

    const cellVal = row[col];
    if (hasValue(cellVal)) {
      present.add(predIri);
    }
  }

  // Note: For element type we store presence if column "element type" has a value.
  // That column maps to rdf:type (as in your normative settings).
  return present;
}

/**
 * Gathers all IRIs/CURIEs used as predicates in the table columns
 * (excluding utility columns like IRI, Label, Type).
 * This relies on the globally available gridInstance and curieToIri.
 * * @returns {Set<string>} A Set of unique predicate IRIs.
 */
function getAllTablePredicates() {
    if (!gridInstance) return new Set();

    const allPredicates = new Set();
    const headers = gridInstance.getColHeader();
    
    // Adjust this based on where your first predicate column starts (e.g., 3 after IRI, Label, Type)
    const PREDICATE_START_INDEX = BASE_COLS - 3; // Assuming first 3 of BASE_COLS are not predicates

    for (let c = PREDICATE_START_INDEX; c < headers.length; c++) {
        const header = headers[c];
        let predicateIRI = header;

        try {
            // Attempt to resolve CURIEs in headers using your existing function
            const resolvedIri = curieToIri(header);
            if (resolvedIri) {
                predicateIRI = resolvedIri;
            }
        } catch (e) {
            // Header is neither a valid CURIE nor an IRI that can be resolved, ignore it.
            continue;
        }

        // Add the resolved IRI to the set
        allPredicates.add(predicateIRI);
    }
    
    return allPredicates;
}

/*
  These functions are used for inserting data:
    openInsertDataModal opens the modal for inserting data.
    closeInsertDataModal closes the modal and resets the file selection.
    resetFileSelection resets the file input and clears the selected file.
    handleFileDrop handles file drops into the dropzone.
    handleFileInputChange handles file selection via the file input.
    setSelectedFile updates the UI with the selected file and stores it.
    preventDefaults prevents default drag behaviors.
    handleFileTypeChange shows/hides the header row checkbox based on the selected file type.
*/

// Holds the selected file reference
var selectedFile = null;

/**
 * Opens the Insert Data modal
 */
function openInsertDataModal() {
  document.getElementById("insert-data-modal").style.display = "block";
  console.info("[Modal] Insert Data modal opened");
}

/**
 * Closes the Insert Data modal and resets file state
 */
function closeInsertDataModal() {
  document.getElementById("insert-data-modal").style.display = "none";
  resetFileSelection();
  console.info("[Modal] Insert Data modal closed");
}

/**
 * Resets the file selection UI and clears selectedFile variable
 */
function resetFileSelection() {
  selectedFile = null;
  currentImportFile = null;
  document.getElementById("file-input").value = "";
  document.getElementById("filename-display").style.display = "none";
  document.getElementById("filename-text").textContent = "";
  document.querySelector('input[name="file-type"][value="spreadsheet"]').checked = true;
  handleFileTypeChange();
  console.info("[File] File selection cleared");
}

/**
 * Handles file drop into dropzone
 */
function handleFileDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  currentImportFile = file;
  if (file) {
    setSelectedFile(file);
  }
}

/**
 * Handles file selection via file input
 */
function handleFileInputChange(event) {
  const file = event.target.files[0];
  currentImportFile = file;
  if (file) {
    setSelectedFile(file);
  }
}

/**
 * Updates the UI with selected file and stores it
 */
function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById("filename-text").textContent = file.name;
  document.getElementById("filename-display").style.display = "block";
  autoSelectFileType(file);
  console.info("[File] Selected:", file.name);
}

/**
 * Prevents default drag behavior (required)
 */
function preventDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Shows/hides header row checkbox based on file type radio
 */
function handleFileTypeChange() {
  const fileType = document.querySelector('input[name="file-type"]:checked').value;
  const headerCheckbox = document.getElementById('header-checkbox-container');
  headerCheckbox.style.display = fileType === 'ontology' ? 'none' : 'block';
  console.info(fileType === 'ontology' ? "[UI] Hiding header row checkbox" : "[UI] Showing header row checkbox");
}


/**
 * Parses CSV, TSV, XLS, or XLSX into a 2D row array using SheetJS.
 *
 * @param {File} file - The file object (from drag/drop or input)
 * @param {string} extension - The file extension (csv, tsv, xls, xlsx)
 * @param {boolean} hasHeaderRow - Whether the first row is a header
 * @returns {Promise<{rows: string[][], header: string[] | null}>}
 */
async function parseSpreadsheetData(file, extension, hasHeaderRow) {
  console.info(`[parseSpreadsheetData] Reading ${file.name}, header=${hasHeaderRow}`);

  try {
    const isWorkbook = extension === "xls" || extension === "xlsx";
    // Browser file I/O stops here; SheetJS parsing/normalization belongs to the tabular parsing cycle.
    const data = isWorkbook
      ? await readFileAsArrayBuffer(file)
      : await readFileAsText(file);

    // Read workbook
    var workbook = XLSX.read(data, {
      type: isWorkbook ? 'array' : 'string',
      raw: false
    });

    // Use first sheet
    var sheetName = workbook.SheetNames[0];
    var sheet = workbook.Sheets[sheetName];

    // Convert to 2D array
    var options = {
      header: 1, // raw rows
      blankrows: false
    };
    var allRows = XLSX.utils.sheet_to_json(sheet, options);

    var header = hasHeaderRow ? allRows[0] : null;
    var rows = hasHeaderRow ? allRows.slice(1) : allRows;

    return { rows: rows, header: header };
  } catch (error) {
    console.error("[parseSpreadsheetData] Error parsing:", error);
    throw error;
  }
}

/**
 * Handles the Insert Data "Save" button click
 */
async function handleInsertDataSave() {
  const selectedInsertMode = document.querySelector('input[name="insert-mode"]:checked')?.value;
  try {
    // Validate mode: only 'append' or 'replace'
    const insertMode = selectedInsertMode;
    if (!["append", "replace"].includes(insertMode)) {
      console.warn("Invalid insert mode:", insertMode);
      showToast("Invalid insert mode selected", "error");
      return;
    }

    if (!currentImportFile) {
      console.warn("No file selected");
      showToast("Please select a file before saving", "error");
      return;
    }

    // Header row checkbox (checked = true)
    const hasHeader = document.getElementById("first-row-header").checked;

    // Get file extension and parse
    const extension = getFilenameExtension(currentImportFile.name);
    const parsed = await parseSpreadsheetData(currentImportFile, extension, hasHeader);
    const allHeaders = getColumnHeaders(); // already includes customs
    const allColumns = getColumnDefinitions();

    const knownPredicates = allHeaders; // use as the canonical expected headers

    const result = validateTableData(parsed.rows, parsed.header, knownPredicates, hasHeader);

    if (!result.valid) {
      console.warn("Validation failed", result.errors);
      alert("Import failed:\n" + result.errors.join("\n"));  // Still important to stop the user
      return;
    }

    // Merge clean data
    const { mergedRows, stats } = mergeTableData(
      readCurrentTableRows(),
      result.cleanedRows,
      insertMode
    );
    mergeAxiomRecords(result.axiomRecords, { replace: insertMode === 'replace' });

    gridInstance.setSchema(allHeaders, allColumns);
    gridInstance.replaceRows(mergedRows, 'LoadData');
    harvestRowsIntoVocab?.(mergedRows);

    
    // Toast feedback
    showToast(
      `${stats.appended} rows added (${stats.total} total)`,
      "success"
    );

    // Close modal
    document.getElementById("insert-data-modal").style.display = "none";
    currentImportFile = null;
    resetFileInput();

  } catch (error) {
    console.error("Import error:", error);
    showToast("Error processing import - see console", "error");
  }
}

async function parseOntologyText(fileContent, fileName = '') {
  const detected = getSupportedMimeTypeForFilename(fileName);
  const mimeType = detected && detected.ok && detected.value.category === 'rdf'
    ? detected.value.mimeType
    : guessRdfMimeTypeFromText(fileContent);

  if (mimeType === 'text/plain') {
    throw new Error('Unsupported ontology file format.');
  }

  const parsed = await parseRdfTextWithAdapters(fileContent, {
    format: mimeType,
    runtime: { N3, jsonld: window.jsonld, $rdf: window.$rdf }
  });
  return parsed.quads;
}

async function parseOntologyData(file) {
  // Browser file I/O stops here; RDF parser selection belongs to the RDF parsing cycle.
  const fileContent = await readFileAsText(file);
  return parseOntologyText(fileContent, file.name);
}

function deriveOntologyImportTarget(quads) {
  if (CoreUtils.deriveOntologyImportTarget) {
    return CoreUtils.deriveOntologyImportTarget(quads, {
      rdfTypeIri: COMMON_NAMESPACE_IRIS.rdf.type,
      owlOntologyIri: COMMON_NAMESPACE_IRIS.owl.Ontology,
      owlVersionIri: COMMON_NAMESPACE_IRIS.owl.versionIRI
    });
  }

  const ontologySubjects = new Set();
  const versionIris = new Map();

  for (const quad of quads || []) {
    const subject = quad.subject?.value;
    const predicate = quad.predicate?.value;
    const object = quad.object?.value;
    if (!subject || !predicate || !object) continue;

    if (predicate === COMMON_NAMESPACE_IRIS.rdf.type && object === COMMON_NAMESPACE_IRIS.owl.Ontology) {
      ontologySubjects.add(subject);
    }
    if (predicate === COMMON_NAMESPACE_IRIS.owl.versionIRI) {
      versionIris.set(subject, object);
    }
  }

  const ontologyIri = ontologySubjects.values().next().value || null;
  const importIri = ontologyIri ? (versionIris.get(ontologyIri) || ontologyIri) : null;

  return {
    ontologyIri,
    importIri
  };
}

/**
 * Helper function to pivot N3.js quads into the TOM grid row structure.
 * It groups triples by subject and maps predicates to known table columns.
 * @param {Array} quads - Array of quads from parseOntologyData.
 * @param {Array<string>} knownPredicates - Array of column headers (e.g., ["IRI", "rdfs:label", ...])
 * @returns {object} - An object { valid: true, cleanedRows: [...], errors: [] }
 */
function validateAndPivotOntologyData(quads, knownPredicates) {
  const subjectData = new Map();
  const errors = [];
  const axiomRecords = [];
  const customHeaders = (knownPredicates || []).slice(BASE_COLS);
  const customPredicatesByIndex = customHeaders.map((header) => curieToIri(header) || header);

  for (const q of quads || []) {
    if (!q?.subject?.value || isBlankNodeTerm(q.subject)) continue;

    const s = q.subject.value;
    const p = q.predicate.value;
    let o;

    if (q.object.termType === 'Literal') {
      const lang = q.object.language ? `@${q.object.language}` : '';
      const dt = q.object.datatype && q.object.datatype.value !== COMMON_NAMESPACE_IRIS.xsd.string
        ? `^^<${q.object.datatype.value}>` : '';
      o = `"${q.object.value}"${lang}${dt}`;
    } else if (isBlankNodeTerm(q.object)) {
      o = `_:${q.object.value}`;
    } else {
      o = `<${q.object.value}>`;
    }

    if (!subjectData.has(s)) subjectData.set(s, new Map());
    const pMap = subjectData.get(s);
    if (!pMap.has(p)) pMap.set(p, new Set());
    pMap.get(p).add(o);
  }

  const valueStringsForCustomColumn = (values) => {
    return (values || [])
      .map((value) => {
        const iriMatch = /^<([^>]+)>$/.exec(value);
        if (iriMatch) return iriMatch[1];
        if (value.startsWith('"')) return firstLiteral([value]);
        if (value.startsWith('_:')) return '';
        return value;
      })
      .filter(Boolean)
      .join(' ; ');
  };

  const cleanedRows = [];
  for (const [subjectUri, pMap] of subjectData.entries()) {
    if (!subjectUri || subjectUri.startsWith('_:')) continue;

    const rdfTypes = Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdf.type)?.values() || []);
    const hasType = iri => rdfTypes.includes(`<${iri}>`);
    if (hasType(COMMON_NAMESPACE_IRIS.owl.Ontology)) continue;

    let elementType = '';
    if (hasType(COMMON_NAMESPACE_IRIS.owl.Class)) elementType = 'Class';
    else if (hasType(COMMON_NAMESPACE_IRIS.owl.ObjectProperty)) elementType = 'ObjectProperty';
    else if (hasType(COMMON_NAMESPACE_IRIS.owl.DatatypeProperty)) elementType = 'DatatypeProperty';
    else if (hasType(COMMON_NAMESPACE_IRIS.owl.AnnotationProperty)) elementType = 'AnnotationProperty';
    else if (hasType(COMMON_NAMESPACE_IRIS.owl.NamedIndividual)) elementType = 'NamedIndividual';
    else {
      const classish = getSemanticRdfTypes(rdfTypes);
      if (classish.length) elementType = 'NamedIndividual';
    }

    const label = firstLiteral(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.label)?.values() || []));
    const definition = firstLiteral(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.skos.definition)?.values() || []));

    let isA = '';
    if (elementType === 'Class') {
      isA = iriFromObjects(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.subClassOf)?.values() || []));
    } else if (elementType === 'ObjectProperty' || elementType === 'DatatypeProperty' || elementType === 'AnnotationProperty') {
      isA = iriFromObjects(Array.from(pMap.get(COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf)?.values() || []));
    } else if (elementType === 'NamedIndividual') {
      const classish = getSemanticRdfTypes(rdfTypes);
      if (classish.length) isA = classish[0];
    }

    const curatedVals = Array.from(pMap.get(COMMON_NAMESPACE_IRIS.cco2.curatedIn)?.values() || []);
    const curatedIn = iriFromObjects(curatedVals) || firstLiteral(curatedVals);

    const newRow = new Array(knownPredicates.length).fill('');
    newRow[0] = subjectUri;
    newRow[1] = label;
    newRow[2] = elementType;
    newRow[3] = definition;
    newRow[4] = isA;
    newRow[5] = curatedIn;

    customPredicatesByIndex.forEach((predicateIri, idx) => {
      const values = Array.from(pMap.get(predicateIri)?.values() || []);
      newRow[BASE_COLS + idx] = valueStringsForCustomColumn(values);
    });

    cleanedRows.push(newRow);

    if (elementType === 'Class' && AxiomBuilder.extractClassAxioms) {
      const record = AxiomBuilder.extractClassAxioms(quads, {
        subjectIri: subjectUri,
        primaryIsA: isA,
        prefixes: iriPrefixes,
      });
      if (record.axioms?.length || record.rawRdf?.trim() || record.preservedTriples?.length) {
        axiomRecords.push(record);
      }
    }
  }

  if (cleanedRows.length === 0 && quads.length > 0) {
    errors.push("Data was parsed, but no named subjects matched the current table columns.");
  }

  return { valid: errors.length === 0, cleanedRows, errors, axiomRecords };
}

/**
 * Handles the Insert Data "Save" button click for ONTOLOGY data.
 * This function mirrors the structure of handleInsertDataSave.
 */
async function handleInsertOntologySave() {
  const selectedInsertMode = document.querySelector('input[name="insert-mode"]:checked')?.value;
  try {
    // Validate mode: only 'append' or 'replace'
    const insertMode = selectedInsertMode;
    if (!["append", "replace"].includes(insertMode)) {
      console.warn("Invalid insert mode:", insertMode);
      showToast("Invalid insert mode selected", "error");
      return;
    }

    if (!currentImportFile) {
      console.warn("No file selected");
      showToast("Please select a file before saving", "error");
      return;
    }

    // NOTE: The "hasHeader" checkbox is irrelevant for ontology data, so we skip it.

    // Get all current column headers and definitions
    const allHeaders = getColumnHeaders(); // already includes customs
    const allColumns = getColumnDefinitions();

    // The "known predicates" are all column headers.
    // We assume the first header is the Subject (e.g., "IRI").
    const knownPredicates = allHeaders;

    // --- REPLACED BLOCK ---
    // Instead of parsing a spreadsheet, parse the ontology file
    const quads = await parseOntologyData(currentImportFile);

    // Pivot the quads (S-P-O) into a tabular structure (Subject, Predicate1, Predicate2, ...)
    const result = validateAndPivotOntologyData(quads, knownPredicates);
    // --- END REPLACED BLOCK ---

    if (!result.valid) {
      console.warn("Validation failed", result.errors);
      // Use a modal or toast instead of alert() if possible
      showToast("Import failed:\n" + result.errors.join("\n"), "error");
      return;
    }
    
    if (result.cleanedRows.length === 0) {
        showToast("No new data found matching the current table columns.", "info");
        // Close modal and reset
        document.getElementById("insert-data-modal").style.display = "none";
        currentImportFile = null;
        resetFileInput();
        return;
    }

    // Merge clean data (this logic remains identical)
    const { mergedRows, stats } = mergeTableData(
      readCurrentTableRows(),
      result.cleanedRows,
      insertMode
    );
    mergeAxiomRecords(result.axiomRecords, { replace: insertMode === 'replace' });

    gridInstance.setSchema(allHeaders, allColumns);
    gridInstance.replaceRows(mergedRows, 'LoadData');
    harvestRowsIntoVocab?.(mergedRows);

    
    // Toast feedback (this logic remains identical)
    showToast(
      `${stats.appended} subjects loaded (${stats.total} total rows)`,
      "success"
    );

    // Close modal (this logic remains identical)
    document.getElementById("insert-data-modal").style.display = "none";
    currentImportFile = null;
    resetFileInput();

  } catch (error) {
    console.error("Import error:", error);
    showToast(`Error processing import: ${error.message}`, "error");
  }
}

/**
 * Primary save handler that delegates to the correct import function
 * based on the selected radio button.
 * * This should be called by your 'Save' button.
 */
async function handlePrimarySave() {
  // Use 'file-type' which matches your HTML
  const importType = document.querySelector('input[name="file-type"]:checked')?.value;

  try {
    if (importType === 'spreadsheet') {
      // Calls your existing function for CSV/XLSX
      await handleInsertDataSave(); 
    } else if (importType === 'ontology') {
      // Calls the new function for TTL, RDF, etc.
      await handleInsertOntologySave(); 
    } else {
      showToast("Please select a file type (Spreadsheet or Ontology)", "error");
    }
  } catch (error) {
    // This provides a top-level catch in case the individual
    // handlers fail in a way their own try/catch doesn't handle.
    console.error("Primary save handler error:", error);
    showToast("A critical error occurred during save.", "error");
  }
}

/**
 * Auto-selects the file-type radio button based on the file's extension
 * and shows/hides the header checkbox.
 * * Call this from your file drop/select handler, passing the file object.
 * e.g., autoSelectFileType(currentImportFile);
 *
 * @param {File} file The file that was just dropped or selected.
 */
function autoSelectFileType(file) {
  if (!file) return;

  const extension = getFilenameExtension(file.name);
  const detectedType = getInputKindForExtension(extension);
  const nextType = detectedType === 'ontology' ? 'ontology' : 'spreadsheet';
  document.querySelector(`input[name="file-type"][value="${nextType}"]`).checked = true;
  handleFileTypeChange();
}

function resetFileInput() {
  resetFileSelection();
}


/**
 * Validates parsed spreadsheet data structure and content.
 *
 * @param {string[][]} rows - 2D data array (without header row)
 * @param {string[]|null} header - Optional header row (null if no headers)
 * @param {string[]} knownPredicates - List of known header names (from UI)
 * @param {boolean} hasHeaderRow - Whether first row is a header
 * @returns {{
 *   valid: boolean,
 *   cleanedRows: string[][],
 *   ignoredColumns: string[],
 *   unmatchedHeaders: string[],
 *   errors: string[]
 * }}
 */
function validateTableData(rows, header, knownPredicates, hasHeaderRow) {
  console.info("[validateTableData] Validating structure");
  const errors = [];
  const cleanedRows = [];
  const unmatchedHeaders = [];
  const ignoredColumns = [];
  const activeSubjectHeader = getActiveViewKey() === VIEW_KEYS.RELATA ? 'subject' : 'iri';

  // Alias mapping to support variations in common headers
  const headerAliases = {
    "iri": activeSubjectHeader,
    "IRI": activeSubjectHeader,
    "id": activeSubjectHeader,
    "subject": activeSubjectHeader,
    "label": "label",
    "rdfs:label": "label",
    [COMMON_NAMESPACE_IRIS.rdfs.label]: "label",
    "element type": "element type",
    "type": "element type",
    "rdf:type": "element type",
    [COMMON_NAMESPACE_IRIS.rdf.type]: "element type",
    "definition": "definition",
    "skos:definition": "definition",
    [COMMON_NAMESPACE_IRIS.skos.definition]: "definition",
    "is a": "is a",
    "subclass of": "is a",
    "rdfs:subClassOf": "is a",
    [COMMON_NAMESPACE_IRIS.rdfs.subClassOf]: "is a",
    "subproperty of": "is a",
    "rdfs:subPropertyOf": "is a",
    [COMMON_NAMESPACE_IRIS.rdfs.subPropertyOf]: "is a",
    "is curated in": "is curated in",
    "is defined by": "is curated in",
    "is curated in ontology": "is curated in",
    "cco2:ont00001760": "is curated in",
    [COMMON_NAMESPACE_IRIS.cco2.curatedIn]: "is curated in",
    "has curation status": "has curation status",
    "obo:IAO_0000114": "has curation status",
    [COMMON_NAMESPACE_IRIS.iao.curationStatus]: "has curation status",
    "cco2:ont00001753": "acronym",
    [COMMON_NAMESPACE_IRIS.cco2.acronym]: "acronym",
    "cceo:acronym": "acronym"
    // Add more aliases as needed
  };

  try {
    // Normalize known headers
    const known = knownPredicates.map(h => h.toLowerCase().trim());

    // Map headers if present
    let mappedHeader = null;
    if (hasHeaderRow && header) {
      mappedHeader = header.map(h => {
        const key = h.toLowerCase().trim();
        return headerAliases[key] || key;
      });

      mappedHeader.forEach((h, i) => {
        if (!known.includes(h)) {
          ignoredColumns.push(header[i]); // store original for feedback
        }
      });

      if (ignoredColumns.length > 0) {
        console.warn("[validateTableData] Ignored columns:", ignoredColumns);
      }
    }

    // Validate parsed rows
    if (!rows || !Array.isArray(rows)) {
      console.error('[validateTableData] Invalid parsed input');
      return { valid: false, errors: ['File could not be parsed or is empty'] };
    }

    const expectedCols = BASE_COLS + getPredicateRegistry().length;

    rows.forEach((row, i) => {
      let cleanedRow;

      if (mappedHeader) {
        cleanedRow = new Array(expectedCols).fill("");
        mappedHeader.forEach((mappedName, sourceIndex) => {
          const targetIndex = known.indexOf(mappedName);
          if (targetIndex >= 0 && targetIndex < expectedCols) {
            cleanedRow[targetIndex] = row[sourceIndex] ?? "";
          }
        });
      } else {
        cleanedRow = row.slice(0, expectedCols); // Trim excess columns
        if (row.length < expectedCols) {
          console.info(`[validateTableData] Padding row ${i + 1} with empty cells`);
          while (cleanedRow.length < expectedCols) {
            cleanedRow.push("");
          }
        }
      }

      const typeValue = cleanedRow[2]; // Expecting "element type" column
      const validTypes = getElementTypes();
      if (typeValue && !validTypes.includes(typeValue)) {
        const msg2 = `Row ${i + 1} has invalid Element Type: "${typeValue}"`;
        console.warn(msg2);
        errors.push(msg2);
      }

      cleanedRows.push(cleanedRow);
    });

    return {
      valid: errors.length === 0,
      cleanedRows: cleanedRows,
      ignoredColumns: ignoredColumns,
      unmatchedHeaders: ignoredColumns, // for now same
      errors: errors
    };
  } catch (e) {
    console.error("[validateTableData] Validation failed:", e);
    return {
      valid: false,
      cleanedRows: [],
      ignoredColumns: [],
      unmatchedHeaders: [],
      errors: [e.message]
    };
  }
}


/**
 * Merges cleaned spreadsheet data into the current table data.
 *
 * @param {string[][]} currentRows - Existing grid data rows.
 * @param {string[][]} newRows - New validated rows
 * @param {'append'|'replace'} mode - How to insert data
 * @returns {{ mergedRows: string[][], stats: { original: number, appended: number, total: number } }}
 */
function mergeTableData(currentRows, newRows, mode) {
  console.info("[mergeTableData] Mode:", mode);
  try {
    let mergedRows = [];

    if (mode === 'replace') {
      mergedRows = newRows;
      console.info(`[mergeTableData] Replacing all ${currentRows.length} rows with ${newRows.length} new rows.`);
    } else if (mode === 'append') {
      mergedRows = currentRows.concat(newRows);
      console.info(`[mergeTableData] Appending ${newRows.length} rows to existing ${currentRows.length} rows.`);
    } else {
      console.warn("[mergeTableData] Unknown mode. Defaulting to append.");
      mergedRows = currentRows.concat(newRows);
    }

    const stats = {
      original: currentRows.length,
      appended: newRows.length,
      total: mergedRows.length
    };

    console.info("[mergeTableData] Merge complete:", stats);
    return { mergedRows, stats };

  } catch (e) {
    console.error("[mergeTableData] Merge failed:", e);
    return {
      mergedRows: currentRows,
      stats: { original: currentRows.length, appended: 0, total: currentRows.length }
    };
  }
}

// DOM HANDLERS
// DOM HANDLERS
// DOM HANDLERS
// DOM HANDLERS

/**
 * Displays a toast notification.
 * @param {*} message 
 * @param {*} type 
 * @param {*} duration 
 */
function showToast(message, type = "success", duration = 3000) {
  try {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");

    toast.classList.add("toast", type);
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 200);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => container.removeChild(toast), 1000);
    }, duration);
  } catch (error) {
    console.error("Toast error:", error);
  }
}

// Attach event listener to the "Save to Database" button
document.getElementById('saveToDatabaseBtn').addEventListener('click', storeTomWorkspaceProjectState);

// Ontology settings modal open/close/save
document.getElementById('ontologySettingsModalSaveSettingsBtn').addEventListener('click', saveOntologySettingsFromModal);
document.getElementById('ontologySettingsModalCancelSettingsBtn').addEventListener('click', () => {
  document.getElementById('ontology-settings-modal').style.display='none'});
document.getElementById('ontologySettingsModalResetSessionBtn').addEventListener('click', () => {
  console.log('IndexedDB have been cleared!');
  document.getElementById('ontology-settings-modal').style.display='none';
});
document.getElementById('backfillIRIsBtn').addEventListener('click', backfillIris);

// Ontology imports modal open/close/save
document.getElementById('importSettingsModalAddOntologyBtn').addEventListener('click', addImportIRI);
document.getElementById('importSettingsModalSaveSettingsBtn').addEventListener('click', saveImportsAndClose);
document.getElementById('importSettingsModalCancelSettingsBtn').addEventListener('click', () => {
  document.getElementById('ontology-imports-modal').style.display='none'});

// Predicate settings modal open/close/add
document.getElementById('predicateSettingsModalAddPredicateBtn').addEventListener('click', confirmAddPredicate);


// Optional: what happens when the user clicks "Reload Prior Session"
document.getElementById('reloadSavedSessionBtn')?.addEventListener('click', reloadSavedSession);

// Prefix Manager Logic. This set of functions handle the prefixes

/**
 * Opens the prefix manager modal and populates the table with current prefixes
 */
function openPrefixManagerModal() {
  try {
    populatePrefixTable();
    document.getElementById("prefix-manager-modal").style.display = "block";
  } catch (err) {
    console.error("[openPrefixManagerModal] Failed to populate prefix table:", err);
    showToast("Failed to open prefix manager", "error");
  }
}


// Hide Prefix Manager modal
function hidePrefixManagerModal() {
  document.getElementById('prefix-manager-modal').style.display = 'none';
}

// Populate the prefix table
function populatePrefixTable() {
  const tableBody = document.querySelector('#prefix-table tbody');
  tableBody.innerHTML = '';

  Object.entries(iriPrefixes).forEach(([prefix, iri]) => {
    const row = document.createElement('tr');
    row.classList.add('prefix-table-cell');

    const prefixCell = document.createElement('td');
    prefixCell.textContent = prefix;

    const iriCell = document.createElement('td');
    iriCell.textContent = iri;

    const removeCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'X';
    Object.assign(removeBtn.style, {
        paddingLeft: "5px",
        paddingRight: "5px",
        paddingTop: "0px",
        paddingBottom: "0px"
    });

    removeBtn.onclick = () => {
      delete iriPrefixes[prefix];
      populatePrefixTable();
    };
    removeCell.appendChild(removeBtn);

    row.appendChild(prefixCell);
    row.appendChild(iriCell);
    row.appendChild(removeCell);
    tableBody.appendChild(row);
  });
}

// Enable add button only if both inputs are filled
function handlePrefixInputChange() {
  const prefix = document.getElementById('new-prefix').value.trim();
  const iri = document.getElementById('new-prefix-iri').value.trim();
  const addBtn = document.getElementById('add-prefix-btn');
  addBtn.disabled = !(prefix && iri);
}

// Add new prefix
function handleAddPrefix() {
  const rawPrefix = document.getElementById('new-prefix').value.trim();
  const rawIri = document.getElementById('new-prefix-iri').value.trim();

  if (!rawPrefix || !rawIri) return;

  const normalized = normalizePrefixMap({ [rawPrefix]: rawIri });
  const [[prefix, iri] = []] = Object.entries(normalized.prefixes);
  if (!prefix || !iri) {
    alert(normalized.warnings[0] || 'Prefix must be a valid Turtle prefix and IRI must be absolute.');
    return;
  }
  if (iriPrefixes[prefix]) {
    alert('Prefix already exists!');
    return;
  }

  iriPrefixes[prefix] = iri;
  document.getElementById('new-prefix').value = '';
  document.getElementById('new-prefix-iri').value = '';
  document.getElementById('add-prefix-btn').disabled = true;

  populatePrefixTable();
}

// Save prefixes and close modal
function savePrefixesAndClose() {
  console.info('[prefix-manager] Prefixes saved:', iriPrefixes);
  hidePrefixManagerModal();
}

// Cancel and close without saving (no rollback necessary for in-memory edit)
function cancelPrefixesModal() {
  hidePrefixManagerModal();
}


// Ontology Imports Logic
function getImportsMap() {
  const settings = getOntologySettings();
  // local cache lives here
  settings.owlImportsLocal = settings.owlImportsLocal || {};
  return settings.owlImportsLocal;
}

// Check if a local import exists for the given IRI
function hasLocalImport(iri) {
  return !!getImportsMap()[iri]?.content;
}

// Save local import content for a given IRI
async function setLocalImport(iri, { content, mediaType }) {
  const settings = getOntologySettings();

  // Ensure owl:imports list exists and includes the IRI
  settings[COMMON_NAMESPACE_IRIS.owl.imports] = settings[COMMON_NAMESPACE_IRIS.owl.imports] || [];
  if (!settings[COMMON_NAMESPACE_IRIS.owl.imports].includes(iri)) {
    settings[COMMON_NAMESPACE_IRIS.owl.imports].push(iri);
  }

  // Store local cache under a separate key
  settings.owlImportsLocal = settings.owlImportsLocal || {};
  settings.owlImportsLocal[iri] = {
    content,
    mediaType: mediaType || guessRdfMimeTypeFromText(content),
    updatedAt: new Date().toISOString(),
  };

  await saveOntologySettings(settings);
}

function fileNameForMediaType(mediaType) {
  const preferredExtension = getPreferredExtensionForMimeType(mediaType);
  if (preferredExtension && preferredExtension.ok) return `import.${preferredExtension.value}`;
  return 'import.ttl';
}

async function cacheImportedOntology({ iri, ontologyIri, content, mediaType, quads }) {
  const settings = getOntologySettings();
  settings[COMMON_NAMESPACE_IRIS.owl.imports] = settings[COMMON_NAMESPACE_IRIS.owl.imports] || [];
  if (!settings[COMMON_NAMESPACE_IRIS.owl.imports].includes(iri)) {
    settings[COMMON_NAMESPACE_IRIS.owl.imports].push(iri);
  }

  settings.owlImportsLocal = settings.owlImportsLocal || {};
  settings.owlImportsLocal[iri] = {
    content,
    mediaType,
    ontologyIri: ontologyIri || iri,
    updatedAt: new Date().toISOString()
  };

  addToVocabIndex(extractOntologyVocabEntries(quads, 'Imported Ontology'), 'Imported Ontology');
  await saveOntologySettings(settings);
}

async function processOntologyImportFile(file, fallbackIri = null) {
  const content = await file.text();
  const detected = getSupportedMimeTypeForFilename(file.name);
  const mediaType = detected && detected.ok && detected.value.category === 'rdf'
    ? detected.value.mimeType
    : guessRdfMimeTypeFromText(content);
  const quads = await parseOntologyText(content, file.name);
  const derived = deriveOntologyImportTarget(quads);
  const targetIri = derived.importIri || fallbackIri;

  if (!targetIri) {
    throw new Error('Could not determine an import IRI from owl:versionIRI or the ontology IRI.');
  }

  await cacheImportedOntology({
    iri: targetIri,
    ontologyIri: derived.ontologyIri,
    content,
    mediaType,
    quads
  });

  return {
    iri: targetIri,
    ontologyIri: derived.ontologyIri,
    mediaType
  };
}

// This function opens the ontology imports modal and populates it with current imports.
// It retrieves the imports from the ontology settings and displays them with their status.
async function openImportsModal() {
  const modal = document.getElementById("ontology-imports-modal");
  const listContainer = document.getElementById("import-list");
  listContainer.innerHTML = "";

  // ensure cache is loaded
  const settings = getOntologySettings();
  const imports = settings[COMMON_NAMESPACE_IRIS.owl.imports] || [];
  const importsMap = getImportsMap();

  imports.forEach((iri) => {
    const loaded = !!importsMap[iri]?.content;
    const statusIcon = loaded ? "[loaded]" : "[missing]";
    const row = document.createElement("div");
    row.style.marginBottom = "10px";

    const safeKey = btoa(iri).replace(/=/g, "");
    row.innerHTML = `
      <div>
        <strong>${iri}</strong> ${statusIcon}
        <div style="margin-top:6px">
          <input type="file" id="file-${safeKey}">
          <span id="validation-${safeKey}" style="color:red; display:none;"></span>
        </div>
        ${loaded ? `<div style="color:#666; font-size:12px; margin-top:4px">
          Stored ${importsMap[iri].mediaType || ""} at ${importsMap[iri].updatedAt}
        </div>` : ""}
      </div>
    `;

    // wire up handler
    row.querySelector(`#file-${safeKey}`).addEventListener("change", (ev) => {
      handleImportFileUpload(ev, iri);
    });

    listContainer.appendChild(row);
  });

  modal.style.display = "block";
}


// This function handles the file upload for ontology imports.
async function handleImportFileUpload(event, iri) {
  const file = event.target.files?.[0];
  if (!file) return;

  const safeKey = btoa(iri).replace(/=/g, "");
  const validationMsg = document.getElementById(`validation-${safeKey}`);
  try {
    const result = await processOntologyImportFile(file, iri);
    validationMsg.style.display = "none";
    showToast(`Ontology import saved as ${result.iri}`, "success");
    openImportsModal();
  } catch (error) {
    validationMsg.textContent = error.message;
    validationMsg.style.display = "inline";
  }
}

// This function retrieves the local import content for a given IRI from the ontology settings.
function getLocalImportContent(iri) {
  const s = getOntologySettings();
  return s.owlImportsLocal?.[iri]?.content || null;
}

// This function adds a new import IRI to the ontology settings.
async function addImportIRI() {
  const iriInput = document.getElementById("new-import-iri");
  const iri = iriInput.value.trim();
  if (!iri) return;

  const settings = getOntologySettings();
  settings[COMMON_NAMESPACE_IRIS.owl.imports] = settings[COMMON_NAMESPACE_IRIS.owl.imports] || [];
  if (!settings[COMMON_NAMESPACE_IRIS.owl.imports].includes(iri)) {
    settings[COMMON_NAMESPACE_IRIS.owl.imports].push(iri);
    await saveOntologySettings(settings);
  }

  iriInput.value = "";
  openImportsModal();
}

async function handleNewImportFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const result = await processOntologyImportFile(file);
    showToast(`Ontology import saved as ${result.iri}`, 'success');
    openImportsModal();
  } catch (error) {
    console.error('[imports] Failed to add ontology file', error);
    showToast(`Import failed: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

async function rehydrateImportedOntologies() {
  const importsMap = getImportsMap();
  for (const record of Object.values(importsMap)) {
    if (!record?.content) continue;
    try {
      const quads = await parseOntologyText(record.content, fileNameForMediaType(record.mediaType));
      addToVocabIndex(extractOntologyVocabEntries(quads, 'Imported Ontology'), 'Imported Ontology');
    } catch (error) {
      console.warn('[imports] Failed to rehydrate cached import', error);
    }
  }
}

// This function saves the ontology imports and closes the modal.
function saveImportsAndClose() {
  document.getElementById("ontology-imports-modal").style.display = "none";
}

// Listeners for adding rows
document.getElementById("add-rows-btn").addEventListener("click", () => {
  const n = getRowCountInput();
  if (!n) { showToast("Enter a valid row count.", "error"); return; }
  addRowsToTable(n);
  showToast(`${n} row${n>1?'s':''} added`, "success");
});

// Listeners for removing rows
document.getElementById("remove-rows-btn").addEventListener("click", () => {
  const n = getRowCountInput();
  if (!n) { showToast("Enter a valid row count.", "error"); return; }
  removeRowsFromBottom(n);
  showToast(`${n} row${n>1?'s':''} removed`, "info");
});

// Save predicate management settings from modal
// Called by 'Save' button in Manage Predicates modal
async function saveManagePredicates() {
  try {
    // Persist the in-memory predicateValueModes map
    await savePredicateValueModes();

    showToast('Predicate value modes saved', 'success');
    document.getElementById('manage-predicates-modal').style.display = 'none';
  } catch (e) {
    console.error('[ManagePredicates] saveManagePredicates failed', e);
    showToast('Failed to save predicate value modes', 'error');
  }
}

// Save button listener for Manage Predicates modal
document.getElementById('manage-predicates-save-btn').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    await saveManagePredicates(); // handles toast + closing
  } finally {
    btn.disabled = false;
  }
});

// Cancel button listener for Manage Predicates modal
document.getElementById('manage-predicates-cancel-btn').addEventListener('click', () => {
    document.getElementById('manage-predicates-modal').style.display = 'none';
});

document.getElementById('axiomBuilderDrawerCloseBtn')?.addEventListener('click', closeAxiomBuilderDrawer);
document.getElementById('axiom-builder-backdrop')?.addEventListener('click', closeAxiomBuilderDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAxiomBuilderDrawer();
});

/**
 * Registers all modal UI event listeners
 */

// Event Listeners for Ontology Settings Management
document.getElementById("ontologySettingsBtn").addEventListener("click", openOntologySettingsModal);
document.getElementById("ontology-base-iri-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-label-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-creator-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-description-input").addEventListener("input", updateOntologyPreview);
document.getElementById("opaque-leading").addEventListener("input", updateOntologyPreview);
document.getElementById("opaque-digits").addEventListener("input", updateOntologyPreview);
document.getElementById("opaque-start").addEventListener("input", updateOntologyPreview);
document.getElementById("readable-case").addEventListener("change", updateOntologyPreview);
document.querySelectorAll('input[name="base-iri-delimiter"]').forEach(radio => {
  radio.addEventListener("change", updateOntologyPreview);
});
initializeIriModeToggles();
document.querySelectorAll('input[name="iri-mode"]').forEach(radio => {
  radio.addEventListener("change", updateOntologyPreview);
});

// Event Listeners for Prefix Management
function initializePrefixManagerListeners() {
  document.getElementById('new-prefix').addEventListener('input', handlePrefixInputChange);
  document.getElementById('new-prefix-iri').addEventListener('input', handlePrefixInputChange);
  document.getElementById('add-prefix-btn').addEventListener('click', handleAddPrefix);
  document.getElementById('save-prefixes-btn').addEventListener('click', savePrefixesAndClose);
  document.getElementById('cancel-prefixes-btn').addEventListener('click', cancelPrefixesModal);
}

initializePrefixManagerListeners();

// Event Listeners for Import Management
document.getElementById("ontologyImportsBtn").addEventListener("click", openImportsModal);
document.getElementById("new-import-file").addEventListener("change", handleNewImportFileSelection);

// Event Listeners for Predicate Management
document.getElementById('managePredicatesBtn').addEventListener('click', () => {
  openManagePredicatesModal();
});
document.getElementById('predicate-iri')?.addEventListener('input', updatePredicateIriSuggestions);
document.getElementById('predicate-iri')?.addEventListener('focus', updatePredicateIriSuggestions);

document.querySelectorAll('[data-view-switch]').forEach((button) => {
  button.addEventListener('click', () => {
    switchView(button.dataset.viewSwitch);
  });
});

// Event Listener for Prefix Manager Button
document.getElementById('managePrefixesBtn').addEventListener("click", function () {
  openPrefixManagerModal();
});

// Event Listeners for Insert Data Modal
function setupInsertDataModalListeners() {
  // Open/close buttons
  document.getElementById("importBtn").addEventListener("click", openInsertDataModal);
  document.getElementById('file-input').addEventListener('change', handleFileInputChange);
  document.getElementById("insert-data-save-btn").addEventListener("click", handlePrimarySave);
  document.getElementById("insert-data-cancel-btn").addEventListener("click", closeInsertDataModal);
  document.getElementById("remove-file-btn").addEventListener("click", resetFileSelection);

  // File input
  document.getElementById("file-input").addEventListener("change", handleFileInputChange);

  // Drag and drop
  var dropArea = document.getElementById("drop-area");
  ["dragenter", "dragover", "dragleave", "drop"].forEach(function(eventName) {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });
  dropArea.addEventListener("drop", handleFileDrop);

  // File type change
  var radios = document.querySelectorAll('input[name="file-type"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener("change", handleFileTypeChange);
  }};


document.getElementById('previewRdfBtn').addEventListener('click', () => handleExport(false));
document.getElementById('exportBtn').addEventListener('click', () => handleExport(true));

console.info("[Init] Calling setupInsertDataModalListeners()");
setupInsertDataModalListeners();

function populateSettingsUi() {
  const s = getOntologySettings();
  document.getElementById('ontology-label-input').value = s[COMMON_NAMESPACE_IRIS.rdfs.label] || '';
  document.getElementById('ontology-creator-input').value = s[COMMON_NAMESPACE_IRIS.dcterms.creator] || '';
  document.getElementById('ontology-description-input').value = s[COMMON_NAMESPACE_IRIS.dcterms.description] || '';
  document.getElementById('ontology-base-iri-input').value = s.base || '';

  const delimiterRadio = document.querySelector(`input[name="base-iri-delimiter"][value="${s.delimiter || '/'}"]`);
  if (delimiterRadio) delimiterRadio.checked = true;

  const iriModeRadio = document.querySelector(`input[name="iri-mode"][value="${s.iriMode || 'opaque'}"]`);
  if (iriModeRadio) iriModeRadio.checked = true;

  document.getElementById('opaque-leading').value = s.opaqueLeading || 'ont';
  document.getElementById('opaque-digits').value = s.opaqueDigits || 6;
  document.getElementById('opaque-start').value = s.opaqueStart || 1;
  document.getElementById('readable-case').value = s.readableCase || 'PascalCase';
  toggleIriModeOptions();
  updateOntologyPreview();
}

async function bootstrapApp() {
  await settingsLoad();
  await rehydrateImportedOntologies();
  initializeOntologyGrid();
  populateSettingsUi();
  setIsCuratedInForAllRows();
  updateReloadSessionButton();
  handleFileTypeChange();
}

TOM.Core = {
  bootstrap: bootstrapApp,
  getGridInstance: () => gridInstance,
  getCustomPredicates: () => getCustomPredicateIris(),
  getPredicateRegistry: () => getPredicateRegistry().map((record) => ({ ...record })),
  getActiveView: () => getActiveViewKey(),
  getOntologySettings,
  settingsLoad,
  showToast,
  openInsertDataModal,
  closeInsertDataModal,
  openOntologySettingsModal,
  openImportsModal,
  openPrefixManagerModal,
  openAxiomBuilderDrawer,
  getAxiomRecord,
  setAxiomRecord,
  confirmAddPredicate,
  saveOntologySettingsFromModal,
  storeTomWorkspaceProjectState,
  reloadSavedSession,
  handlePrimarySave,
  handleExport,
  addRowsToTable,
  removeRowsFromBottom,
  switchView,
};
})();
