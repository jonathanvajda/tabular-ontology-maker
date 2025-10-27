
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('hot');
  const output = document.getElementById('rdfOutput');});

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
document.getElementById('saveToDatebaseBtn').addEventListener('click', saveRDFtoIndexedDB);

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

// This set of functions handle the prefixes

// Prefix Manager Logic
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

// This function opens the ontology imports modal and populates it with current imports.
// It retrieves the imports from the ontology settings and displays them with their status.
async function openImportsModal() {
  const modal = document.getElementById("ontology-imports-modal");
  const listContainer = document.getElementById("import-list");
  listContainer.innerHTML = "";

  const settings = await getOntologySettings();
  const imports = settings["owl:imports"] || [];

  imports.forEach((iri) => {
    const localKey = `import:${iri}`;
    const isLoaded = !!getOntologySettings().getItem(localKey);
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


// This function handles the file upload for ontology imports.
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

    getOntologySettings().setItem(`import:${iri}`, content);
    validationMsg.style.display = "none";
    console.info(`Loaded valid ontology for ${iri}`);
    openImportsModal();
  };
  reader.readAsText(file);
}

// This function adds a new import IRI to the ontology settings.
async function addImportIRI() {
  const iriInput = document.getElementById("new-import-iri");
  const iri = iriInput.value.trim();
  if (!iri) return;

  const settings = await getOntologySettings();
  settings["owl:imports"] = settings["owl:imports"] || [];
  if (!settings["owl:imports"].includes(iri)) {
    settings["owl:imports"].push(iri);
  }

  iriInput.value = "";
  openImportsModal();
}

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
  populateColumnsToggleUI();
  document.getElementById('manage-predicates-modal').style.display = 'block';
  });
document.getElementById("managePrefixesBtn").addEventListener("click", function () {
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