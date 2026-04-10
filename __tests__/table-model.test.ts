import {
  applyCellEdit,
  applyPastePatch,
  buildGridColumns,
  buildPredicateMeta,
  createBlankRow,
  insertBlankRows,
  mergeTableData,
  rowArrayFromObject,
  rowObjectFromArray,
  rowsToArrays,
  rowsToObjects,
} from "@/lib/ontology";
import type { GridRow } from "@/types";

describe("row and schema helpers", () => {
  const predicateMeta = buildPredicateMeta(["http://example.org/predicate/hasAuthor"]);

  test("creates blank rows with base and predicate fields", () => {
    const row = createBlankRow(predicateMeta);
    expect(row.iri).toBe("");
    expect(row[predicateMeta[0].field]).toBe("");
  });

  test("converts rows between array and object representations", () => {
    const source = [
      "http://example.org/ont000001",
      "Doctor",
      "Class",
      "Definition",
      "http://example.org/Parent",
      "http://example.org/ontology",
      "Ada",
    ];

    const objectRow = rowObjectFromArray(source, predicateMeta);
    const roundTrip = rowArrayFromObject(objectRow, predicateMeta);
    expect(roundTrip).toEqual(source);
    expect(rowsToArrays(rowsToObjects([source], predicateMeta), predicateMeta)).toEqual([[...source]]);
  });

  test("merges and inserts rows", () => {
    const settings = {
      iri: "http://example.org/ontology",
      base: "http://example.org",
      delimiter: "#",
      iriMode: "opaque",
      opaqueLeading: "ont",
      opaqueDigits: 6,
      opaqueStart: 1,
      readableCase: "PascalCase",
      predicateValueModes: {},
    } as const;

    const inserted = insertBlankRows([], 0, 2, settings, predicateMeta);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].iri).toContain("ont000001");

    const merged = mergeTableData(inserted, [createBlankRow(predicateMeta)], "append");
    expect(merged.stats.total).toBe(3);
  });

  test("applies cell edits and paste patches", () => {
    const rows: GridRow[] = [
      {
        __rowId: "row_1",
        iri: "",
        label: "",
        elementType: "",
        definition: "",
        isA: "",
        isCuratedInOntology: "",
      },
    ];
    const settings = {
      iri: "http://example.org/ontology",
      base: "http://example.org",
      delimiter: "#",
      iriMode: "readable",
      opaqueLeading: "ont",
      opaqueDigits: 6,
      opaqueStart: 1,
      readableCase: "PascalCase",
      predicateValueModes: {},
    } as const;
    const columns = buildGridColumns(predicateMeta);
    const context = {
      rows,
      columns,
      settings,
      predicateMeta,
      resolveToIri: (value: string) => (value.startsWith("ex:") ? `http://example.org/${value.slice(3)}` : null),
    };

    const edited = applyCellEdit(rows, 0, "label", "My Term", context);
    expect(edited[0].iri).toBe("http://example.org#MyTerm");

    const pasted = applyPastePatch(
      edited,
      {
        startRow: 0,
        startCol: 1,
        values: [["Another Term", "Class"]],
      },
      context
    );
    expect(pasted[0].label).toBe("Another Term");
  });
});
