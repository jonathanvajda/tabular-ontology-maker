const {
  applyPredicateViewPlacement,
  cloneRowsForWorkspace,
  defaultPredicateObjectMode,
  getPredicateViewPlacement,
  getRecordOrderValue,
  normalizePredicateMode,
  normalizePredicateRecord,
  normalizeWorkspaceSnapshot,
  selectLatestRecord,
} = require("../docs/app/tom-feature-utils.js");

describe("feature regression helpers", () => {
  test("defaultPredicateObjectMode respects known predicate types", () => {
    expect(defaultPredicateObjectMode("ObjectProperty", "http://example.org/p")).toBe("iri");
    expect(defaultPredicateObjectMode("DatatypeProperty", "http://example.org/p")).toBe("literal");
    expect(defaultPredicateObjectMode("AnnotationProperty", "http://example.org/p")).toBe("literal");
    expect(defaultPredicateObjectMode("", "http://example.org#someProperty")).toBe("iri");
    expect(defaultPredicateObjectMode("", "http://example.org/label")).toBe("literal");
  });

  test("normalizePredicateRecord merges fallback metadata and normalizes mode", () => {
    const record = normalizePredicateRecord(
      { iri: "http://example.org/predicate" },
      { objectMode: "iri", showInOntology: false, showInRelata: true },
      { normalizePredicateMode }
    );

    expect(record).toEqual({
      iri: "http://example.org/predicate",
      objectMode: "iri",
      showInOntology: false,
      showInRelata: true,
    });
  });

  test("predicate placement helpers separate ontology and relata membership", () => {
    const record = { iri: "http://example.org/p", showInOntology: true, showInRelata: true };

    expect(getPredicateViewPlacement(record)).toBe("both");
    expect(applyPredicateViewPlacement(record, "ontology")).toEqual({
      iri: "http://example.org/p",
      showInOntology: true,
      showInRelata: false,
    });
    expect(getPredicateViewPlacement(record)).toBe("ontology");
    expect(applyPredicateViewPlacement(record, "relata")).toEqual({
      iri: "http://example.org/p",
      showInOntology: false,
      showInRelata: true,
    });
    expect(getPredicateViewPlacement(record)).toBe("relata");
  });

  test("cloneRowsForWorkspace pads and truncates rows predictably", () => {
    expect(
      cloneRowsForWorkspace(
        [
          ["a", "b"],
          ["c", "d", "e", "f"],
        ],
        3
      )
    ).toEqual([
      ["a", "b", ""],
      ["c", "d", "e"],
    ]);
  });

  test("normalizeWorkspaceSnapshot deduplicates predicates and defaults invalid view keys", () => {
    const normalized = normalizeWorkspaceSnapshot(
      {
        version: "2",
        timestamp: "2026-04-15T10:00:00Z",
        activeView: "not-a-view",
        predicates: [
          { iri: "http://example.org/p1", objectMode: "iri" },
          { iri: "http://example.org/p1", objectMode: "literal" },
          { iri: "http://example.org/p2" },
        ],
        rows: [["subj1", "label1", "Class", "", "", "", "obj1"]],
      },
      {
        baseCols: 6,
        defaultView: "ontology",
        isValidViewKey: (viewKey) => viewKey === "ontology" || viewKey === "relata",
        normalizePredicateMode,
        normalizePredicateRecord,
      }
    );

    expect(normalized).toEqual({
      version: 2,
      timestamp: "2026-04-15T10:00:00Z",
      activeView: "ontology",
      predicates: [
        { iri: "http://example.org/p1", objectMode: "iri" },
        { iri: "http://example.org/p2", objectMode: "literal" },
      ],
      rows: [["subj1", "label1", "Class", "", "", "", "obj1", ""]],
    });
  });

  test("record ordering prefers timestamps and falls back to ids", () => {
    expect(getRecordOrderValue({ timestamp: "2026-04-15T12:00:00Z", id: 1 })).toBeGreaterThan(
      getRecordOrderValue({ timestamp: "2026-04-14T12:00:00Z", id: 999 })
    );
    expect(getRecordOrderValue({ timestamp: "bad", id: 8 })).toBe(8);
    expect(selectLatestRecord([{ id: 2 }, { id: 8 }, { id: 5 }])).toEqual({ id: 8 });
    expect(
      selectLatestRecord([
        { id: 2, timestamp: "2026-04-14T12:00:00Z" },
        { id: 1, timestamp: "2026-04-15T12:00:00Z" },
      ])
    ).toEqual({ id: 1, timestamp: "2026-04-15T12:00:00Z" });
  });
});
