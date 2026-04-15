# Feature Roadmap

This document captures the broader plan for the feature work discussed for TOM.

Use [feature-checklist.md](d:/GitHub/tabular-ontology-maker/docs/feature-checklist.md) as the execution tracker.
Use this roadmap for scope, sequencing, design intent, and open decisions.

## Goals

- Keep TOM usable as a spreadsheet-first RDF authoring tool.
- Preserve the current ontology workflow while adding a stronger relation-heavy data-entry workflow.
- Keep the DOM as a rendered view of application state rather than the main store of user data.
- Make column visibility, predicate management, and view switching stable enough to support future features without another deep refactor.

## Current Baseline

- Predicate management now uses a central in-memory registry.
- TOM has `Ontology` and `Relata` views.
- Column visibility is view-aware and session-only.
- Save/reload now writes a workspace snapshot to IndexedDB in addition to RDF.
- A first-pass grid context menu exists for hiding columns and inserting or removing rows.

## Track 1: Context Menu and Table Operations

### Purpose

- Make spreadsheet operations faster and more local to where the user is working.
- Reduce dependence on toolbar-only actions for common grid editing tasks.

### Completed First Pass

- Right-click header actions for hiding columns and showing all columns in the active view.
- Right-click cell actions for inserting rows above or below, adding a row at the end, and removing selected rows.
- Integration with the active `Ontology` or `Relata` visibility model.

### Next Steps

- Add explicit `Show Column` actions for hidden columns from the predicate or column manager and consider a context-menu entry that opens a focused show-column picker.
- Support context-menu operations for grouped column hiding when a header range is selected.
- Improve menu positioning, keyboard dismissal, and focus behavior through browser verification.
- Add lightweight tests around menu action plumbing where practical.

### Later Enhancements

- Add context actions for duplicating rows.
- Add context actions for clearing selected cells without deleting rows.
- Consider row-level actions such as moving selected rows up or down.
- Consider column grouping only after the simpler visibility model is proven in use.

## Track 2: `Ontology` and `Relata`

### Product Intent

- `Ontology` remains the default ontology-oriented spreadsheet.
- `Relata` becomes the relation-heavy bulk-entry view for asserting RDF using predicate columns instead of a narrow triple table.
- The UI should use `Ontology` and `Relata`, not `TBox` and `ABox`.

### `Ontology` View

- Keep the current wide-sheet workflow for ontology authoring.
- Continue supporting labels, definitions, element type, `is a`, curation, and additional predicate columns.
- Keep named-individual support here as it already exists.

### `Relata` View

- Use a row model centered on one subject per row.
- Base columns are currently planned as `subject` and `label`.
- Additional predicate columns come from the central predicate registry.
- Each populated predicate column emits one triple for that row on export.
- Predicate object handling follows the predicate registry `objectMode` of `iri` or `literal`.

### Why `Relata` Matters

- It supports the actual spreadsheet workflow discussed: `subject | predicate1 | predicate2 | predicate3`.
- It avoids forcing users into a narrow N-triples-only editing model.
- It lets users reuse the same predicates across many rows while still getting compact Turtle-like output semantics.
- It makes hide/show column workflows more valuable because users can keep a large relation vocabulary available without always displaying every predicate.

### Planned Milestones

- Stabilize the current `Relata` editing experience in browser testing.
- Revisit the exact base columns for `Relata` and trim ontology-specific defaults that are not useful there.
- Improve import/export examples and documentation for relation-heavy sheets.
- Add clearer affordances in the Manage Predicates modal for which predicates belong in `Ontology`, `Relata`, or both.
- Consider a more explicit view shell if needed after usage feedback, such as stronger tab styling or view-specific helper text.

### Open Questions

- Whether `Relata` should keep only `subject` and `label` as fixed columns, or retain a few optional structural fields.
- Whether a user should be able to create a predicate only for `Relata` without surfacing it in `Ontology`.
- Whether future relation sheets should support multiple `Relata`-style layouts, or whether a single shared relation view is enough.

## Track 3: Data Management and Persistence

### Current Understanding

- The grid row model is already held in memory, not in the cell DOM.
- The DOM is primarily a rendering surface and editing surface.
- IndexedDB now stores ontology settings, imported ontology cache, RDF session snapshots, and workspace snapshots.
- Hidden-column state is intentionally session-only for now.

### Design Principles

- Keep the DOM as a view, not the canonical store of user data.
- Keep export formats derived from the workspace model rather than treating exports as the only persistent truth.
- Make reload restore user work with minimal reconstruction loss.
- Avoid introducing a storage architecture that makes spreadsheet editing harder than it needs to be.

### Recommended Path

- Short term:
  Keep the workspace snapshot model in IndexedDB and continue treating RDF export as a derived artifact.

- Medium term:
  Make the in-memory workspace model more explicit and centralized so grid actions, imports, predicate changes, and view changes all flow through one consistent state model.

- Longer term:
  Revisit whether TOM should adopt a native RDF quad store as a primary persistence layer.

### Quad Store Option

Potential benefits:

- Stronger RDF-native storage semantics.
- Easier future support for richer graph-oriented features.
- Less need to reconstruct triples from row data when exporting.

Potential drawbacks:

- Spreadsheet concerns like row order, blank rows, and partial edits become harder to model cleanly.
- UI state and authoring ergonomics still need a workspace model on top of the store.
- It may increase complexity before TOM truly needs graph-native persistence.

### Recommended Decision for Now

- Do not make a quad store the only live source of truth yet.
- Continue treating TOM primarily as a spreadsheet authoring app backed by an explicit workspace model.
- Reconsider a quad-store-backed design only if future work demands multiple synchronized RDF-native views beyond the current spreadsheet workflows.

## Proposed Sequence

### Phase 1

- Finish browser verification of the current context menu, view switching, import/export, and saved-session restore.
- Refine any rough edges in the first-pass context menu.

### Phase 2

- Improve the `Relata` product fit by revisiting its base columns and predicate-management affordances.
- Add documentation and sample workflows for relation-heavy authoring.

### Phase 3

- Strengthen the centralized workspace model and reduce any remaining logic that relies on reconstructing state from rendered output.
- Revisit deeper storage options only after the authoring workflows feel settled.

## Definition of Done for the Remaining Work

- Users can reliably switch between `Ontology` and `Relata` without data loss.
- Users can manage a large set of predicates without the UI becoming unworkable.
- Users can hide and reveal columns easily in both views.
- Save and reload preserve the workspace model that matters for editing.
- Browser verification confirms the core spreadsheet, import, export, and session flows behave as expected.

## Next Session Starting Point

- Run the remaining browser verification checklist items from `feature-checklist.md`.
- Confirm context-menu behavior on headers, cells, and row markers, then decide whether row-marker support should be added.
- Revisit `Relata` base columns and predicate-management affordances only after the verification pass is complete.
- Keep the quad-store idea parked until the current spreadsheet-first workflows feel fully settled.
