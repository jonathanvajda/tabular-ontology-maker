// Copyright 2025 Jonathan Vajda

let customPredicates = [];
let hotInstance = null;
let currentImportFile = null;
const container = document.getElementById('hot');
const output = document.getElementById('rdfOutput');

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
      return 'rdfs:subClassOf';
    case 'ObjectProperty':
    case 'DatatypeProperty':
    case 'AnnotationProperty':
      return 'rdfs:subPropertyOf';
    case 'NamedIndividual':
      return 'rdf:type';
    default:
      return null;
  }
};


/*
  These functions are used to manage ontology settings:
    generateOntologySettings creates a default ontology settings object and saves it to localStorage.
    loadOntologySettings retrieves the ontology settings from localStorage or generates default settings if none exist.
    openOntologySettingsModal opens a modal to edit the ontology settings.
    saveOntologySettingsFromModal saves the edited ontology settings back to localStorage.
    openImportsModal opens a modal to manage ontology imports.
    handleImportFileUpload handles the upload of ontology import files and validates them.
    addImportIRI adds a new import IRI to the ontology settings.
    saveImportsAndClose saves the current imports and closes the modal.
    
*/

function getSelectedDelimiter() {
  const selected = document.querySelector('input[name="base-iri-delimiter"]:checked');
  return selected ? selected.value : "/";
}

function updateOntologyPreview() {
  const base = document.getElementById("ontology-base-iri-input").value;
  const label = document.getElementById("ontology-label-input").value;
  const creator = document.getElementById("ontology-creator-input").value;
  const description = document.getElementById("ontology-description-input").value;
  const delimiter = getSelectedDelimiter();

  const settings = generateOntologySettings(base, label, creator, description, delimiter);

  document.getElementById("version-iri-preview").textContent = settings["owl:versionIRI"];
  document.getElementById("version-info-preview").textContent = settings["owl:versionInfo"];
}

function generateOntologySettings(base = "http://example.org", label = "Example Ontology", creator = "Barry Guarino", description = "An example ontology", delimiter = "/") {
  const { year, month, day } = getCurrentDateParts();
  const normalizedLabel = toPascalCase(label);

  const settings = {
    "iri": `${base}${delimiter}${normalizedLabel}`,
    "owl:versionIRI": `${base}/${year}-${month}-${day}${delimiter}${normalizedLabel}`,
    "owl:versionInfo": `${year}-${month}-${day}`,
    "rdfs:label": label,
    "dcterms:creator": creator,
    "dcterms:description": description
  };

  localStorage.setItem("ontologySettings", JSON.stringify(settings));
  return settings;
}

function loadOntologySettings() {
  const stored = localStorage.getItem('ontologySettings');
  return stored ? JSON.parse(stored) : generateOntologySettings();
}

function openOntologySettingsModal() {
  const modal = document.getElementById("ontology-settings-modal");
  const settings = loadOntologySettings();
  document.getElementById("ontology-base-iri-input").value = settings.iri.split("/").slice(0, -1).join("/");
  document.getElementById("ontology-label-input").value = settings["rdfs:label"];
  document.getElementById("ontology-creator-input").value = settings["dcterms:creator"];
  document.getElementById("ontology-description-input").value = settings["dcterms:description"];
  modal.style.display = "block";
  // Example: after showing the modal
  document.getElementById("ontology-settings-modal").style.display = "block";
  updateOntologyPreview(); // This forces preview to populate based on initial values
}

function saveOntologySettingsFromModal() {
  const base = document.getElementById("ontology-base-iri-input").value.trim();
  const label = document.getElementById("ontology-label-input").value.trim();
  const creator = document.getElementById("ontology-creator-input").value.trim();
  const description = document.getElementById("ontology-description-input").value.trim();
  const delimiter = getSelectedDelimiter();
  generateOntologySettings(base, label, creator, description, delimiter);
  document.getElementById("ontology-settings-modal").style.display = "none";
}


const getColumnDefinitions = () => {
  console.info('getColumnDefinitions happened');
  console.log(window.Handsontable);
  return [
    { type: 'text' }, // IRI
    { type: 'text' }, // Label
    { type: 'dropdown',
            source: getElementTypes(),
            strict: true,
            allowInvalid: false
      }, // Element Type
    { type: 'text' }, // Definition
    { type: 'text' }, // Is A (object only)
    { type: 'text' } // cco2:ont00001760 ('is curated in ontology')
  ];
};

