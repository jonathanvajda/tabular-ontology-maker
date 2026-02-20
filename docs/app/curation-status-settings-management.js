// The IAO property for curation status predicate
const CURATION_PROPERTY = {
  curie: 'obo:IAO_0000114',
  label: 'has curation status',
  iri: 'http://purl.obolibrary.org/obo/IAO_0000114'
};


/**
 * Maps human-readable keys to standard IAO Curation Status objects
 * for both RDF export and cell display (IRI + human-readable label).
 *
 * - UNCURATED: Scenario A (Missing required fields)
 * - METADATA_INCOMPLETE: Scenario B (Required met, all recommended missing)
 * - METADATA_COMPLETE: Scenario C (Required met, some recommended present)
 * - PENDING: Scenario D (Required met, all recommended present)
 */
const CURATION_STATUS = {
  // Tier 1: Missing required metadata (Scenario A)
  UNCURATED: {
    iri: 'http://purl.obolibrary.org/obo/IAO_0000124',
    label: 'uncurated',
    curie: 'obo:IAO_0000124'
  },
  // Tier 2: Required met, but all recommended missing (Scenario B)
  METADATA_INCOMPLETE: {
    iri: 'http://purl.obolibrary.org/obo/IAO_0000123',
    label: 'metadata incomplete',
    curie: 'obo:IAO_0000123'
  },
  // Tier 3: Required met, and some recommended present (Scenario C)
  METADATA_COMPLETE: {
    iri: 'http://purl.obolibrary.org/obo/IAO_0000120',
    label: 'metadata complete',
    curie: 'obo:IAO_0000120'
  },
  // Tier 4: Required met, and all recommended present (Scenario D)
  PENDING: {
    iri: 'http://purl.obolibrary.org/obo/IAO_0000125',
    label: 'pending final vetting',
    curie: 'obo:IAO_0000125'
  },
  // Final state (not in scenarios, but good to have)
  READY_FOR_RELEASE: {
    iri: 'http://purl.obolibrary.org/obo/IAO_0000122',
    label: 'ready for release',
    curie: 'obo:IAO_0000122'
  },
};

// --- Curation Column Index Finder ---
/**
 * Finds the column index for the 'has curation status' property, supporting 
 * lookups by human-readable label, full IRI, or CURIE.
 * This function relies on the globally available hotInstance, iriPrefixes, and curieToIri.
 *
 * @returns {number} The column index, or -1 if not found.
*/
function getCurationStatusColumnIndex() {
  if (!hotInstance) return -1;

  const headers = hotInstance.getColHeader().map(String);

  const targetLabel = CURATION_PROPERTY.label;
  const targetIri = CURATION_PROPERTY.iri;

  // Iterate over all column headers
  for (let c = 0; c < headers.length; c++) {
    const header = headers[c];
    
    // Check 1: Match by Human-Readable Label
    if (header === targetLabel) {
      return c;
    }

    // Check 2 & 3: Match by IRI or CURIE
    try {
      let headerIri = header;
      
      // If the header contains a colon, treat it as a potential CURIE
      if (header.includes(':')) {
        // Use your existing curieToIri function to resolve the CURIE
        const resolvedIri = curieToIri(header); 
        if (resolvedIri) {
            headerIri = resolvedIri;
        }
      }
      
      // Compare the final resolved IRI (or the original header if it was a full IRI)
      if (headerIri === targetIri) {
        return c;
      }
    } catch (e) {
      // Ignore errors from curieToIri (e.g., if a header is an unknown CURIE)
    }
  }

  // If the column is not found, this returns -1, which is the problem point.
  return -1;
}

