## Deprecated PLAN


# Tabulator Migration Checklist

## Runtime Assets
- [x] Vendor `tabulator.min.js` into `docs/app/`
- [x] Vendor `tabulator.min.css` into `docs/styles/`
- [x] Remove remaining Handsontable runtime references from docs entrypoints and service worker

## Table Model
- [x] Extract row/object conversion helpers
- [x] Convert the app table state to object rows with stable base fields
- [x] Generate safe field ids for custom predicate columns
- [x] Replace destroy-and-rebuild flows with `setColumns` and data APIs where possible

## Editing And UX
- [x] Add Tabulator row numbering header
- [x] Port multiline text editing and wrapping
- [x] Port strict element-type list editing
- [x] Port `is a` autocomplete and canonical IRI normalization
- [x] Port custom display formatting for stored IRI values
- [x] Add explicit row and header menus
- [x] Add header filtering and sorting
- [x] Add column hide/show behavior

## Data Logic
- [x] Preserve opaque IRI generation for new rows
- [x] Preserve readable IRI regeneration from label edits
- [ ] Preserve export, import, reload, and save-session flows
- [x] Preserve predicate value-mode validation

## Tests
- [x] Replace placeholder Jest imports with real repo modules
- [x] Add tests for row-object conversion and predicate field mapping
- [ ] Keep or exceed current passing Jest coverage footprint after migration
- [ ] Add migration-specific tests for schema updates and IRI behavior

## Acceptance
- [x] `docs/index.html` boots with Tabulator and no Handsontable dependency
- [x] `docs/index-dev.html` boots with Tabulator and no Handsontable dependency
- [ ] Jest suite passes
- [x] Service worker precache list matches the shipped runtime assets