const getInitialData = () => {
  console.info('getInitialData happened');
  return [
    ["ex:Person", "Person", "Class", "A human person.", "ex:Agent", "http://example.org/ExampleOntology"],
    ["ex:Bob", "Bob", "NamedIndividual", "An instance of a Person.", "ex:Person", "http://example.org/ExampleOntology"],
    ["ex:hasVehicle", "has vehicle", "ObjectProperty", "x hasVehicle y iff x possesses y and y is a Vehicle.", "ex:Owns", "http://example.org/ExampleOntology"],
    ["ex:Automobile", "Automobile", "Class", "A ground vehicle that is designed to transport passengers.", "ex:GroundVehicle", "http://example.org/ExampleOntology"],
    ["", "", "", "", "", ""]
];
};

const getColumnHeaders = () => {
  console.info('getColumnHeaders happened');
  return ["iri", "label", "element type", "definition", "is a", "is curated in ontology"].concat(customPredicates);
};

const createTable = (container, data, colHeaders, columns) => {
  console.info('createTable happened');
  return new Handsontable(container, {
    
    data: data,
    colHeaders: colHeaders,
    columns: columns,
    rowHeaders: true,
    contextMenu: true,
    hiddenColumns: { columns: loadHiddenColumns(), indicators: true }, // little triangle indicator
    licenseKey: 'non-commercial-and-evaluation'
  });
};

//
function saveHiddenColumns(indices) {
  try {
    localStorage.setItem('hiddenColumns', JSON.stringify(indices || []));
    console.info('[ManageColumns] Saved hidden columns:', indices);
  } catch (e) {
    console.error('[ManageColumns] Failed saving hidden columns', e);
  }
}

function loadHiddenColumns() {
  try {
    var raw = localStorage.getItem('hiddenColumns');
    var arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    console.error('[ManageColumns] Failed loading hidden columns', e);
    return [];
  }
}

function applyHiddenColumnsToHot() {
  try {
    var indices = loadHiddenColumns();
    hotInstance.updateSettings({ hiddenColumns: { columns: indices, indicators: true } });
    console.info('[ManageColumns] Applied hidden columns to table:', indices);
  } catch (e) {
    console.error('[ManageColumns] Failed applying hidden columns', e);
  }
}



// Applies hidden columns to the current Handsontable instance
function loadHiddenColumnNames() {
  try {
    const raw = localStorage.getItem('hiddenColumnNames');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('[ManagePredicates] loadHiddenColumnNames failed', e);
    return [];
  }
}

// Returns array of hidden column indices for current HOT instance
function saveHiddenColumnNames(names) {
  try {
    localStorage.setItem('hiddenColumnNames', JSON.stringify(names || []));
    console.info('[ManagePredicates] Saved hidden names:', names);
  } catch (e) {
    console.error('[ManagePredicates] saveHiddenColumnNames failed', e);
  }
}

/** Apply hidden names to current HOT by mapping names -> indices */
function applyHiddenColumnsByName() {
  if (!hotInstance) return;
  try {
    const headers = hotInstance.getColHeader();
    const hiddenNames = new Set(loadHiddenColumnNames());
    const indices = [];
    headers.forEach((h, i) => {
      if (hiddenNames.has(String(h))) indices.push(i);
    });
    hotInstance.updateSettings({ hiddenColumns: { columns: indices, indicators: true }});
    console.info('[ManagePredicates] Applied hidden columns:', indices, '(names=', [...hiddenNames], ')');
  } catch (e) {
    console.error('[ManagePredicates] applyHiddenColumnsByName failed', e);
  }
}

// Applies hidden columns to current HOT instance
function populateColumnsToggleUI() {
  try {
    const container = document.getElementById('columns-toggle-list');
    if (!container) return;
    const headers = hotInstance.getColHeader();
    const hidden = new Set(loadHiddenColumnNames());

    container.innerHTML = '';
    headers.forEach((name, idx) => {
      const safeId = 'colvis-' + btoa(String(name)).replace(/=/g, '');
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.margin = '4px 0';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = safeId;
      cb.dataset.name = String(name);
      // checked = visible; unchecked = hidden
      cb.checked = !hidden.has(String(name));

      const label = document.createElement('label');
      label.htmlFor = safeId;
      label.textContent = String(name);

      row.appendChild(cb);
      row.appendChild(label);
      container.appendChild(row);
    });
  } catch (e) {
    console.error('[ManagePredicates] populateColumnsToggleUI failed', e);
  }
}