const curationLogic = {
  /**
   * Calculates the curation status of an ontology element by checking its
   * present predicates against the single normative curation settings object.
   * This is a pure function with no side effects.
   *
   * @param {Set<string>} presentPredicates - A Set of predicate IRIs that have a value for the element (e.g., from a row).
   * @param {Object<string, string>} settings - The normativeCurationSettings object {IRI: 'required'|'recommended'|'optional'}.
   * @returns {{iri: string, label: string, curie: string}} The full status object from CURATION_STATUS.
   * @throws {TypeError} If inputs are invalid.
   */
  calculateCurationStatus: (presentPredicates, settings) => {
    // 1. Input validation
    if (!(presentPredicates instanceof Set)) {
      throw new TypeError("Input 'presentPredicates' must be a Set.");
    }
    if (typeof settings !== 'object' || settings === null) {
      throw new TypeError("Input 'settings' must be a valid object.");
    }

    let missingRequired = 0;
    let missingRecommended = 0;
    let totalRecommended = 0;

    // 2. Iterate over the normative settings (the source of truth) ONCE
    //    We count missing required and missing/total recommended predicates.
    for (const iri in settings) {
      if (Object.prototype.hasOwnProperty.call(settings, iri)) {
        const status = settings[iri];
        const isPresent = presentPredicates.has(iri);

        if (status === 'required') {
          if (!isPresent) {
            missingRequired++;
          }
        } else if (status === 'recommended') {
          totalRecommended++;
          if (!isPresent) {
            missingRecommended++;
          }
        }
      }
    }

    // 3. Apply status rules based on your scenarios

    // Scenario A: Missing one or more required fields.
    // This is the first and most important check.
    if (missingRequired > 0) {
      return CURATION_STATUS.UNCURATED;
    }

    // Edge case: If no fields are 'recommended' (totalRecommended === 0),
    // any row with all 'required' fields is considered complete.
    if (totalRecommended === 0) {
      return CURATION_STATUS.METADATA_COMPLETE;
    }

    // Scenario D: All required met AND all recommended met.
    if (missingRecommended === 0) {
      return CURATION_STATUS.PENDING;
    }

    // Scenario B: All required met BUT all recommended are missing.
    if (missingRecommended === totalRecommended) {
      return CURATION_STATUS.METADATA_INCOMPLETE;
    }

    // Scenario C: All required met AND some (but not all) recommended are met.
    // This is the fallback case.
    return CURATION_STATUS.METADATA_COMPLETE;
  }
};

/**
 * Formats the header of the 'has curation status' column to the human-readable 
 * label with the CURIE in parentheses.
 */
function formatCurationStatusHeader() {
  const curationColIndex = getCurationStatusColumnIndex();
  if (curationColIndex === -1 || !hotInstance) return;

  const formattedLabel = `${CURATION_PROPERTY.label} (${CURATION_PROPERTY.curie})`;

  // Cache current headers to avoid recursion inside HOT's header getter
  const originalHeaders = hotInstance.getColHeader();

  hotInstance.updateSettings({
    colHeaders: (index) => {
      if (index === curationColIndex) return formattedLabel;
      return originalHeaders[index];
    }
  });
}

/**
 * Pure, composable helpers for curation evaluation (side-effect free).
 */
