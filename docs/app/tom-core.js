// Copyright 2025 Jonathan Vajda
(function () {
const TOM = (window.TOM = window.TOM || {});

let customPredicates = [];
let hotInstance = null;
let hotInitDone = false;
let currentImportFile = null;

// Base spreadsheet columns (in order):
// 0: iri, 1: label, 2: element type, 3: definition, 4: is a, 5: is curated in ontology
const BASE_COLS = 6;

const container = document.getElementById('hot');
const output = document.getElementById('rdfOutput');

// --- Constants so you can rename easily ---
const DB_NAME = 'TabularOntologyDB';
const DB_VERSION = 1;
const STORE_NAME = 'rdfStore';
let SETTINGS_CACHE = null;
const SETTINGS_STORE = 'ontologySettingsStore';

// Global prefix store (prepopulated)
const iriPrefixes = {
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  obo: 'http://purl.obolibrary.org/obo/',
  oboInOwl: 'http://www.geneontology.org/formats/oboInOwl#',
  cco2: 'https://www.commoncoreontologies.org/',
  cceo: 'http://www.ontologyrepository.com/CommonCoreOntologies/',
  ex: 'http://example.org/'
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

const w3cIRI = {
  RDF_TYPE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  RDFS_LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
  RDFS_SUBCLASS: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
  RDFS_SUBPROP: 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf',
  OWL_ONTOLOGY: 'http://www.w3.org/2002/07/owl#Ontology',
  OWL_CLASS: 'http://www.w3.org/2002/07/owl#Class',
  OWL_NAMEDIND: 'http://www.w3.org/2002/07/owl#NamedIndividual',
  OWL_OBJPROP: 'http://www.w3.org/2002/07/owl#ObjectProperty',
  OWL_DATAPROP: 'http://www.w3.org/2002/07/owl#DataProperty',
  OWL_ANNOPROP: 'http://www.w3.org/2002/07/owl#AnnotationProperty',
  OWL_DATATYPE: 'http://www.w3.org/2002/07/owl#DatatypeProperty',
  OWL_IMPORTS: 'http://www.w3.org/2002/07/owl#imports',
  SKOS_DEFINITION: 'http://www.w3.org/2004/02/skos/core#definition',
  CCO_CURATEDIN: 'https://www.commoncoreontologies.org/ont00001760',
  DCTERMS_CREATOR: 'http://purl.org/dc/terms/creator',
  DCTERMS_CREATED: 'http://purl.org/dc/terms/created',
  DCTERMS_DESCRIPTION: 'http://purl.org/dc/terms/description',
  DCTERMS_CITATION: 'http://purl.org/dc/terms/bibliographicCitation',
  OBO_CURATION_STATUS: 'http://purl.obolibrary.org/obo/IAO_0000114',
};

const getIsAPredicate = (elementType) => {
  console.info('getIsAPredicate happened');
  switch (elementType) {
    case 'Class':
      return w3cIRI.RDFS_SUBCLASS ;
    case 'ObjectProperty':
    case 'DatatypeProperty':
    case 'AnnotationProperty':
      return w3cIRI.RDFS_SUBPROP;
    case 'NamedIndividual':
      return w3cIRI.RDF_TYPE;
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

// Read from IDB (or create defaults) and cache
async function settingsLoad() {
  const db = await ensureDb();
  const tx = db.transaction(SETTINGS_STORE, 'readonly');
  const rec = await idbRequest(tx.objectStore(SETTINGS_STORE).get('ontologySettings'));

  if (rec && rec.value) {
    SETTINGS_CACHE = rec.value;
    return SETTINGS_CACHE;
  }

  // No record: create defaults and persist once
  SETTINGS_CACHE = generateOntologySettings();
  const wtx = db.transaction(SETTINGS_STORE, 'readwrite');
  wtx.objectStore(SETTINGS_STORE).put({ key: 'ontologySettings', value: SETTINGS_CACHE, updatedAt: new Date().toISOString() });
  await idbTransactionDone(wtx);
  return SETTINGS_CACHE;
}

// Save to IDB and cache
async function saveOntologySettings(next) {
  SETTINGS_CACHE = next;
  const db = await ensureDb();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  tx.objectStore(SETTINGS_STORE).put({ key: 'ontologySettings', value: SETTINGS_CACHE, updatedAt: new Date().toISOString() });
  await idbTransactionDone(tx);
  showToast('Ontology settings saved to database.', 'success');
}

// Synchronous accessor *after* settingsLoad() has run
function getOntologySettings() {
  if (!SETTINGS_CACHE) {
    console.warn('[getOntologySettings] Cache empty — did you await settingsLoad() during init?');
    // Last-resort fallback to keep UI from crashing:
    return generateOntologySettings();
  }
  return SETTINGS_CACHE;
}

// === Predicate Value Modes =====================================
// Store per-predicate value mode: 'iri' | 'literal' (default inferred)
function getPredicateValueModes() {
  const s = getOntologySettings();
  s.predicateValueModes = s.predicateValueModes || {};
  return s.predicateValueModes;
}
function getPredicateValueMode(iri) {
  const m = getPredicateValueModes();
  return m[iri] || null; // null => not set
}
function setPredicateValueMode(iri, mode) {
  const s = getOntologySettings();
  s.predicateValueModes = s.predicateValueModes || {};
  s.predicateValueModes[iri] = mode; // 'iri' | 'literal'
}
async function savePredicateValueModes() {
  await saveOntologySettings(getOntologySettings());
}
// A tiny default heuristic for new predicates (tweak later if you like)
function defaultModeForPredicate(iri) {
  // simple heuristic: assume object-like if ends with '#...Property' or contains 'sameAs'
  if (/#.+Property$/.test(iri) || /sameAs$/i.test(iri)) return 'iri';
  return 'literal';
}


function getSelectedDelimiter() {
  const selected = document.querySelector('input[name="base-iri-delimiter"]:checked');
  return selected ? selected.value : "/";
}

function updateOntologyPreview() {
  try {
    const base = (document.getElementById("ontology-base-iri-input").value || '').trim() || 'http://example.org';
    const label = (document.getElementById("ontology-label-input").value || '').trim() || 'Example Ontology';
    const delimiter = getSelectedDelimiter();
    const { year, month, day } = getCurrentDateParts();
    const normalizedLabel = toPascalCase(label);

    document.getElementById("version-iri-preview").textContent =
      `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`;
    document.getElementById("version-info-preview").textContent = `${year}-${month}-${day}`;
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
  const { year, month, day } = getCurrentDateParts();
  const normalizedLabel = toPascalCase(label);

  const settings = {
    iri: `${base}${delimiter}${normalizedLabel}`,
    "http://www.w3.org/2002/07/owl#versionIRI": `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`,
    "http://www.w3.org/2002/07/owl#versionInfo": `${year}-${month}-${day}`,
    "http://www.w3.org/2000/01/rdf-schema#label": label,
    "http://purl.org/dc/terms/creator": creator,
    "http://purl.org/dc/terms/description": description,

    // NEW:
    iriMode,
    opaqueLeading,
    opaqueDigits,
    opaqueStart,
    readableCase,
    delimiter,     // keep delimiter explicitly too
    base           // store base, handy later
  };
  return settings;
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
  document.getElementById("ontology-label-input").value = s[w3cIRI.RDFS_LABEL] || "";
  document.getElementById("ontology-creator-input").value = s[w3cIRI.DCTERMS_CREATOR] || "";
  document.getElementById("ontology-description-input").value = s[w3cIRI.DCTERMS_DESCRIPTION] || "";
  toggleIriModeOptions();   // <- ensure sections reflect the currently checked mode
  document.getElementById("ontology-settings-modal").style.display = "block";
  updateOntologyPreview();

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

function toSnakeCase(str) {
  return String(str || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function fromLabelWithCase(label, caseStyle) {
  const raw = String(label || '').trim();
  switch (caseStyle) {
    case 'camelCase':   return toCamelCase(raw);
    case 'snake_case':  return toSnakeCase(raw);
    case 'PascalCase':
    default:            return toPascalCase(raw);
  }
}

// Returns { base, delimiter } where base excludes trailing delimiter
function getBaseAndDelimiter(settings) {
  const base = (settings.base || '').replace(/[\/#]+$/,'') || 'http://example.org';
  const delimiter = settings.delimiter || '/';
  return { base, delimiter };
}


// Scan current HOT for largest opaque number already used
function findMaxOpaqueNumber(hot, settings) {
  const { base, delimiter } = getBaseAndDelimiter(settings);
  const lead = settings.opaqueLeading || 'ont';
  const digits = Math.max(1, settings.opaqueDigits || 6);

  const iriPrefix = `${base}${delimiter}${lead}`;
  const re = new RegExp('^' + iriPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d{' + digits + '})$');

  let max = (settings.opaqueStart ? settings.opaqueStart - 1 : 0);
  const rows = hot.getData();
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



// Gets the columns definitions for the Handsontable instance.
const getColumnDefinitions = () => {
  return [
    { type: 'text' }, // IRI
    { type: 'text' }, // Label
    {
      type: 'dropdown',
      source: getElementTypes(),
      strict: true,
      allowInvalid: false
    },                // Element Type
    { type: 'text' }, // Definition
    {
      // "Is A" with smart lookup
      editor: 'autocomplete',
      strict: false,
      filter: false,
      allowInvalid: true,
      source: function (query, callback) {
        try {
          // infer type constraints from the row's Element Type
          const row = this.row;
          const elType = hotInstance.getDataAtCell(row, 2); // "element type"
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
    { type: 'text' }, // is curated in ontology
  ];
};


const getInitialData = () => {
  console.info('getInitialData happened');
  return [
    ["http://example.org/ont000001", "Doctor", "Class", "A human person who has earned a doctorate.", "cco2:ont00001017", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000002", "Bob", "NamedIndividual", "An instance of a Person.", "cco2:ont00001262", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000003", "has vehicle", "ObjectProperty", "x hasVehicle y iff x possesses y and y is a Vehicle.", "ex:Owns", "http://example.org/ExampleOntology"],
    ["http://example.org/ont000004", "Automobile", "Class", "A ground vehicle that is designed to transport passengers.", "cco2:ont00000618", "http://example.org/ExampleOntology"],
    ["", "", "", "", "", ""]
];
};

// Gets the column headers for the Handsontable instance.  
const getColumnHeaders = () => {
  console.info('getColumnHeaders happened');
  return ["iri", "label", "element type", "definition", "is a", "is curated in ontology"].concat(customPredicates);
};

// Creates a Handsontable instance in the given container with the provided data and column definitions.
const createTable = (container, data, colHeaders, columns) => {
  console.info('createTable happened');
  return TOM.Grid.createGrid(container, {
    
    data,
    colHeaders,
    columns,

    // inject validator for first column across all rows
    cells: (row, col) => {
      const cellProps = {};

      // your existing per-column logic…

      // For custom predicate columns, enforce IRI vs literal
      if (col >= BASE_COLS) {
        const predIri = customPredicates[col - BASE_COLS];
        const mode = getPredicateValueMode(predIri) || defaultModeForPredicate(predIri);

        if (mode === 'iri') {
          // basic validator: must resolve to IRI (absolute or CURIE)
          cellProps.validator = (value, cb) => {
            if (value == null || String(value).trim() === '') return cb(true); // allow empty
            const v = String(value).trim();
            // already <IRI>
            if (/^<[^>\s]+>$/.test(v)) return cb(true);
            // absolute IRI
            if (/^https?:\/\/\S+$/i.test(v)) return cb(true);
            // curie
            if (/^[A-Za-z][\w-]*:[\w.-]+$/.test(v) && curieToIri(v)) return cb(true);
            cb(false);
          };
          // Optionally a nice tooltip:
          cellProps.allowInvalid = false;
        } else {
          // 'literal' — no special validator (or add your own literal constraints)
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

      if (colIndex >= BASE_COLS) {
        const predIri = customPredicates[colIndex - BASE_COLS];
        const mode = getPredicateValueMode(predIri) || defaultModeForPredicate(predIri);

        if (mode === 'iri') {
          if (value == null || String(value).trim() === '') return true;
          const v = String(value).trim();
          if (/^<[^>\s]+>$/.test(v)) return true;
          if (/^https?:\/\/\S+$/i.test(v)) return true;
          if (/^[A-Za-z][\w-]*:[\w.-]+$/.test(v) && curieToIri(v)) return true;
          return false;
        }
      }

      return true;
    }
    
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

  const headers = hotInstance.getColHeader();
  const columnIndex = headers.indexOf("is curated in ontology");

  if (columnIndex === -1) {
    console.warn("[setIsCuratedInForAllRows] 'cco2:ont00001760' column not found in table");
    return;
  }

  const totalRows = hotInstance.countRows();
  let updatedCount = 0;

  for (let row = 0; row < totalRows; row++) {
    const currentValue = hotInstance.getDataAtCell(row, columnIndex);
    if (currentValue === null || currentValue === "") {
      hotInstance.setDataAtCell(row, columnIndex, ontologyIRI);
      updatedCount++;
    }
  }

  console.info(`[setIsCuratedInForAllRows] Set for ${updatedCount} of ${totalRows} rows (only empty cells updated)`);
}

/**
 * Initialize Handsontable once
 */
function initHandsontable() {
  if (hotInitDone) return;
  if (hotInstance) { try { hotInstance.destroy(); } catch (_) {} }

  // 1) Build rows/schema
  const rows     = getInitialData();
  const headers  = getColumnHeaders();
  const columns  = getColumnDefinitions();
  const settings = getOntologySettings(); // IndexedDB-backed cache

  // 2) Create HOT using 4-arg createTable
  hotInstance = createTable(container, rows, headers, columns);
  attachHotHooks?.();

  // 3) Finish init
  harvestRowsIntoVocab?.(rows);
  hotInitDone = true;
}


// This function checks if the element type is a predicate
window.getIsAPredicateForRow = (rowIndex) => {
  const row = hotInstance.getSourceDataAtRow(rowIndex);
  const elementType = row ? row[2] : null;
  return getIsAPredicate(elementType);
};

// This set of functions are used for outputting RDF.
// getOntologyIRI retrieves the ontology IRI or returns a default value.
// generateRdfString takes the rows of the Handsontable instance and converts them into an RDF string in the specified format.
// handleExport generates the file

function getOntologyIRI() {
  const settings = getOntologySettings();
  return settings.iri || "http://example.org/ExampleOntology";
}

/**
 * Generates an RDF string from the given rows in the specified format.
 * @param {*} rows
 * @param {*} format 
 * @returns 
 */
async function generateRdfString (rows, format = 'ttl') {
  console.info('generateRdfString happened');
  const formatMap = {
    ttl: 'Turtle',
    rdf: 'RDF/XML',
    jsonld: 'JSON-LD',
    nt: 'N-Triples',
    trig: 'TriG'
  };
  const writer = new N3.Writer({ prefixes: iriPrefixes, format: formatMap[format] || 'Turtle' });

  const settings = getOntologySettings();
  const ontologyIRI = settings["iri"];

  writer.addQuad(
    N3.DataFactory.namedNode(ontologyIRI),
    N3.DataFactory.namedNode(w3cIRI.RDF_TYPE),
    N3.DataFactory.namedNode(w3cIRI.OWL_ONTOLOGY)
  );

  // helpers
  const isAbsoluteIri = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
  const resolvePredicate = (k) => {
    if (isAbsoluteIri(k)) return k;
    // optionally support CURIE keys in settings:
    if (typeof k === 'string' && k.includes(':')) {
      try { const iri = curieToIri(k); if (iri) return iri; } catch (_) {}
    }
    return null;
  };

  for (const [key, value] of Object.entries(settings)) {
    if (key === 'iri') continue;                             // already handled
    if (key === 'owlImportsLocal') continue;                 // app-internal cache: skip
    if (key === w3cIRI.OWL_IMPORTS && Array.isArray(value)) { // emit imports as IRIs
      for (const importIRI of value) {
        writer.addQuad(
          N3.DataFactory.namedNode(ontologyIRI),
          N3.DataFactory.namedNode(w3cIRI.OWL_IMPORTS),
          N3.DataFactory.namedNode(importIRI)
        );
      }
      continue;
    }

    // Emit only if predicate is an IRI (or resolvable CURIE) and value is scalar
    const pred = resolvePredicate(key);
    const isScalar = ['string','number','boolean'].includes(typeof value);
    if (pred && isScalar) {
      writer.addQuad(
        N3.DataFactory.namedNode(ontologyIRI),
        N3.DataFactory.namedNode(pred),
        N3.DataFactory.literal(String(value))
      );
    }
  }


  rows.forEach((row) => {
    const [subject, label, type, definition, isAObject, isCuratedInOntology] = row;
    if (!subject || !type) return;

    writer.addQuad(N3.DataFactory.namedNode(subject),
      N3.DataFactory.namedNode(w3cIRI.RDF_TYPE),
      N3.DataFactory.namedNode(`http://www.w3.org/2002/07/owl#${type}`)
    );

    if (label) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode(w3cIRI.RDFS_LABEL),
        N3.DataFactory.literal(label));
    }

    if (definition) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode(w3cIRI.SKOS_DEFINITION),
        N3.DataFactory.literal(definition));
    }

    // Handle "Is A" relationships
    const isAPredicate = getIsAPredicate(type);
    if (isAPredicate && isAObject) {
      const objIri = resolveToIri(isAObject);
      if (objIri) {
        writer.addQuad(
          N3.DataFactory.namedNode(subject),
          N3.DataFactory.namedNode(isAPredicate),
          N3.DataFactory.namedNode(objIri)
        );
      } else {
        console.warn(`[export] Could not resolve IsA value "${isAObject}" to an IRI for subject ${subject}`);
      }
    }

    // writer
    if (isCuratedInOntology) {
      const obj = asObjectTerm(isCuratedInOntology);
      writer.addQuad(
        N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode(w3cIRI.CCO_CURATEDIN),
        obj
      );
    }

    customPredicates.forEach((predicate, idx) => {
      const colIndex = BASE_COLS + idx;
      const cellValue = row[colIndex];
      if (!cellValue) return;

      const mode = getPredicateValueMode(predicate) || defaultModeForPredicate(predicate);

      if (mode === 'iri') {
        // Try to emit as resource (NamedNode); fallback to literal if not resolvable
        const v = String(cellValue).trim();
        let obj = null;
        if (/^<[^>\s]+>$/.test(v)) obj = N3.DataFactory.namedNode(v.slice(1, -1));
        else if (/^https?:\/\/\S+$/i.test(v)) obj = N3.DataFactory.namedNode(v);
        else if (/^[A-Za-z][\w-]*:[\w.-]+$/.test(v)) {
          const iri = curieToIri(v);
          if (iri) obj = N3.DataFactory.namedNode(iri);
        }

        writer.addQuad(
          N3.DataFactory.namedNode(subject),
          N3.DataFactory.namedNode(predicate),
          obj || N3.DataFactory.literal(v)
        );
      } else {
        // literal mode
        writer.addQuad(
          N3.DataFactory.namedNode(subject),
          N3.DataFactory.namedNode(predicate),
          N3.DataFactory.literal(String(cellValue))
        );
      }
    });
  });

  return new Promise((resolve, reject) => {
    writer.end((error, result) => {
      if (error) {
        console.error('generateRdfString failed:', error);
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

const mimeTypes = {
  ttl: 'text/turtle',
  rdf: 'application/rdf+xml',
  jsonld: 'application/ld+json',
  nt: 'application/n-triples',
  trig: 'application/trig'
};

const extensions = {
  ttl: 'ttl',
  rdf: 'rdf',
  jsonld: 'jsonld',
  nt: 'nt',
  trig: 'trig'
};

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

// Delete (optional)
async function clearOntologySettings() {
  const db = await ensureDb();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  tx.objectStore(SETTINGS_STORE).delete('ontologySettings');
  await idbTransactionDone(tx);
  showToast('Ontology settings cleared from database.', 'info');
}

const handleExport = async (shouldDownload = false) => {
  console.info('handleExport happened');
  const rows = hotInstance.getData();
  const format = document.getElementById('exportFormat')?.value || 'ttl';

  try {
    const rdfString = await generateRdfString(rows, format);
    output.value = rdfString;

    if (shouldDownload) {
      const blob = new Blob([rdfString], { type: mimeTypes[format] });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ontology.${extensions[format]}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('handleExport failed:', e);
  }
};

/**
 * Saves the current RDF data to IndexedDB.
 * Uses the idb library for IndexedDB operations.
 * @params none
 * @returns {Promise<void>}
 */
async function saveRDFtoIndexedDB() {
  console.info('saveRDFtoIndexedDB happened');
  const rows = hotInstance.getData();
  // A <button> has no useful .value — read from the format <select>
  const format = document.getElementById('exportFormat')?.value || 'ttl';

  try {
    const rdfString = await generateRdfString(rows, format);
    output.value = rdfString;

    const db = await ensureDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({ rdfData: rdfString, format, timestamp: new Date().toISOString() });
    await idbTransactionDone(tx);

    console.info('RDF data saved to IndexedDB successfully.');
    showToast('RDF data saved to database successfully.', 'success');

    updateReloadSessionButton(); // reflect availability immediately
  } catch (e) {
    console.error('saveRDFtoIndexedDB failed:', e);
    showToast('Failed to save RDF data to database.', 'error');
  }
};

/**
 * Checks if there is a prior saved session in IndexedDB.
 * @params none
 * @returns {Promise<boolean>} 
 */
async function hasPriorSession() {
  const db = await ensureDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const count = await idbRequest(store.count());
  await idbTransactionDone(tx);
  return count > 0;
}

/**
 * Ensures DB + object store exist; returns an IDBPDatabase instance
 * @params none
 * @returns {Promise<IDBPDatabase>}
 */
function ensureDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result); // <- IDBDatabase
    request.onerror = () => reject(request.error);
  });
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

/**
 * Maps saved format strings to N3.Parser formats.
 * @param {string} format
 * @returns 
 */
function n3FormatForSaved(format) {
  // Map your saved "format" (ttl|rdf|jsonld|nt|trig) to N3.Parser formats
  const f = String(format || '').toLowerCase();
  if (f === 'ttl' || f.includes('turtle')) return 'Turtle';
  if (f === 'nt'  || f.includes('n-triple')) return 'N-Triples';
  if (f === 'trig') return 'TriG';
  // N3.Parser does not parse RDF/XML or JSON-LD. If you need those, convert before parse.
  // For now, treat others as Turtle; you can extend later with rdfxml/jsonld conversions.
  return 'Turtle';
}

function firstLiteral(objs) {
  // pick the first literal string from an array of objects (already stringified below)
  for (const o of objs) {
    if (o.startsWith('"')) return o.replace(/^"(.*)"(?:@[\w-]+|\^\^<[^>]+>)?$/, '$1');
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

function asObjectTerm(value) {
  if (value == null) return null;
  const v = String(value).trim();

  // Already wrapped <IRI>
  if (/^<[^>\s]+>$/.test(v)) {
    return N3.DataFactory.namedNode(v.slice(1, -1));
  }
  // Absolute IRI
  if (/^https?:\/\/\S+$/i.test(v)) {
    return N3.DataFactory.namedNode(v);
  }
  // CURIE → IRI (uses your curieToIri)
  if (/^[A-Za-z][\w-]*:[\w.-]+$/.test(v)) {
    const iri = curieToIri(v);
    if (iri) return N3.DataFactory.namedNode(iri);
  }
  // Fallback: literal
  return N3.DataFactory.literal(v);
}

async function storeGetAll(store) {
  if ('getAll' in store) return idbRequest(store.getAll());
  const out = [];
  await new Promise((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); } else resolve();
    };
    req.onerror = () => reject(req.error);
  });
  return out;
}

// Reloads the most recent saved session from IndexedDB
async function reloadSavedSession() {
  try {
    const db = await ensureDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // getAll is widely supported; cursor fallback shown below if you need it
    let all = await storeGetAll(store);
    await idbTransactionDone(tx);

    if (!all || !all.length) {
      console.warn('No prior session found in IndexedDB.');
      showToast('No prior session found.', 'info');
      return;
    }

    // Use the latest record
    const { rdfData, format } = all[all.length - 1];

    // Parse RDF → quads
    const parser = new N3.Parser({ format: n3FormatForSaved(format) });
    const quads = parser.parse(rdfData);

    // Build subject → predicate→values map + set of all predicates
    const subjMap = new Map();
    const extraPreds = new Set();

    for (const q of quads) {
      const s = q.subject.termType === 'BlankNode' ? `_:${q.subject.value}` : q.subject.value;
      const p = q.predicate.value;

      let o;
      if (q.object.termType === 'Literal') {
        const lang = q.object.language ? `@${q.object.language}` : '';
        const dt = q.object.datatype && q.object.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string'
          ? `^^<${q.object.datatype.value}>` : '';
        o = `"${q.object.value}"${lang}${dt}`;
      } else if (q.object.termType === 'BlankNode') {
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
    for (const [s, pMap] of subjMap.entries()) {

      if (s === ontologyIriFromSettings) continue;
      const rdfTypes = Array.from(pMap.get(w3cIRI.RDF_TYPE)?.values() || []);
      const hasType = iri => rdfTypes.includes(`<${iri}>`);
      if (hasType(w3cIRI.OWL_ONTOLOGY)) continue;

      let elementType = '';
      if (hasType(w3cIRI.OWL_CLASS))           elementType = 'Class';
      else if (hasType(w3cIRI.OWL_OBJPROP))    elementType = 'ObjectProperty';
      else if (hasType(w3cIRI.OWL_DATATYPE))   elementType = 'DatatypeProperty';
      else if (hasType(w3cIRI.OWL_ANNOPROP))   elementType = 'AnnotationProperty';
      else if (hasType(w3cIRI.OWL_NAMEDIND))   elementType = 'NamedIndividual';
      else if (hasType(w3cIRI.OWL_ONTOLOGY))   elementType = 'Ontology'; // This is an outlier case, mostly for error handling
      else if (rdfTypes.length)                elementType = 'NamedIndividual';

      const label = firstLiteral(Array.from(pMap.get(w3cIRI.RDFS_LABEL)?.values() || []));
      const definition = firstLiteral(Array.from(pMap.get(w3cIRI.SKOS_DEFINITION)?.values() || []));

      let isA = '';
      if (elementType === 'Class') {
        isA = iriFromObjects(Array.from(pMap.get(w3cIRI.RDFS_SUBCLASS)?.values() || []));
      } else if (elementType === 'ObjectProperty' || elementType === 'DatatypeProperty' || elementType === 'AnnotationProperty') {
        isA = iriFromObjects(Array.from(pMap.get(w3cIRI.RDFS_SUBPROP)?.values() || []));
      } else if (elementType === 'NamedIndividual') {
        const classish = rdfTypes
          .map(v => /^<([^>]+)>$/.exec(v)?.[1])
          .filter(u => u && u !== w3cIRI.OWL_CLASS && u !== w3cIRI.OWL_OBJPROP && u !== w3cIRI.OWL_DATAPROP && u !== w3cIRI.OWL_ANNOPROP);
        if (classish.length) isA = classish[0];
      }

      const curatedVals = Array.from(pMap.get(w3cIRI.CCO_CURATEDIN)?.values() || []);
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
          p === w3cIRI.RDFS_LABEL || p === w3cIRI.SKOS_DEFINITION || p === w3cIRI.RDF_TYPE ||
          p === w3cIRI.RDFS_SUBCLASS || p === w3cIRI.RDFS_SUBPROP || p === w3cIRI.CCO_CURATEDIN
        ) continue;
        extraPreds.add(p);
      }

      rowsTmp.push({ row, pMap });
    }

    // adopt discovered extra predicates as your custom columns (sorted for stability)
    const extraList = Array.from(extraPreds).sort();
    customPredicates.splice(0, customPredicates.length, ...extraList);

    const finalRows = rowsTmp.map(({ row, pMap }) => {
      const extended = row.concat(extraList.map(() => ''));
      extraList.forEach((predIri, i) => {
        const vals = Array.from(pMap.get(predIri)?.values() || []);
        extended[BASE_COLS + i] = vals.join(' ; ');
      });
      return extended;
    });

    const newHeaders = getColumnHeaders(); // base + customPredicates
    const newColumns = getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' })));
    hotInstance.setSchema(newHeaders, newColumns);
    hotInstance.replaceRows(finalRows, 'LoadData');
    harvestRowsIntoVocab?.(finalRows);

    showToast(`✅ Reloaded ${subjMap.size} subject${subjMap.size!==1?'s':''} from latest saved RDF`, 'success');
  } catch (e) {
    console.error('[reloadSavedSession] failed:', e);
    showToast('❌ Failed to reload prior session — see console', 'error');
  }
}

/**
 * Gets the current date parts (year, month, day) as zero-padded strings.
 * @returns 
 */
function getCurrentDateParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { year, month, day };
}

// This is called by generateOntologySettings to get the camelCase version of the label
function toCamelCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

// Converts a string to PascalCase (e.g., "example term" → "ExampleTerm")
function toPascalCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()) // handle word boundaries
    .replace(/^./, chr => chr.toUpperCase()); // capitalize first letter
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
    vocabIndex.push(rec);
    vocabByIri.set(rec.iri, rec);
    if (rec.curie) vocabByCurie.set(rec.curie, rec);
    if (rec.label) vocabByLabelLC.set(rec.label.toLowerCase(), rec);
    for (const alt of rec.altLabels) {
      if (alt) vocabByLabelLC.set(String(alt).toLowerCase(), rec);
    }
  }
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
    showToast("⚠️ Could not load lookup index", "error");
  }
}

// Load BFO+CCO compact index (your path)
loadVocabFrom('./json/bfo-cco-lookup.json', 'BFO/CCO');

// quick CURIE builder using your existing prefixes
function iriToCurie(iri) {
  for (const [pfx, base] of Object.entries(iriPrefixes)) {
    if (iri.startsWith(base)) return `${pfx}:${iri.slice(base.length)}`;
  }
  return null;
}


// This function searches the vocabulary index for terms matching the query.
function searchVocab(q, { max = 50, typeHint = null } = {}) {
  const term = (q || "").trim().toLowerCase();
  if (!term) return [];

  const pool = typeHint ? vocabIndex.filter(x => x.type === typeHint) : vocabIndex;

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
  console.log('[displayLabelAndCurie] called with rec:', rec.label);
  return `${rec.label || rec.curie || rec.iri} — ${(rec.curie || rec.iri)}`;
}

// Try to resolve whatever the user typed to an IRI
function resolveToIri(value) {
  if (!value) return null;
  const v = String(value).trim();

  // If they picked from the dropdown, it may be "Label — CURIE"
  const maybeCode = v.includes("—") ? v.split("—").pop().trim() : v;

  // Already a full IRI? (accept any scheme, not just http)
  if (/^https?:\/\/\S+$/i.test(maybeCode) || /^urn:[^:\s]+:.+/i.test(maybeCode) || /^<[^>\s]+>$/.test(maybeCode)) {
    return maybeCode.replace(/^<|>$/g, ''); // allow <IRI> form too
  }

  // CURIE?
  if (maybeCode.includes(":")) {
    const [pfx, local] = maybeCode.split(":");
    const base = iriPrefixes[pfx];
    if (base) return base + local;

    const rec = vocabByCurie.get(maybeCode);
    if (rec) return rec.iri;
  }
  return null; // not resolvable → invalid
}

// This function is used to harvest rows from a Handsontable instance into the vocabulary index.
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
function normalizeIsAEdits(changes) {
  if (!Array.isArray(changes)) return;
  for (const ch of changes) {
    // [row, prop(or col index), oldValue, newValue]
    const row = ch[0];
    const prop = ch[1];
    const newVal = ch[3];

    // Resolve prop to column index
    const col = (typeof prop === 'number') ? prop : hotInstance.propToCol(prop);
    if (col !== 4) continue; // only "Is A" column

    const iri = resolveToIri(newVal);
    if (iri) ch[3] = iri; // overwrite with IRI to store canonically
  }
}

function attachHotHooks() {
  hotInstance.addHook('beforeChange', normalizeIsAEdits);

  // NEW: when rows are created, auto-assign IRIs
  hotInstance.addHook('afterCreateRow', (index, amount, source) => {
    try {
      const s = getOntologySettings();
      const mode = s.iriMode || 'opaque';

      if (mode === 'opaque') {
        let maxNum = findMaxOpaqueNumber(hotInstance, s);
        for (let r = 0; r < amount; r++) {
          const rowIndex = index + r;
          maxNum += 1;
          const iri = buildOpaqueIri(maxNum, s);
          hotInstance.setDataAtCell(rowIndex, 0, iri); // col 0 = IRI
        }
      } else {
        // readable: we’ll fill when/if label appears (see afterChange)
        for (let r = 0; r < amount; r++) {
          const rowIndex = index + r;
          // leave IRI blank for now
          hotInstance.setDataAtCell(rowIndex, 0, '');
        }
      }
    } catch (e) {
      console.error('[IRI] afterCreateRow failed', e);
    }
  });

  // NEW: when label changes in readable mode, (re)build IRI if empty or previously auto-generated
  hotInstance.addHook('afterChange', (changes, source) => {
    if (!Array.isArray(changes) || source === 'LoadData') return;
    try {
      const s = getOntologySettings();
      if ((s.iriMode || 'opaque') !== 'readable') return;

      // gather existing iris for uniqueness checks
      const allIris = new Set(hotInstance.getData().map(r => String(r?.[0] || '')));

      for (const ch of changes) {
        const row = ch[0];
        const col = (typeof ch[1] === 'number') ? ch[1] : hotInstance.propToCol(ch[1]);
        const newVal = ch[3];

        // Column 1 = label
        if (col === 1) {
          const currentIri = String(hotInstance.getDataAtCell(row, 0) || '');
          const label = String(newVal || '').trim();
          if (!label) continue;

          // Rebuild if IRI is blank OR was previously auto-generated (matches our base+delimiter)
          const { base, delimiter } = getBaseAndDelimiter(s);
          const looksAuto = currentIri.startsWith(`${base}${delimiter}`);

          if (!currentIri || looksAuto) {
            // Temporarily exclude our own current IRI to avoid self-collision logic
            if (currentIri) allIris.delete(currentIri);

            const iri = buildReadableIri(label, s, allIris);
            hotInstance.setDataAtCell(row, 0, iri);

            allIris.add(iri); // reserve
          }
        }
      }
    } catch (e) {
      console.error('[IRI] afterChange label→IRI sync failed', e);
    }
  });
}

// This function backfills IRIs in the Handsontable instance based on the selected mode.
function backfillIris() {
  try {
    if (!hotInstance) {
      console.warn('[IRI] No table instance');
      showToast('⚠️ Table not ready', 'error');
      return;
    }

    const s = getEffectiveOntologySettings();
    const mode = s.iriMode || 'opaque';

    const total = hotInstance.countRows();

    // collect already-used IRIs to ensure uniqueness
    const existing = new Set();
    for (let r = 0; r < total; r++) {
      const iri = String(hotInstance.getDataAtCell(r, 0) || '').trim();
      if (iri) existing.add(iri);
    }

    let filled = 0;
    let skipped = 0;

    if (mode === 'opaque') {
      // start at max seen (or start-1), then fill blanks
      let next = Math.max(findMaxOpaqueNumber(hotInstance, s), (s.opaqueStart || 1) - 1);

      for (let r = 0; r < total; r++) {
        const iri = String(hotInstance.getDataAtCell(r, 0) || '').trim();
        if (!iri) {
          // advance until unique
          do { next += 1; } while (existing.has(buildOpaqueIri(next, s)));
          const newIri = buildOpaqueIri(next, s);
          hotInstance.setDataAtCell(r, 0, newIri);
          existing.add(newIri);
          filled++;
        }
      }
    } else {
      // human-readable: derive from label when present
      for (let r = 0; r < total; r++) {
        const iri = String(hotInstance.getDataAtCell(r, 0) || '').trim();
        if (!iri) {
          const label = String(hotInstance.getDataAtCell(r, 1) || '').trim();
          if (!label) { skipped++; continue; }
          const newIri = buildReadableIri(label, s, existing);
          hotInstance.setDataAtCell(r, 0, newIri);
          existing.add(newIri);
          filled++;
        }
      }
    }

    showToast(`✅ Backfilled ${filled} IRI${filled!==1?'s':''}` + (skipped ? ` (skipped ${skipped} unlabeled row${skipped!==1?'s':''})` : ''), 'success');
  } catch (e) {
    console.error('[IRI] Backfill failed', e);
    showToast('❌ Backfill failed — see console', 'error');
  }
}

function isValidOntology(content) {
  return (
    typeof content === 'string' &&
    content.length > 0 &&
    /rdf:RDF|@prefix|owl:Ontology/.test(content)
  );
}

// Gets n rows to the bottom of the Handsontable instance.
function getRowCountInput() {
  const n = parseInt(document.getElementById("row-count").value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}


// This function adds n blank rows to the bottom of the Handsontable instance.
function addRowsToTable(n = 1) {
  if (!hotInstance || n < 1) return;
  hotInstance.insertRows(hotInstance.countRows(), n);
}

// This function deletes n rows from the bottom of the Handsontable instance.
function removeRowsFromBottom(n = 1) {
  if (!hotInstance || n < 1) return;
  const total = hotInstance.countRows();
  const toRemove = Math.min(n, total);
  if (toRemove > 0) hotInstance.removeRows(total - toRemove, toRemove);
}



/**
 * Returns [ {index, header} ] for custom predicate columns (all columns after BASE_COLS).
 */
function getCustomPredicateColumns() {
  if (!hotInstance) return [];
  const headers = hotInstance.getColHeader(); // includes hidden columns
  const out = [];
  for (let c = BASE_COLS; c < headers.length; c++) {
    out.push({ index: c, header: String(headers[c]) });
  }
  return out;
}

/**
 * Build the predicate modes checklist (custom predicates only).
 * containerOrId: element or element id where the list goes.
 */
function renderPredicateModesChecklist(containerOrId) {
  const container = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!container) return;

  // Collect custom predicate IRIs from your known list
  // You already track them in `customPredicates` and align by BASE_COLS.
  const preds = Array.isArray(customPredicates) ? [...customPredicates] : [];
  const modes = getPredicateValueModes();

  // Clear container
  container.innerHTML = '';

  // Build table
  const table = document.createElement('table');
  table.style.width = '80%';
  table.style.borderCollapse = 'collapse';
  table.style.padding = '0';
  table.style.margin = '0';

  // Header
  const tableHead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const thPredicate = document.createElement('th');
  thPredicate.textContent = 'Predicate';
  thPredicate.style.textAlign = 'left';
  thPredicate.style.padding = '2px 4px';
  thPredicate.style.borderBottom = '1px solid #ccc';

  const thIRI = document.createElement('th');
  thIRI.textContent = 'Object is IRI?';
  thIRI.style.textAlign = 'center';
  thIRI.style.padding = '2px 4px';
  thIRI.style.borderBottom = '1px solid #ccc';

  // Build DOM heirarchy
  headerRow.appendChild(thPredicate);
  headerRow.appendChild(thIRI);
  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  // Populate rows
  const tBody = document.createElement('tbody');
  

  preds.forEach((iri, i) => {
    const tr = document.createElement('tr');

    // predicate label (left)
    const tdLabel = document.createElement('td');
    tdLabel.style.padding = '2px';
    tdLabel.style.borderBottom = '1px solid #f0f0f0';

    const nice = (typeof iriToNiceLabel === 'function' ? iriToNiceLabel(iri) : iri);
    const label = document.createElement('label');
    const checkboxId = `pred-mode-${i}`;
    label.setAttribute('for', checkboxId);
    label.textContent = nice;
    label.title = iri; // hover shows full IRI
    tdLabel.appendChild(label);

    // checkbox (right)
    const tdChk = document.createElement('td');
    tdChk.style.padding = '2px';
    tdChk.style.borderBottom = '1px solid #f0f0f0';
    tdChk.style.textAlign = 'center';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.dataset.predicateIri = iri;

    const current = modes[iri] || defaultModeForPredicate(iri);
    checkbox.checked = (current === 'iri');

    checkbox.addEventListener('change', (ev) => {
      const pred = ev.currentTarget.dataset.predicateIri;
      setPredicateValueMode(pred, ev.currentTarget.checked ? 'iri' : 'literal');
      // no save here; your Save button calls savePredicateValueModes()
    });

    tdChk.appendChild(checkbox);

    tr.appendChild(tdLabel);
    tr.appendChild(tdChk);
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

    // (Optional) show if currently hidden in HOT
    const hiddenBadge = hidden.includes(index) ? ' (hidden)' : '';

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
    const selectedIRI = select?.value.trim() || '';
    const customIRI  = iriInput?.value.trim() || '';
    const finalIRI = customIRI || selectedIRI;

    if (finalIRI) {
      if (customPredicates.includes(finalIRI)) {
        alert("Predicate already added.");
      } else {
        customPredicates.push(finalIRI);

         // Initialize value mode for this new predicate (once)
         if (!getPredicateValueMode(finalIRI)) {
           setPredicateValueMode(finalIRI, defaultModeForPredicate(finalIRI));
           //await savePredicateValueModes();
         }

        const newHeaders = getColumnHeaders(); // base + customs
        const newColumns = getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' })));
        const oldData = hotInstance.getData();
        const validTypes = getElementTypes();

        const cleanedRows = oldData.map(row => {
          const fixed = Array.from({ length: BASE_COLS + customPredicates.length }, (_, i) => row[i] ?? '');

          // sanitize element type
          if (!validTypes.includes(fixed[2])) fixed[2] = '';

          return fixed;
        });

        hotInstance.setSchema(newHeaders, newColumns);
        hotInstance.replaceRows(cleanedRows, 'LoadData');
        harvestRowsIntoVocab?.(cleanedRows);
         // Refresh the modes UI if the modal is open
         try { renderPredicateModesChecklist('predicate-modes-list'); } catch (_) {}
      }
    }

    showToast('✅ Predicates/columns updated', 'success');
  } catch (e) {
    console.error('[ManagePredicates] confirmAddPredicate failed', e);
    showToast('❌ Failed to update predicates/columns', 'error');
  }
}

// Try to resolve CURIE-like strings to IRIs; pass full IRIs through
function curieToIri(maybe) {
  if (!maybe) return null;
  const v = String(maybe).trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes(':')) {
    const [pfx, local] = v.split(':');
    const base = iriPrefixes?.[pfx];
    if (base) return base + local;
  }
  return null;
}

// For UI labels: prefer CURIE if we can build one
function iriToNiceLabel(iri) {
  return iriToCurie?.(iri) || iri;
}

// base header map
const BASE_HEADER_TO_PRED = new Map([
  ['label',        w3cIRI.RDFS_LABEL],
  ['definition',   w3cIRI.SKOS_DEFINITION],
  ['element type', w3cIRI.RDF_TYPE],
  ['is curated in ontology', w3cIRI.CCO_CURATEDIN],
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
      w3cIRI.RDF_TYPE,
      w3cIRI.RDFS_SUBCLASS,
      w3cIRI.RDFS_SUBPROP,
    ].filter(Boolean);
  }

  // If header itself is an IRI or CURIE, include it
  const iri = curieToIri(header);
  return iri ? [iri] : [];
}

// Build the predicate set from HOT headers (visible or hidden)
function collectPredicateIrisFromHeaders() {
  if (!hotInstance) return [];
  const headers = hotInstance.getColHeader(); // includes hidden
  const set = new Set();
  for (const h of headers) set.add(p);
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
 * This relies on the globally available hotInstance and curieToIri.
 * * @returns {Set<string>} A Set of unique predicate IRIs.
 */
function getAllTablePredicates() {
    if (!hotInstance) return new Set();

    const allPredicates = new Set();
    const headers = hotInstance.getColHeader();
    
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
  document.getElementById("file-input").value = "";
  document.getElementById("filename-display").style.display = "none";
  document.getElementById("filename-text").textContent = "";
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

  if (fileType === 'ontology') {
    headerCheckbox.style.display = 'none';
    console.info("[UI] Hiding header row checkbox");
  } else {
    headerCheckbox.style.display = 'block';
    console.info("[UI] Showing header row checkbox");
  }

  if (fileType === "spreadsheet") {
    headerCheckbox.style.display = "block";
    console.info("[UI] Showing header row checkbox");
  } else {
    headerCheckbox.style.display = "none";
    console.info("[UI] Hiding header row checkbox");
  }
}


/**
 * Extracts and returns the lowercase file extension from a filename.
 * Logs the result and errors for debugging.
 *
 * @param {string} filename - The name of the file (e.g. "data.csv")
 * @returns {string} - The file extension in lowercase (e.g. "csv")
 */
function parseFileExtension(filename) {
  try {
    console.info(`[parseFileExtension] Received filename: ${filename}`);

    if (typeof filename !== 'string') {
      console.error("[parseFileExtension] Invalid input: expected string");
      return '';
    }

    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      console.warn("[parseFileExtension] No extension found or empty extension");
      return '';
    }

    const ext = filename.slice(lastDot + 1).toLowerCase();
    console.info(`[parseFileExtension] Parsed extension: ${ext}`);
    return ext;
  } catch (error) {
    console.error("[parseFileExtension] Unexpected error:", error);
    return '';
  }
}


/**
 * Detects the file format type based on the file extension.
 * Supports spreadsheets, ontologies (coming soon), or returns 'unsupported'.
 *
 * @param {string} extension - File extension (lowercase, no dot)
 * @returns {string} - 'spreadsheet', 'ontology', or 'unsupported'
 */
function detectFormatByExtension(extension) {
  console.info(`[detectFormatByExtension] Checking extension: ${extension}`);

  // Define supported extension sets
  var spreadsheetExts = ["csv", "tsv", "xls", "xlsx"];
  var ontologyExts = ["ttl", "nt", "rdf", "jsonld"];

  try {
    if (typeof extension !== 'string') {
      console.error("[detectFormatByExtension] Invalid input: expected string");
      return 'unsupported';
    }

    if (spreadsheetExts.includes(extension)) {
      console.info("[detectFormatByExtension] Detected spreadsheet format");
      return 'spreadsheet';
    }

    if (ontologyExts.includes(extension)) {
      console.info("[detectFormatByExtension] Detected ontology format");
      return 'ontology';
    }

    console.warn("[detectFormatByExtension] Unsupported extension");
    return 'unsupported';
  } catch (error) {
    console.error("[detectFormatByExtension] Unexpected error:", error);
    return 'unsupported';
  }
}

/**
 * Parses CSV, TSV, XLS, or XLSX into a 2D row array using SheetJS.
 *
 * @param {File} file - The file object (from drag/drop or input)
 * @param {string} extension - The file extension (csv, tsv, xls, xlsx)
 * @param {boolean} hasHeaderRow - Whether the first row is a header
 * @returns {Promise<{rows: string[][], header: string[] | null}>}
 */
function parseSpreadsheetData(file, extension, hasHeaderRow) {
  return new Promise((resolve, reject) => {
    console.info(`[parseSpreadsheetData] Reading ${file.name}, header=${hasHeaderRow}`);

    var reader = new FileReader();

    reader.onload = function (event) {
      try {
        var data = event.target.result;

        // Read workbook
        var workbook = XLSX.read(data, {
          type: extension === "xls" || extension === "xlsx" ? 'binary' : 'string',
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

        resolve({ rows: rows, header: header });
      } catch (error) {
        console.error("[parseSpreadsheetData] Error parsing:", error);
        reject(error);
      }
    };

    reader.onerror = function (e) {
      console.error("[parseSpreadsheetData] File read error:", e);
      reject(e);
    };

    // Trigger appropriate read type
    if (extension === "xls" || extension === "xlsx") {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  });
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
      showToast("❌ Invalid insert mode selected", "error");
      return;
    }

    if (!currentImportFile) {
      console.warn("No file selected");
      showToast("❌ Please select a file before saving", "error");
      return;
    }

    // Header row checkbox (checked = true)
    const hasHeader = document.getElementById("first-row-header").checked;

    // Get file extension and parse
    const extension = parseFileExtension(currentImportFile.name);
    const parsed = await parseSpreadsheetData(currentImportFile, extension, hasHeader);
    const allHeaders = getColumnHeaders(); // already includes customs
    const allColumns = getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' })));

    const knownPredicates = allHeaders; // use as the canonical expected headers

    const result = validateTableData(parsed.rows, parsed.header, knownPredicates, hasHeader);

    if (!result.valid) {
      console.warn("Validation failed", result.errors);
      alert("Import failed:\n" + result.errors.join("\n"));  // Still important to stop the user
      return;
    }

    // Merge clean data
    const { mergedRows, stats } = mergeTableData(
      hotInstance.getData(),
      result.cleanedRows,
      insertMode
    );

    hotInstance.setSchema(allHeaders, allColumns);
    hotInstance.replaceRows(mergedRows, 'LoadData');
    harvestRowsIntoVocab?.(mergedRows);

    
    // Toast feedback
    showToast(
      `✅ ${stats.appended} rows added (${stats.total} total)`,
      "success"
    );

    // Close modal
    document.getElementById("insert-data-modal").style.display = "none";
    currentImportFile = null;
    resetFileInput();

  } catch (error) {
    console.error("Import error:", error);
    showToast("❌ Error processing import — see console", "error");
  }
}

/**
 * Parses an RDF file (Turtle, RDF/XML, JSON-LD, etc.) using N3.js.
 * @param {File} file - The file object from the drag-and-drop area.
 * @param {object} mimeTypes - Your mimeTypes constant.
 * @param {function} guessMediaType - Your guessMediaType function.
 * @param {function} parseFileExtension - Assumed function to get 'ttl', 'rdf', etc.
 * @returns {Promise<Array>} A promise that resolves with an array of N3.js quads.
 */
function parseOntologyData(file, mimeTypes, guessMediaType, parseFileExtension) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const fileContent = event.target.result;
        const extension = parseFileExtension(file.name);
        
        // Try to get MIME type from extension, fall back to guessing from content
        const mimeType = mimeTypes[extension] || guessMediaType(fileContent);

        const parser = new N3.Parser({ format: mimeType });
        const quads = [];

        parser.parse(fileContent, (error, quad, prefixes) => {
          if (error) {
            // Reject the promise on a parsing error
            return reject(new Error(`N3.js parsing error: ${error.message}`));
          }
          if (quad) {
            // Add valid quads (triples) to the array
            quads.push(quad);
          } else {
            // Parsing is complete (no quad, no error)
            resolve(quads);
          }
        });
      } catch (error) {
        reject(new Error(`File reading or parser initialization error: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read the file.'));
    };

    // Start reading the file as text
    reader.readAsText(file);
  });
}

/**
 * Helper function to pivot N3.js quads into a Handsontable-compatible row structure.
 * It groups triples by subject and maps predicates to known table columns.
 * @param {Array} quads - Array of quads from parseOntologyData.
 * @param {Array<string>} knownPredicates - Array of column headers (e.g., ["IRI", "rdfs:label", ...])
 * @returns {object} - An object { valid: true, cleanedRows: [...], errors: [] }
 */
function validateAndPivotOntologyData(quads, knownPredicates) {
  const subjectData = new Map(); // Key: subject URI, Value: { predicate: object }
  const errors = [];

  // 1. Group quads by subject
  for (const quad of quads) {
    const s = quad.subject.value;
    const p = quad.predicate.value;
    const o = quad.object.value;

    if (!subjectData.has(s)) {
      subjectData.set(s, {});
    }

    const predicates = subjectData.get(s);
    
    // Check if this predicate is already a column
    if (knownPredicates.includes(p)) {
        // Handle multiple values for the same predicate (e.g., multiple rdfs:comment)
        // This simple version joins with a comma. You could also create duplicate rows.
        if (predicates[p]) {
            predicates[p] += `, ${o}`;
        } else {
            predicates[p] = o;
        }
    }
    // You could add an 'else' here to collect unrecognized predicates as an error/warning
  }

  // 2. Pivot the Map into an array of rows
  const cleanedRows = [];
  const subjectHeader = knownPredicates[0]; // Assumes first column is the Subject/IRI

  for (const [subjectUri, predicates] of subjectData.entries()) {
    // Create a new row array, initialized to null
    const newRow = new Array(knownPredicates.length).fill(null);
    
    // Set the subject in the first column
    newRow[0] = subjectUri;

    // Map the predicates to their corresponding columns
    for (const [predicateUri, objectValue] of Object.entries(predicates)) {
      const colIndex = knownPredicates.indexOf(predicateUri);
      if (colIndex > 0) { // colIndex 0 is subject, which we already set
        newRow[colIndex] = objectValue;
      }
    }
    cleanedRows.push(newRow);
  }
  
  // For now, validation is simple. You could add more complex checks here.
  if (cleanedRows.length === 0 && quads.length > 0) {
      errors.push("Data was parsed, but no subjects matched the known table columns.");
  }

  return { valid: errors.length === 0, cleanedRows, errors };
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
      showToast("❌ Invalid insert mode selected", "error");
      return;
    }

    if (!currentImportFile) {
      console.warn("No file selected");
      showToast("❌ Please select a file before saving", "error");
      return;
    }

    // NOTE: The "hasHeader" checkbox is irrelevant for ontology data, so we skip it.

    // Get all current column headers and definitions
    const allHeaders = getColumnHeaders(); // already includes customs
    const allColumns = getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' })));

    // The "known predicates" are all column headers.
    // We assume the first header is the Subject (e.g., "IRI").
    const knownPredicates = allHeaders;

    // --- REPLACED BLOCK ---
    // Instead of parsing a spreadsheet, parse the ontology file
    const quads = await parseOntologyData(
        currentImportFile, 
        mimeTypes, 
        guessMediaType, 
        parseFileExtension // Pass in your helper functions
    );

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
        showToast("ℹ️ No new data found matching the current table columns.", "info");
        // Close modal and reset
        document.getElementById("insert-data-modal").style.display = "none";
        currentImportFile = null;
        resetFileInput();
        return;
    }

    // Merge clean data (this logic remains identical)
    const { mergedRows, stats } = mergeTableData(
      hotInstance.getData(),
      result.cleanedRows,
      insertMode
    );

    hotInstance.setSchema(allHeaders, allColumns);
    hotInstance.replaceRows(mergedRows, 'LoadData');
    harvestRowsIntoVocab?.(mergedRows);

    
    // Toast feedback (this logic remains identical)
    showToast(
      `✅ ${stats.appended} subjects loaded (${stats.total} total rows)`,
      "success"
    );

    // Close modal (this logic remains identical)
    document.getElementById("insert-data-modal").style.display = "none";
    currentImportFile = null;
    resetFileInput();

  } catch (error) {
    console.error("Import error:", error);
    showToast(`❌ Error processing import: ${error.message}`, "error");
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
      showToast("❌ Please select a file type (Spreadsheet or Ontology)", "error");
    }
  } catch (error) {
    // This provides a top-level catch in case the individual
    // handlers fail in a way their own try/catch doesn't handle.
    console.error("Primary save handler error:", error);
    showToast("❌ A critical error occurred during save.", "error");
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

  const extension = parseFileExtension(file.name); // Your existing function
  const headerCheckbox = document.getElementById('header-checkbox-container');
  
  // Your 'extensions' constant from the previous prompt
  const ontologyExtensions = Object.values(extensions); // ['ttl', 'rdf', 'jsonld', 'nt', 'trig']
  
  if (ontologyExtensions.includes(extension)) {
    // Select 'Ontology'
    document.querySelector('input[name="file-type"][value="ontology"]').checked = true;
    // Hide header row checkbox - it's not relevant for ontology
    headerCheckbox.style.display = 'none';
  } else {
    // Default to 'Spreadsheet'
    document.querySelector('input[name="file-type"][value="spreadsheet"]').checked = true;
    // Show header row checkbox
    headerCheckbox.style.display = 'block';
  }
}

function resetFileInput() {
  const fileNameSpan = document.getElementById("file-input");
  fileNameSpan.textContent = "No file selected";
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

  // Alias mapping to support variations in common headers
  const headerAliases = {
    "iri": "iri",
    "IRI": "iri",
    "id": "iri",
    "label": "label",
    "rdfs:label": "label",
    "http://www.w3.org/2000/01/rdf-schema#label": "label",
    "element type": "element type",
    "type": "element type",
    "rdf:type": "element type",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#type": "element type",
    "definition": "definition",
    "skos:definition": "definition",
    "http://www.w3.org/2004/02/skos/core#definition": "definition",
    "is a": "is a",
    "subclass of": "is a",
    "rdfs:subClassOf": "is a",
    "http://www.w3.org/2000/01/rdf-schema#subClassOf": "is a",
    "subproperty of": "is a",
    "rdfs:subPropertyOf": "is a",
    "http://www.w3.org/2000/01/rdf-schema#subPropertyOf": "is a",
    "is curated in": "is curated in",
    "is defined by": "is curated in",
    "is curated in ontology": "is curated in",
    "cco2:ont00001760": "is curated in",
    "https://www.commoncoreontologies.org/ont00001760": "is curated in",
    "has curation status": "has curation status",
    "obo:IAO_0000114": "has curation status",
    "http://purl.obolibrarry.org/obo/IAO_0000114": "has curation status",
    "cco2:ont00001753": "acronym",
    "https://www.commoncoreontologies.org/ont00001753": "acronym",
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

    const expectedCols = BASE_COLS + customPredicates.length;

    rows.forEach((row, i) => {
      const cleanedRow = row.slice(0, expectedCols); // Trim excess columns

      if (row.length < expectedCols) {
        console.info(`[validateTableData] Padding row ${i + 1} with empty cells`);
        while (row.length < expectedCols) {
          row.push("");
        }
      }

      const typeValue = cleanedRow[2]; // Expecting "element type" column
      const validTypes = getElementTypes();
      if (!validTypes.includes(typeValue)) {
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
 * @param {string[][]} currentRows - Existing HOT data rows
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
document.getElementById('saveToDatabaseBtn').addEventListener('click', saveRDFtoIndexedDB);

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
    const tableBody = document.getElementById("prefix-table-body");
    tableBody.innerHTML = ""; // Clear old rows

    // Loop through iriPrefixes and create a row for each
    Object.entries(iriPrefixes).forEach(([prefix, iri]) => {
      const row = document.createElement("tr");
      row.classList.add('prefix-table-cell');
      Object.assign(row.style, {
          height: "30px",
          paddingLeft: "5px",
          paddingRight: "5px",
          paddingTop: "0px",
          paddingBottom: "0px"
      });
      
      const prefixCell = document.createElement("td");
      prefixCell.textContent = prefix;
      row.appendChild(prefixCell);

      const iriCell = document.createElement("td");
      iriCell.textContent = iri;
      row.appendChild(iriCell);

      const removeCell = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "❌";
      removeBtn.addEventListener("click", () => {
        delete iriPrefixes[prefix];
        openPrefixManagerModal(); // re-render the table
      });
      removeCell.appendChild(removeBtn);
      row.appendChild(removeCell);

      tableBody.appendChild(row);
    });

    document.getElementById("prefix-manager-modal").style.display = "block";
  } catch (err) {
    console.error("[openPrefixManagerModal] Failed to populate prefix table:", err);
    showToast("❌ Failed to open prefix manager", "error");
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

    const prefixCell = document.createElement('td');
    prefixCell.textContent = prefix;

    const iriCell = document.createElement('td');
    iriCell.textContent = iri;

    const removeCell = document.createElement('td');
    const removeBtn = document.createElement('button');
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
  const prefix = document.getElementById('new-prefix').value.trim();
  const iri = document.getElementById('new-prefix-iri').value.trim();

  if (!prefix || !iri) return;
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
  settings[w3cIRI.OWL_IMPORTS] = settings[w3cIRI.OWL_IMPORTS] || [];
  if (!settings[w3cIRI.OWL_IMPORTS].includes(iri)) {
    settings[w3cIRI.OWL_IMPORTS].push(iri);
  }

  // Store local cache under a separate key
  settings.owlImportsLocal = settings.owlImportsLocal || {};
  settings.owlImportsLocal[iri] = {
    content,
    mediaType: mediaType || guessMediaType(content),
    updatedAt: new Date().toISOString(),
  };

  await saveOntologySettings(settings);
}

// Simple media type guessing based on content
function guessMediaType(text) {
  // super-lightweight; expand if you like
  if (/^\s*@prefix\b|@base\b|:\s/.test(text)) return "text/turtle";
  if (/<rdf:RDF\b/.test(text)) return "application/rdf+xml";
  if (/"@context"\s*:/.test(text)) return "application/ld+json";
  if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(text)) return "application/n-triples";
  return "text/plain";
}

// This function opens the ontology imports modal and populates it with current imports.
// It retrieves the imports from the ontology settings and displays them with their status.
async function openImportsModal() {
  const modal = document.getElementById("ontology-imports-modal");
  const listContainer = document.getElementById("import-list");
  listContainer.innerHTML = "";

  // ensure cache is loaded
  const settings = getOntologySettings();
  const imports = settings[w3cIRI.OWL_IMPORTS] || [];
  const importsMap = getImportsMap();

  imports.forEach((iri) => {
    const loaded = !!importsMap[iri]?.content;
    const statusIcon = loaded ? "✅" : "❌";
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

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;

    if (!isValidOntology(content)) {
      validationMsg.textContent = "⚠️ Not a valid RDF/OWL text";
      validationMsg.style.display = "inline";
      return;
    }
    validationMsg.style.display = "none";

    const settings = getOntologySettings();
    const ext = parseFileExtension(file.name);
    const mediaType = mimeTypes[ext] || "text/plain";

    // Ensure owl:imports ARRAY exists and includes this IRI
    settings[w3cIRI.OWL_IMPORTS] = settings[w3cIRI.OWL_IMPORTS] || [];
    if (!settings[w3cIRI.OWL_IMPORTS].includes(iri)) {
      settings[w3cIRI.OWL_IMPORTS].push(iri);
    }

    // Save the local cached content in a separate MAP
    settings.owlImportsLocal = settings.owlImportsLocal || {};
    settings.owlImportsLocal[iri] = {
      content,
      ext,
      mediaType,
      updatedAt: new Date().toISOString()
    };

    await saveOntologySettings(settings);
    showToast("✅ Ontology import saved", "success");
    openImportsModal(); // refresh
  };
  reader.readAsText(file);
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
  settings[w3cIRI.OWL_IMPORTS] = settings[w3cIRI.OWL_IMPORTS] || [];
  if (!settings[w3cIRI.OWL_IMPORTS].includes(iri)) {
    settings[w3cIRI.OWL_IMPORTS].push(iri);
    await saveOntologySettings(settings);
  }

  iriInput.value = "";
  openImportsModal();
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
  showToast(`✅ ${n} row${n>1?'s':''} added`, "success");
});

// Listeners for removing rows
document.getElementById("remove-rows-btn").addEventListener("click", () => {
  const n = getRowCountInput();
  if (!n) { showToast("Enter a valid row count.", "error"); return; }
  removeRowsFromBottom(n);
  showToast(`🗑️ ${n} row${n>1?'s':''} removed`, "info");
});

// Save predicate management settings from modal
// Called by 'Save' button in Manage Predicates modal
async function saveManagePredicates() {
  try {
    // Persist the in-memory predicateValueModes map
    await savePredicateValueModes();

    showToast('✅ Predicate value modes saved', 'success');
    document.getElementById('manage-predicates-modal').style.display = 'none';
  } catch (e) {
    console.error('[ManagePredicates] saveManagePredicates failed', e);
    showToast('❌ Failed to save predicate value modes', 'error');
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

/**
 * Registers all modal UI event listeners
 */

// Event Listeners for Ontology Settings Management
document.getElementById("ontologySettingsBtn").addEventListener("click", openOntologySettingsModal);
document.getElementById("ontology-base-iri-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-label-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-creator-input").addEventListener("input", updateOntologyPreview);
document.getElementById("ontology-description-input").addEventListener("input", updateOntologyPreview);
document.querySelectorAll('input[name="base-iri-delimiter"]').forEach(radio => {
  radio.addEventListener("change", updateOntologyPreview);
  initializeIriModeToggles()
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

// Event Listeners for Predicate Management
document.getElementById('managePredicatesBtn').addEventListener('click', () => {
  document.getElementById('predicate-iri').value = '';
  renderPredicateModesChecklist('predicate-modes-list');
  document.getElementById('manage-predicates-modal').style.display = 'block';
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
  document.getElementById('ontology-label-input').value = s[w3cIRI.RDFS_LABEL] || '';
  document.getElementById('ontology-creator-input').value = s[w3cIRI.DCTERMS_CREATOR] || '';
  document.getElementById('ontology-description-input').value = s[w3cIRI.DCTERMS_DESCRIPTION] || '';
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
  initHandsontable();
  populateSettingsUi();
  setIsCuratedInForAllRows();
  updateReloadSessionButton();
}

TOM.Core = {
  bootstrap: bootstrapApp,
  getHotInstance: () => hotInstance,
  getCustomPredicates: () => customPredicates.slice(),
  getOntologySettings,
  settingsLoad,
  showToast,
  openInsertDataModal,
  closeInsertDataModal,
  openOntologySettingsModal,
  openImportsModal,
  openPrefixManagerModal,
  confirmAddPredicate,
  saveOntologySettingsFromModal,
  saveRDFtoIndexedDB,
  reloadSavedSession,
  handlePrimarySave,
  handleExport,
  addRowsToTable,
  removeRowsFromBottom,
};
})();
