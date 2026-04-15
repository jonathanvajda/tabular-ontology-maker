# Feature Checklist

Roadmap: [feature-roadmap.md](d:/GitHub/tabular-ontology-maker/docs/feature-roadmap.md)

## Export and Preview
- [x] Rename `Download RDF` to `Export Data`
- [x] Add `CSV` export option
- [x] Add `JSON-LD` export option
- [x] Keep RDF preview behavior even when `CSV` is selected
- [x] Export CSV from raw stored data rather than rendered table display
- [x] Export `is a` values as resolved IRIs in CSV

## JSON-LD
- [x] Load local `./app/jsonld.min.js`
- [x] Export RDF as compacted JSON-LD
- [x] Preview JSON-LD in the generated output panel
- [x] Import ontology JSON-LD through the ontology import flow
- [x] Fail clearly for RDF/XML input

## Import Workflows
- [x] Auto-select spreadsheet vs ontology mode from file extension
- [x] Reuse existing extension and MIME guessing helpers
- [x] Add file-based ontology import flow in the imports modal
- [x] Derive import target from `owl:versionIRI` with ontology IRI fallback
- [x] Add imported ontology terms to the lookup index immediately
- [x] Rehydrate cached imported ontologies into the lookup index on bootstrap

## UI and Modal Polish
- [x] Fix prefix manager rebuild/styling mismatch
- [x] Add shared modal sizing/scroll behavior
- [x] Keep modal action buttons reachable on smaller screens
- [x] Add live ontology entity IRI preview in ontology settings
- [x] Update preview listeners for opaque/readable IRI controls

## Predicate and Column Stability
- [x] Fix the broken hidden-column checklist path in predicate management
- [x] Preserve hidden-column state across grid schema rebuilds during the session
- [x] Add grid adapter methods for `getHiddenColumns()`, `setHiddenColumns()`, `hideColumns()`, `showColumns()`, and `showAllColumns()`
- [x] Add a grid context menu for column hide/show and row insertion/removal
- [x] Hook context-menu column visibility into the active `Ontology` / `Relata` view state
- [x] Hook context-menu row insertion/removal into the current grid selection
- [x] Replace the loose custom predicate array with a central in-memory predicate registry
- [x] Track predicate metadata for object mode plus `Ontology` and `Relata` visibility
- [x] Update the Manage Predicates modal into a combined predicate and column visibility manager
- [x] Add clearer predicate placement controls for `Ontology`, `Relata`, or both in the Manage Predicates modal
- [x] Limit custom predicate input suggestions to property-like vocabulary entries and show friendly label-based matches
- [x] Keep column visibility session-only and out of IndexedDB/settings persistence
- [x] Keep export behavior based on stored row data rather than visible columns
- [x] Add the `Relata` editing view on top of the predicate registry groundwork
- [x] Add view switching between `Ontology` and `Relata`
- [x] Support header-based spreadsheet import mapping so `Relata` sheets can omit hidden ontology columns
- [x] Allow RDF export of relation rows even when structural element type is blank
- [x] Revisit broader workspace/data persistence after the column/predicate baseline is stable
- [x] Save a workspace snapshot alongside RDF session exports in IndexedDB
- [x] Prefer workspace snapshot reloads and fall back to legacy RDF-only session reloads

## Verification
- [x] Run the existing Jest suite after predicate and hidden-column stabilization
- [x] Expand Jest coverage to include predicate/view/workspace regression helpers
- [x] Add a coverage-reporting script and baseline Jest coverage thresholds
- [ ] Verify saved-session reload restores rows, predicate modes, and active view from IndexedDB
- [ ] Verify Turtle, N-Triples, TriG, and JSON-LD preview paths in browser
- [ ] Verify CSV export content and escaping in browser
- [ ] Verify JSON-LD import with a sample `.jsonld` ontology file
- [ ] Verify ontology import file flow derives the expected import IRI
- [ ] Verify modal scrolling and sticky actions at smaller viewport heights