hotInstance = createTable(container, getInitialData(), getColumnHeaders(), getColumnDefinitions(), applyHiddenColumnsToHot());

/**
 * Sets cco2:ont00001760 ('is curated in ontology') value for rows with empty cells in that column,
 * using the ontology's IRI from ontology settings.
 */
function setIsCuratedInForAllRows() {
  const settings = JSON.parse(localStorage.getItem("ontologySettings") || "{}");
  const ontologyIRI = settings["iri"];

  if (!ontologyIRI) {
    console.warn("[setIsCuratedInForAllRows] Ontology IRI not found in settings");
    return;
  }

  const headers = hotInstance.getColHeader();
  const columnIndex = headers.indexOf("is curated in");

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


setIsCuratedInForAllRows(); // This uses the ontology IRI from localStorage


window.getIsAPredicateForRow = (rowIndex) => {
  const row = hot.getSourceDataAtRow(rowIndex);
  const elementType = row ? row[2] : null;
  return getIsAPredicate(elementType);
};

// This set of functions are used for outputting RDF.
// getOntologyIRI retrieves the ontology IRI from localStorage or returns a default value.
// generateRdfString takes the rows of the Handsontable instance and converts them into an RDF string in the specified format.
// handleExport generates the file

function getOntologyIRI() {
  const settings = JSON.parse(localStorage.getItem('ontologySettings') || '{}');
  return settings.iri || "http://example.org/ExampleOntology";
}

const generateRdfString = (rows, format = 'ttl') => {
  console.info('generateRdfString happened');
  const formatMap = {
    ttl: 'Turtle',
    rdf: 'RDF/XML',
    jsonld: 'JSON-LD',
    nt: 'N-Triples',
    trig: 'TriG'
  };
  const writer = new N3.Writer({ prefixes: iriPrefixes, format: formatMap[format] || 'Turtle' });

  const settings = loadOntologySettings();
  const ontologyIRI = settings["iri"];

  writer.addQuad(
    N3.DataFactory.namedNode(ontologyIRI),
    N3.DataFactory.namedNode('rdf:type'),
    N3.DataFactory.namedNode('owl:Ontology')
  );

  Object.entries(settings).forEach(([key, value]) => {
    if (key === "iri") return; // already handled
    if (key === "owl:imports" && Array.isArray(value)) {
      value.forEach(importIRI => {
        writer.addQuad(
          N3.DataFactory.namedNode(ontologyIRI),
          N3.DataFactory.namedNode('owl:imports'),
          N3.DataFactory.namedNode(importIRI)
        );
      });
    } else if (value) {
      writer.addQuad(
        N3.DataFactory.namedNode(ontologyIRI),
        N3.DataFactory.namedNode(key),
        N3.DataFactory.literal(value)
      );
    }
  });


  rows.forEach((row) => {
    const [subject, label, type, definition, isAObject, isCuratedInOntology] = row;
    if (!subject || !type) return;

    writer.addQuad(N3.DataFactory.namedNode(subject),
      N3.DataFactory.namedNode('rdf:type'),
      N3.DataFactory.namedNode(`owl:${type}`));

    if (label) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode('rdfs:label'),
        N3.DataFactory.literal(label));
    }

    if (definition) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode('skos:definition'),
        N3.DataFactory.literal(definition));
    }

    const isAPredicate = getIsAPredicate(type);
    if (isAPredicate && isAObject) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode(isAPredicate),
        N3.DataFactory.namedNode(isAObject));
    }

    if (isCuratedInOntology) {
      writer.addQuad(N3.DataFactory.namedNode(subject),
        N3.DataFactory.namedNode('cco2:ont00001760'), // 'cco2:ont00001760' is curated in ontology
        N3.DataFactory.literal(isCuratedInOntology));
    }

    customPredicates.forEach((predicate, index) => {
      const cellValue = row[5 + index]; // Adjust index based on original 5-column setup
      if (cellValue) {
        writer.addQuad(N3.DataFactory.namedNode(subject),
          N3.DataFactory.namedNode(predicate),
          N3.DataFactory.literal(cellValue));
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

const handleExport = async (shouldDownload = false) => {
  console.info('handleExport happened');
  const rows = hotInstance.getData();
  const format = document.getElementById('exportFormat').value;

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

// This is called by generateOntologySettings to get the current date parts
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

// This set of functions handle the prefixes

// Prefix Manager Logic

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
  iofcore: 'https://spec.industrialontologies.org/ontology/core/',
  ex: 'http://example.org/'
};

// Show Prefix Manager modal
function showPrefixManagerModal() {
  populatePrefixTable();
  document.getElementById('prefix-manager-modal').style.display = 'block';
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
    removeBtn.textContent = '❌';
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


function openImportsModal() {
  const modal = document.getElementById("ontology-imports-modal");
  const listContainer = document.getElementById("import-list");
  listContainer.innerHTML = "";

  const settings = loadOntologySettings();
  const imports = settings["owl:imports"] || [];

  imports.forEach((iri) => {
    const localKey = `import:${iri}`;
    const isLoaded = !!localStorage.getItem(localKey);
    const statusIcon = isLoaded ? "✅" : "❌";

    const div = document.createElement("div");
    div.innerHTML = `
      <div style="margin-bottom:10px">
        <strong>${iri}</strong> ${statusIcon}<br>
        <input type="file" onchange="handleImportFileUpload(event, '${iri}')">
        <span id="validation-${btoa(iri)}" style="color:red; display:none;"></span>
      </div>`;
    listContainer.appendChild(div);
  });

  modal.style.display = "block";
}

function handleImportFileUpload(event, iri) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const validationMsg = document.getElementById(`validation-${btoa(iri)}`);

    if (!isValidOntology(content)) {
      validationMsg.textContent = "⚠️ Not a valid RDF/OWL file";
      validationMsg.style.display = "inline";
      console.warn(`Rejected file for ${iri}`);
      return;
    }

    localStorage.setItem(`import:${iri}`, content);
    validationMsg.style.display = "none";
    console.info(`Loaded valid ontology for ${iri}`);
    openImportsModal();
  };
  reader.readAsText(file);
}

function addImportIRI() {
  const iriInput = document.getElementById("new-import-iri");
  const iri = iriInput.value.trim();
  if (!iri) return;

  const settings = loadOntologySettings();
  settings["owl:imports"] = settings["owl:imports"] || [];
  if (!settings["owl:imports"].includes(iri)) {
    settings["owl:imports"].push(iri);
    localStorage.setItem('ontologySettings', JSON.stringify(settings));
  }

  iriInput.value = "";
  openImportsModal();
}

function saveImportsAndClose() {
  document.getElementById("ontology-imports-modal").style.display = "none";
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

// This function adds n blank rows to the bottom of the Handsontable instance.
function addRowsToTable(n = 1) {
  if (!hotInstance || n < 1) return;
  const blankRow = getColumnHeaders().map(() => "");
  const newRows = Array.from({ length: n }, () => [...blankRow]);
  const current = hotInstance.getData();
  hotInstance.loadData([...current, ...newRows]);
}

// This function deletes n rows from the bottom of the Handsontable instance.
function removeRowsFromBottom(n = 1) {
  if (!hotInstance || n < 1) return;
  const total = hotInstance.countRows();
  const toRemove = Math.min(n, total);
  if (toRemove > 0) hotInstance.alter("remove_row", total - toRemove, toRemove);
}


/*
  These functions are used to manage predicates:
    confirmAddPredicate adds a new predicate to the ontology spreadsheet.
*/

function confirmAddPredicate() {
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

        // Rebuild table with new predicate column appended
        const newHeaders = getColumnHeaders();
        const newColumns = getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' })));
        const oldData = hotInstance.getData();
        const elementTypes = getElementTypes();

        const cleanedRows = oldData.map(row => {
          const fixedRow = [...row];
          if (!elementTypes.includes(fixedRow[2])) fixedRow[2] = '';
          const baseCols = getColumnHeaders().length; // count base headers
          const existingCustomCount = Math.max(0, fixedRow.length - baseCols);
          const missing = customPredicates.length - existingCustomCount;
          return fixedRow.concat(Array(missing).fill(''));
        });

        hotInstance.destroy();
        hotInstance = createTable(container, cleanedRows, newHeaders, newColumns);
      }
    }

    // 2) Read visibility checkboxes and persist
    const hiddenNames = [];
    document.querySelectorAll('#columns-toggle-list input[type="checkbox"]').forEach(cb => {
      const name = cb.dataset.name;
      if (!cb.checked) hiddenNames.push(name); // unchecked = hidden
    });
    saveHiddenColumnNames(hiddenNames);

    // 3) Apply to HOT
    applyHiddenColumnsByName();

    // 4) Close modal
    showToast('✅ Predicates/columns updated', 'success');
  } catch (e) {
    console.error('[ManagePredicates] confirmAddPredicate failed', e);
    showToast('❌ Failed to update predicates/columns', 'error');
  }
}