const CurationUtils = {

  /**
   * Resolve a header string to a full IRI, reusing existing utilities and constants.
   * – Passes through full IRIs.
   * – Uses curieToIri for CURIEs.
   * – Maps known base headers to your canonical IRIs.
   *
   * @param {string} header
   * @returns {string|null} predicate IRI or null if not resolvable
   */
  resolveHeaderToIri: (header) => {
    if (!header || typeof header !== 'string') return null;
    const h = header.trim();

    // Match the curation column label exactly
    if (h === CURATION_PROPERTY.label) return CURATION_PROPERTY.iri;

    // Known base headers → IRIs you already use elsewhere
    switch (h) {
      case 'label': return w3cIRI.RDFS_LABEL;
      case 'definition': return w3cIRI.SKOS_DEFINITION;
      case 'element type': return w3cIRI.RDF_TYPE;
      case 'is a': return null; // special (depends on element type); skip here
      case 'is curated in ontology': return w3cIRI.CCO_CURATEDIN;
      default: break;
    }

    // Try CURIE or full IRI via your existing resolver
    return curieToIri(h) || null;
  },

  /**
   * Build a Set of predicate IRIs present for this row, limited to predicates
   * mentioned in normative settings (O(n) by headers).
   *
   * @param {any[]} row - HOT row array
   * @param {string[]} headers - HOT headers array
   * @param {Object<string,'required'|'recommended'|'optional'>} normative
   * @returns {Set<string>}
   * @throws {TypeError} if inputs are invalid
   */
  presentPredicatesFromRow: (row, headers, normative) => {
    if (!Array.isArray(row) || !Array.isArray(headers) || typeof normative !== 'object' || normative === null) {
      throw new TypeError('presentPredicatesFromRow expects (row:Array, headers:Array, normative:Object).');
    }
    const present = new Set();

    // Iterate only over keys present in normative (keeps this focused/DRY)
    for (const iri in normative) {
      if (!Object.prototype.hasOwnProperty.call(normative, iri)) continue;

      // Find the header/column that corresponds to this IRI
      let colIndex = -1;
      for (let c = 0; c < headers.length; c++) {
        const resolved = CurationUtils.resolveHeaderToIri(headers[c]);
        if (resolved === iri) { colIndex = c; break; }
      }
      if (colIndex === -1) continue;

      const val = row[colIndex];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        present.add(iri);
      }
    }
    return present;
  },


  
  /**
   * End-to-end pure computation: get curation status object for a row.
   *
   * @param {any[]} row
   * @param {string[]} headers
   * @param {Object<string,'required'|'recommended'|'optional'>} normative
   * @returns {{iri:string,label:string,curie:string}}
   */
  statusFromRow: (row, headers, normative) => {
    const present = CurationUtils.presentPredicatesFromRow(row, headers, normative);
    return curationLogic.calculateCurationStatus(present, normative);
  }
};

/**
 * Pure utilities for column visibility (Handsontable hiddenColumns plugin).
 */
const ColumnVisibility = {
  /**
   * Decide which column indexes should be hidden given headers + settings.
   * - Hides the "has curation status" column when curation is disabled.
   * - Leaves it visible otherwise.
   *
   * @param {string[]} headers - Table headers (index-aligned with columns).
   * @param {{ curationEnabled?: boolean }} settings - Ontology settings.
   * @returns {number[]} An array of column indexes to hide.
   * @throws {TypeError} If inputs are invalid.
   */
  getHiddenColumns: (headers, settings) => {
    // Input validation
    if (!Array.isArray(headers)) {
      throw new TypeError('getHiddenColumns: headers must be an array of strings.');
    }
    if (settings == null || typeof settings !== 'object') {
      throw new TypeError('getHiddenColumns: settings must be an object.');
    }

    const hidden = [];

    // Only hide the curation column when the feature is disabled
    const curationEnabled = !!settings.curationEnabled;
    if (!curationEnabled) {
      const idx = getCurationStatusColumnIndex(); // you already have this
      if (typeof idx === 'number' && idx >= 0) hidden.push(idx);
    }

    return hidden;
  }
};


/**
 * This set of functions are designed for checking curation status
 * according to either the default or the user's defined requirements.
 * The default is defined in the 'normativeCurationSettings' object,
 * which can be modified by the user. Predicates are categorized as
 * 'required', 'recommended', or 'optional'. Predicates can be added
 * or reassigned by the user. 
 */

// Keep required/recommended sets in sync with normativeCurationSettings
let requiredCurationMetaData = [];
let recommendedCurationMetaData = [];

function recomputeCurationSetsFromNormative() {
  requiredCurationMetaData = Object.entries(normativeCurationSettings)
    .filter(([key, value]) => value === 'required')
    .map(([key]) => key);

  recommendedCurationMetaData = Object.entries(normativeCurationSettings)
    .filter(([key, value]) => value === 'recommended')
    .map(([key]) => key);
}

