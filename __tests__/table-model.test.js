const {
  BASE_FIELDS,
  buildOpaqueIri,
  buildReadableIri,
  buildPredicateMeta,
  createBlankRow,
  getBaseAndDelimiter,
  mergeTableData,
  predicateFieldFromIri,
  rowArrayFromObject,
  rowObjectFromArray,
  rowsToArrays,
  rowsToObjects,
  zeroPad,
} = require("../docs/app/ontology_spreadsheet_helpers.js");

describe("predicate field mapping", () => {
  test("creates deterministic field ids for predicate IRIs", () => {
    const iri = "http://example.org/predicate/hasAuthor";
    expect(predicateFieldFromIri(iri, 0)).toBe(predicateFieldFromIri(iri, 0));
    expect(predicateFieldFromIri(iri, 1)).not.toBe(predicateFieldFromIri(iri, 0));
  });

  test("builds predicate metadata for every custom predicate", () => {
    const meta = buildPredicateMeta([
      "http://example.org/p1",
      "http://example.org/p2",
    ]);

    expect(meta).toHaveLength(2);
    expect(meta[0]).toEqual(
      expect.objectContaining({
        predicateIri: "http://example.org/p1",
        field: expect.stringMatching(/^predicate_/),
      })
    );
  });
});

describe("row conversion helpers", () => {
  const meta = buildPredicateMeta([
    "http://example.org/predicate/hasAuthor",
    "http://example.org/predicate/hasCitation",
  ]);

  test("creates blank rows with all base and predicate fields", () => {
    const row = createBlankRow(meta);

    expect(Object.keys(row)).toEqual(
      expect.arrayContaining(BASE_FIELDS.concat(meta.map((item) => item.field)))
    );
    expect(row.iri).toBe("");
    expect(row[meta[0].field]).toBe("");
  });

  test("converts array rows to object rows and back without losing values", () => {
    const source = [
      "http://example.org/ont000001",
      "Doctor",
      "Class",
      "A human person who has earned a doctorate.",
      "http://example.org/Parent",
      "http://example.org/Ontology",
      "Ada Lovelace",
      "Citation text",
    ];

    const objectRow = rowObjectFromArray(source, meta);
    const roundTrip = rowArrayFromObject(objectRow, meta);

    expect(objectRow.label).toBe("Doctor");
    expect(objectRow[meta[0].field]).toBe("Ada Lovelace");
    expect(roundTrip).toEqual(source);
  });

  test("converts row collections between array and object forms", () => {
    const rows = [
      ["iri-1", "Label 1", "Class", "", "", "", "one", "two"],
      ["iri-2", "Label 2", "NamedIndividual", "", "", "", "three", "four"],
    ];

    const objects = rowsToObjects(rows, meta);
    const arrays = rowsToArrays(objects, meta);

    expect(objects).toHaveLength(2);
    expect(objects[1].elementType).toBe("NamedIndividual");
    expect(arrays).toEqual(rows);
  });
});

describe("IRI helpers", () => {
  const settings = {
    base: "http://example.org/",
    delimiter: "#",
    opaqueLeading: "ont",
    opaqueDigits: 4,
    readableCase: "snake_case",
  };

  test("normalizes base and delimiter before building IRIs", () => {
    expect(getBaseAndDelimiter(settings)).toEqual({
      base: "http://example.org",
      delimiter: "#",
    });
  });

  test("left-pads opaque numeric suffixes", () => {
    expect(zeroPad(7, 4)).toBe("0007");
    expect(buildOpaqueIri(7, settings)).toBe("http://example.org#ont0007");
  });

  test("builds readable IRIs and avoids collisions", () => {
    const existing = new Set(["http://example.org#example_term"]);

    expect(buildReadableIri("Example Term", settings, existing)).toBe(
      "http://example.org#example_term_2"
    );
  });
});

describe("table merge helpers", () => {
  test("appends incoming rows in append mode", () => {
    const merged = mergeTableData([["a"]], [["b"], ["c"]], "append");

    expect(merged.mergedRows).toEqual([["a"], ["b"], ["c"]]);
    expect(merged.stats).toEqual({ original: 1, appended: 2, total: 3 });
  });

  test("replaces existing rows in replace mode", () => {
    const merged = mergeTableData([["a"]], [["b"]], "replace");

    expect(merged.mergedRows).toEqual([["b"]]);
    expect(merged.stats).toEqual({ original: 1, appended: 1, total: 1 });
  });
});