// This function saves the current column visibility settings from the Manage Predicates modal.
// It reads the visibility checkboxes, persists the hidden names, applies them to the current Hands
function saveManagePredicates() {
  try {
    // Read visibility checkboxes and persist by name
    const hiddenNames = [];
    document
      .querySelectorAll('#columns-toggle-list input[type="checkbox"]')
      .forEach(cb => {
        const name = cb.dataset.name;
        if (!cb.checked) hiddenNames.push(name); // unchecked = hidden
      });

    saveHiddenColumnNames(hiddenNames);
    applyHiddenColumnsByName();

    // Close modal
    document.getElementById('manage-predicates-modal').style.display = 'none';
    showToast('✅ Saved predicate management settings', 'success');
  } catch (e) {
    console.error('[ManagePredicates] saveManagePredicates failed', e);
    showToast('❌ Failed to save predicate management settings', 'error');
  }
}

document.getElementById('manage-predicates-save-btn')
  .addEventListener('click', () => {
  saveManagePredicates(); // 👈 save visibility settings
  document.getElementById('manage-predicates-modal').style.display = 'none';})

document.getElementById('manage-predicates-cancel-btn')
  .addEventListener('click', () => {
    document.getElementById('manage-predicates-modal').style.display = 'none';
  });

// When opening the modal, remember to rebuild the checkboxes:
document.getElementById('managePredicatesBtn').addEventListener('click', () => {
  document.getElementById('predicate-iri').value = '';
  populateColumnsToggleUI(); // 👈 ensures the checkboxes reflect current table
  document.getElementById('manage-predicates-modal').style.display = 'block';
});


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
  var fileType = document.querySelector('input[name="file-type"]:checked').value;
  var checkboxContainer = document.getElementById("header-checkbox-container");
  if (fileType === "spreadsheet") {
    checkboxContainer.style.display = "block";
    console.info("[UI] Showing header row checkbox");
  } else {
    checkboxContainer.style.display = "none";
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
    const knownPredicates = getColumnHeaders().concat(customPredicates);

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

    // Rebuild table with merged data
    hotInstance.destroy();
    hotInstance = createTable(
      container,
      mergedRows,
      getColumnHeaders().concat(customPredicates),
      getColumnDefinitions().concat(customPredicates.map(() => ({ type: 'text' }))),
      applyHiddenColumnsToHot()
    );

    
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
    "id": "iri",
    "label": "label",
    "rdfs:label": "label",
    "element type": "element type",
    "type": "element type",
    "rdf:type": "element type",
    "definition": "definition",
    "is a": "is a",
    "subclass of": "is a",
    "rdfs:subclassof": "is a",
    "is curated in": "is curated in",
    "is defined by": "is curated in",
    "is curated in ontology": "is curated in"
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

    const expectedCols = knownPredicates.length;

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

// Attach listener after DOM is ready
document.getElementById("add-rows-btn").addEventListener("click", () => {
  const count = parseInt(document.getElementById("row-count").value, 10);
  if (isNaN(count) || count < 1) {
    alert("Please enter a valid number of rows to add.");
    return;
  }

  addRowsToTable(count);

  // ✅ Toast feedback
  showToast(`✅ ${count} row${count > 1 ? 's' : ''} added to the table`, "success");

  // Optional: Reset the input
  // document.getElementById("add-row-count").value = 1;
});

// Event Listeners for Predicate Management
document.getElementById('managePredicatesBtn').addEventListener('click', () => {
  document.getElementById('predicate-iri').value = '';
  populateColumnsToggleUI();
  document.getElementById('manage-predicates-modal').style.display = 'block';
  });
document.getElementById("manage-prefixes-btn").addEventListener("click", function () {
  openPrefixManagerModal();
});


function setupInsertDataModalListeners() {
  // Open/close buttons
  document.getElementById("importBtn").addEventListener("click", openInsertDataModal);
  document.getElementById('file-input').addEventListener('change', handleFileInputChange);
  document.getElementById("insert-data-save-btn").addEventListener("click", handleInsertDataSave);
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
  }

  // Default state
  handleFileTypeChange();
  }


document.getElementById('previewRdfBtn').addEventListener('click', () => handleExport(false));
document.getElementById('exportBtn').addEventListener('click', () => handleExport(true));

console.info("[Init] Calling setupInsertDataModalListeners()");
setupInsertDataModalListeners();