// Normative curation settings for metadata fields
const normativeCurationSettings = {
  'http://www.w3.org/2000/01/rdf-schema#label': 'required',
  'http://www.w3.org/2004/02/skos/core#definition': 'required',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': 'required',
  'http://www.w3.org/2004/02/skos/core#example': 'recommended',
  'http://www.w3.org/2004/02/skos/core#scopeNote': 'recommended',
  'http://purl.org/dc/terms/bibliographicCitation': 'recommended',
  'https://www.commoncoreontologies.org/ont00001760': 'recommended', // 'is curated in ontology'
  'http://purl.org/dc/terms/creator': 'optional',
  'http://purl.org/dc/terms/created': 'optional',
};


// ===============================
// Curation status core (UI-agnostic)
// ===============================

// Public shape stored in memory per row
// curationStatusByRow.get(rowIndex) -> { status, missingRequired, missingRecommended, presentPredicates }
const curationStatusByRow = new Map();

// Read current category for a predicate from normativeCurationSettings (default: optional)
function getCurrentCategory(predIri) {
  return normativeCurationSettings[predIri] || 'optional';
}

// Persist a change back into normativeCurationSettings
function setCurrentCategory(predIri, category) {
  normativeCurationSettings[predIri] = category;
}

// Evaluate one row against the normative settings
// NOTE: This function assumes that normativeCurationSettings, hotInstance,
// hasValue, presentPredicatesForRow, and curationLogic are available in scope.
function evaluateRowCuration(rowIndex) {
  // Use the single source of truth for curation standards
  const settings = normativeCurationSettings; 
  
  if (!hotInstance) return;

  const curationCol = getCurationStatusColumnIndex();
  if (curationCol === -1) {
    // Column isn’t available yet (disabled or not inserted); skip safely
    return null;
  }

  const headers = hotInstance.getColHeader();
  const row = hotInstance.getSourceDataAtRow(rowIndex);

  // Alias for the uncurated status object from the new CURATION_STATUS map
  const UNC = CURATION_STATUS.UNCURATED; 

  // If the row is effectively empty (no IRI, type, label, def, is a), mark uncurated.
  const coarseNonEmpty = [0,1,2,3,4].some(c => hasValue(row?.[c]));
  
  // Calculate the predicates present in the row using your existing utility
  const present = presentPredicatesForRow(row, headers);

  let statusObject;
  let missingRequired;
  let missingRecommended;

  if (!coarseNonEmpty) {
    // Empty row: set status to UNCURATED
    statusObject = UNC;
    
    // For the result object, list all required/recommended items as missing
    missingRequired = Object.keys(settings).filter(iri => settings[iri] === 'required'); 
    missingRecommended = Object.keys(settings).filter(iri => settings[iri] === 'recommended');
    
  } else {
    // Non-empty row: run the core calculation logic
    
    // 1. Call the new pure function
    statusObject = curationLogic.calculateCurationStatus(present, settings);

    // 2. Compute missing gaps for the result object (used for details/debugging)
    missingRequired = Object.keys(settings).filter(iri => 
      settings[iri] === 'required' && !present.has(iri)
    );
    missingRecommended = Object.keys(settings).filter(iri => 
      settings[iri] === 'recommended' && !present.has(iri)
    );
  }

  // 3. Prepare the value for HandsOnTable cell display
  // Format: 'metadata complete (obo:IAO_0000120)'
  const cellValue = `${statusObject.label} (${statusObject.curie})`;
  
  // 4. Update the status cell
  if (hotInstance.getDataAtCell(rowIndex, curationCol) !== cellValue) {
    hotInstance.setDataAtCell(rowIndex, curationCol, cellValue, 'curation-eval');
  }

  // 5. Store and return the result
  const result = { 
    status: statusObject, 
    missingRequired, 
    missingRecommended, 
    presentPredicates: present 
  };
  
  curationStatusByRow.set(rowIndex, result);
  return result;
}

/**
 * Iterates through all non-empty rows and evaluates their curation status.
 * This is the function called by the 'update all rows now' button and dynamic updates.
 */
