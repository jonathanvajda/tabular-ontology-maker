# Feature Checklist

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

## Verification
- [ ] Verify Turtle, N-Triples, TriG, and JSON-LD preview paths in browser
- [ ] Verify CSV export content and escaping in browser
- [ ] Verify JSON-LD import with a sample `.jsonld` ontology file
- [ ] Verify ontology import file flow derives the expected import IRI
- [ ] Verify modal scrolling and sticky actions at smaller viewport heights