function evaluateAllRowsCuration() {
    if (!hotInstance) return;
    
    const curationColIndex = getCurationStatusColumnIndex();
    if (curationColIndex === -1) {
        console.error("Curation Status column not found. Cannot evaluate rows.");
        return; 
    }

    // Use begin/end batch updates for performance when updating many rows
    hotInstance.batch(() => {
        const rowCount = hotInstance.countRows();
        for (let i = 0; i < rowCount; i++) {
            evaluateRowCuration(i); 
        }
    });
}

// Add this listener to your initialization logic to enable the button
document.getElementById("update-curation-statuses-btn").addEventListener("click", evaluateAllRowsCuration);

// For the 'Dynamic' option: 
// You need to conditionally add/remove the 'afterChange' hook based on the user's setting.

function toggleDynamicCuration(isDynamic) {
    if (isDynamic) {
        // Add hook: Re-evaluate all rows after data changes
        // NOTE: This runs on every change, which may be slow. A better approach is to
        // run evaluateRowCuration only on the specific rows that changed (changes[c][0]).
        hotInstance.addHook('afterChange', evaluateAllRowsCuration);
    } else {
        // Remove hook for 'Manual' mode
        hotInstance.removeHook('afterChange', evaluateAllRowsCuration);
    }
}


/**
 * Generates the full list of predicates for the Curation Settings modal, 
 * marking any predicate found in the table but not in settings as 'optional' by default.
 * * @returns {Object<string, string>} A map of {IRI: 'required'|'recommended'|'optional'}
 */
function getFullModalCurationSettings() {
    const allTablePredicates = getAllTablePredicates();
    // Start with the existing settings (which define required/recommended)
    const modalSettings = { ...normativeCurationSettings }; 

    // Merge table predicates into the settings map
    for (const iri of allTablePredicates) {
        // If the predicate is in the table but NOT yet in settings, 
        // add it as 'optional' by default.
        if (!modalSettings[iri]) {
            modalSettings[iri] = 'optional';
        }
    }
    // All predicates used in the table are now included and categorized.
    return modalSettings;
}

// Your modal window logic should call getFullModalCurationSettings() when building the list of options.

/**
 * Adds the 'has curation status' column if needed, ensuring it's hidden 
 * by default and its header is correctly formatted.
 * This is called when Curation Status is enabled.
 * * NOTE: Assumes CURATION_PROPERTY and formatCurationStatusHeader are defined.
 */
function ensureCurationStatusColumn(isEnabled) {
    if (!hotInstance) return;

    const curationColIndex = getCurationStatusColumnIndex();
    const headers = hotInstance.getColHeader();
    
    // Check if the column is already the last column (the only place we add it)
    const isLastColumn = (curationColIndex === headers.length - 1);

    if (isEnabled) {
        if (curationColIndex < 0) {
            console.warn('[Curation] Curation column missing from schema. Add it to getColumnHeaders()/getColumnDefinitions().');
              return;
        }
        const current = hotInstance.getSettings()?.hiddenColumns || {};
        const curList = Array.isArray(current.columns) ? [...current.columns] : [];

        const has = curList.includes(curationColIndex);
        const wantHidden = !isEnabled;

        // toggle
        const nextList = wantHidden ? Array.from(new Set([...curList, curationColIndex]))
                                    : curList.filter(i => i !== curationColIndex);

        hotInstance.updateSettings({
          hiddenColumns: {
            ...current,
            columns: nextList,
            indicators: true
          }
        }); 
        
        if (!wantHidden) {
          try { formatCurationStatusHeader?.(); } catch (_) {}
        }
    } 
    
    // Trigger a full evaluation after column changes
    evaluateAllRowsCuration?.();
}

// ===============================
// Optional: lightweight HOT wiring
// (safe to leave out if you prefer manual calls)
// ===============================
function attachCurationHooks() {
  if (!hotInstance) return;

  // Initial sweep
  evaluateAllRowsCuration();

  // Re-evaluate changed rows only
  hotInstance.addHook('afterChange', (changes, source) => {
    if (!Array.isArray(changes) || source === 'LoadData' || source === 'curation-eval') return;
    const touched = new Set(changes.map(ch => ch[0]).filter(i => Number.isInteger(i)));
    for (const r of touched) evaluateRowCuration(r);
  });

  // When rows are created/removed, re-check the table
  hotInstance.addHook('afterCreateRow', () => evaluateAllRowsCuration());
  hotInstance.addHook('afterRemoveRow', () => evaluateAllRowsCuration());
}

/**
 * This function retrieves the IRI for a given row index.
 * @description Used for identifying which term's bulb to refresh.
 * @param {*} rowIndex 
 * @returns 
 */
function iriForRow(rowIndex) {
  const iri = hotInstance?.getSourceDataAtRow(rowIndex)?.[0];
  return (typeof iri === 'string' && iri.trim()) ? iri.trim() : null;
}


// Call this once right after your existing attachHotHooks()
function initCurationStatusEngine() {
  attachCurationHooks();          // keeps curationStatusByRow up-to-date
  evaluateAllRowsCuration();      // initial sweep

  // Repaint touched rows after edits
  hotInstance.addHook('afterChange', (changes, source) => {
    if (!Array.isArray(changes) || source === 'LoadData') return;
    const touched = new Set(changes.map(c => c[0]).filter(Number.isInteger));
    for (const r of touched) {
      const iri = iriForRow(r);
      const status = curationStatusByRow.get(r)?.status || CURATION_STATUS.UNCURATED;
    }
  });

  // Re-sync on structure/ordering changes
  const reSync = () => { evaluateAllRowsCuration(); };
  hotInstance.addHook('afterCreateRow', reSync);
  hotInstance.addHook('afterRemoveRow', reSync);
  hotInstance.addHook('afterColumnSort', reSync);
  // If you use Filters plugin:
  if (typeof hotInstance.addHook === 'function') {
    hotInstance.addHook?.('afterFilter', reSync);
  }
}

// Call this once on startup (so your evaluator has the arrays ready)
recomputeCurationSetsFromNormative();

let CURATION_SNAPSHOT = null;

/**
 * Populates the 'toggle-curation-settings' container with one row per predicate:
 * [ Required ()  Recommended ()  Optional () ]   <nice label>
 *
 * It reflects the existing normativeCurationSettings and writes back on change.
 */
function populateCurationSettingsToggleUI() {
  try {
    const tbody = document.getElementById('toggle-curation-settings'); // <tbody>
    if (!tbody) return;

    const ordered = [
      w3cIRI.RDF_TYPE,
      w3cIRI.RDFS_LABEL,
      w3cIRI.SKOS_DEFINITION,
      'isAGroup',
      w3cIRI.CCO_CURATEDIN,
      // any others derived dynamically
    ];

    // 1) Build the exact order you want
    const base = collectPredicateIrisFromHeaders();
    const rest = base.filter(predicate =>
      predicate !== w3cIRI.RDF_TYPE &&
      predicate !== w3cIRI.RDFS_LABEL &&
      predicate !== w3cIRI.SKOS_DEFINITION &&
      predicate !== w3cIRI.RDFS_SUBCLASS &&
      predicate !== w3cIRI.RDFS_SUBPROP
    ).sort((a,b) => iriToNiceLabel(a).localeCompare(iriToNiceLabel(b)));

    // 2) Snapshot current categories (to know what changed)
    CURATION_SNAPSHOT = {
      singles: new Map(),
      isa: {
        subClassOf:  getCurrentCategory(w3cIRI.RDFS_SUBCLASS)  || 'required',
        subProperty: getCurrentCategory(w3cIRI.RDFS_SUBPROP) || 'required'
      }
    };
    [w3cIRI.RDF_TYPE, w3cIRI.RDFS_LABEL, w3cIRI.SKOS_DEFINITION, ...rest].forEach(iri => {
      CURATION_SNAPSHOT.singles.set(iri, getCurrentCategory(iri) || 'optional');
    });

    // 3) Render rows
    tbody.innerHTML = '';

    const makeRadioCell = (name, value, checked, onChange) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = !!checked;
      input.addEventListener('change', onChange);
      td.appendChild(input);
      return td;
    };

    // — single predicate row
    const renderSingle = (predIri) => {
      const tr = document.createElement('tr');
      tr.style.textAlign = "center";

      const labelTd = document.createElement('td');
      labelTd.textContent = iriToNiceLabel(predIri);
      labelTd.title = predIri;
      tr.appendChild(labelTd);

      const current = getCurrentCategory(predIri) || 'optional';

      ['required', 'recommended', 'optional'].forEach(val => {
        tr.appendChild(makeRadioCell(
          `curate-${predIri}`,
          val,
          current === val,
          async () => {
            setCurrentCategory(predIri, val);
            recomputeCurationSetsFromNormative();
            evaluateAllRowsCuration();
            const s = getOntologySettings();
            s.curationRules = { ...normativeCurationSettings };
            await saveOntologySettings(s);

            const original = CURATION_SNAPSHOT.singles.get(predIri);
            tr.classList.toggle('changed-row', original !== val);
          }
        ));
      });

      tbody.appendChild(tr);
    };

    // — “is a” group row (single row for both predicates)
    const renderIsAGroup = () => {
      // only render if either predicate exists in headers
      const present = base.includes(w3cIRI.RDFS_SUBCLASS) || base.includes(w3cIRI.RDFS_SUBPROP);
      if (!present) return;

      const tr = document.createElement('tr');
      tr.style.textAlign = "center";

      const labelTd = document.createElement('td');
      labelTd.textContent = 'is a';
      labelTd.title = `${w3cIRI.RDFS_SUBCLASS} & ${w3cIRI.RDFS_SUBPROP}`;
      tr.appendChild(labelTd);

      // current: if both have same category, show it; else show none selected
      const c1 = getCurrentCategory(w3cIRI.RDFS_SUBCLASS)  || 'optional';
      const c2 = getCurrentCategory(w3cIRI.RDFS_SUBPROP) || 'optional';
      const same = (c1 === c2);
      const current = same ? c1 : null;

      const onChange = async (val) => {
        setCurrentCategory(w3cIRI.RDFS_SUBCLASS,  val);
        setCurrentCategory(w3cIRI.RDFS_SUBPROP, val);
        recomputeCurationSetsFromNormative();
        evaluateAllRowsCuration();
        const s = getOntologySettings();
        s.curationRules = { ...normativeCurationSettings };
        await saveOntologySettings(s);

        const snap = CURATION_SNAPSHOT.isa;
        const changed = (snap.w3cIRI.RDFS_SUBCLASS !== val) || (snap.w3cIRI.RDFS_SUBPROP !== val);
        tr.classList.toggle('changed-row', changed);
      };

      ['required', 'recommended', 'optional'].forEach(val => {
        tr.appendChild(makeRadioCell('curate-is-a', val, current === val, () => onChange(val)));
      });

      tbody.appendChild(tr);
    };

    // Drive the ordered render
    ordered.forEach(item => {
      if (item === 'isAGroup') renderIsAGroup();
      else renderSingle(item);
    });

  } catch (e) {
    console.error('[curation] populateCurationSettingsToggleUI failed', e);
  }
}

// This function saves the curation settings (what predicates are required or recommended) from the Curation Settings modal.
function saveCurationSettings() {
  try {
    // Read visibility checkboxes and persist by name
    const hiddenNames = [];
    document
      .querySelectorAll('#toggle-curation-settings input[name="curationReqRecOpt"]')
      .forEach(cb => {
        const name = cb.dataset.name;
        if (!cb.checked) hiddenNames.push(name); // unchecked = hidden
      });

    saveHiddenColumnNames(hiddenNames);
    applyHiddenColumnsByName();

    // Close modal
    document.getElementById('curation-settings-modal').style.display = 'none';
    showToast('✅ Saved curation-status settings', 'success');
  } catch (e) {
    console.error('[CurationSettings] saveCurationSettings failed', e);
    showToast('❌ Failed to save curation-status settings', 'error');
  }
}

/**
 * Reads the Curation Settings modal to see if the user wants
 * dynamic (on-change) or manual status updates.
 *
 * @returns {string} 'Dynamic' or 'Manual'
 */
function getCurationModeSetting() {
  // Find the 'Dynamic' radio button
  const dynamicRadio = document.getElementById('curation-status-updates-setting-dynamic');

  if (dynamicRadio && dynamicRadio.checked) {
    return 'Dynamic';
  }

  // Default to 'Manual' if dynamic isn't checked or isn't found
  return 'Manual';
}

/**
 * Pure accessor that returns whether curation is enabled, based on a settings object.
 * @param {{ curationEnabled?: boolean }|null|undefined} settings
 * @returns {boolean} True if enabled, else false.
 */
const SettingsAccessors = {
  /** 
   * @param {{ curationEnabled?: boolean }|null|undefined} settings 
   * @returns {boolean}
   */
  getCurationEnabled: (settings) => {
    // Input validation
    if (settings == null || typeof settings !== 'object') return false;
    return !!settings.curationEnabled;
  }
};

/**
 * Backward-compatible wrapper used by existing code.
 * Reads the current ontology settings and returns the flag.
 * (Side-effect free with respect to the app state; only reads.)
 * @returns {boolean}
 */
function getCurationEnabledSetting() {
  const s = getOntologySettings(); // you already have this
  return SettingsAccessors.getCurationEnabled(s);
}


// --- Handler for 'Curation Settings' Modal Save & Close ---
function handleCurationSettingsSave() {
    // 1. Read the state of the "Enable Curation Status Updates" checkbox
    const isCurationEnabled = getCurationEnabledSetting();
    
    // 2. Add/Remove the column based on the setting
    ensureCurationStatusColumn(isCurationEnabled);
    
    // 3. Toggle dynamic update mode (Issue 2 fix)
    const curationMode = getCurationModeSetting(); // 'Dynamic' or 'Manual'
    toggleDynamicCuration(curationMode === 'Dynamic');
    
    // Re-read settings and recompute visibility
    const headers = hotInstance.getColHeader();            // snapshot of current headers
    const settings = getOntologySettings();                // latest cache
    const toHide = ColumnVisibility.getHiddenColumns(headers, settings);
    applyHiddenColumns(toHide);
}

// Open Curation Settings Modal
document.getElementById('curationSettingsBtn').addEventListener('click', () => {
  populateCurationSettingsToggleUI();
  document.getElementById('curation-settings-modal').style.display = 'block';
});

// Curation Settings Modal Save & Close
document.getElementById('curation-settings-save-btn').addEventListener('click', () => {
  handleCurationSettingsSave();
  document.getElementById('curation-settings-modal').style.display = 'none';
  })

// Curation Settings Modal Cancel
document.getElementById('curation-settings-cancel-btn').addEventListener('click', () => {
    document.getElementById('curation-settings-modal').style.display = 'none';
  });

// This function handles the 'curation-status-tracking' radio buttons in the Curation Settings modal, that on change of disable to enable, it will display the 'curation-status-tracking-settings-div', and upon change of enable to disable, it will hide the 'curation-status-tracking-settings-div'.
document.getElementsByName('curation-status-tracking').forEach(radio => {
  radio.addEventListener('change', (event) => {
    const settingsDiv = document.getElementById('curation-status-tracking-settings-div');
    if (event.target.value === 'enable') {
      settingsDiv.style.display = 'block';
      try {
        initCurationStatusEngine();
        console.info('[CurationSettings] Curation Status Engine initialized successfully.');
      } catch (e) {
        console.error('[CurationSettings] Curation Status Engine failed to initialize.', e);
      }
    } else {
      settingsDiv.style.display = 'none';
    }
  });
});