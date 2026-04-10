import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { GlideOntologyGrid } from "@/components/GlideOntologyGrid";
import { buildGridColumns, buildPredicateMeta, generateOntologySettings } from "@/lib/ontology";
import { VocabularyIndex } from "@/lib/vocab";

jest.mock("@glideapps/glide-data-grid", () => {
  const React = require("react");
  return {
    __esModule: true,
    GridCellKind: { Text: "Text" },
    CompactSelection: { empty: () => ({}) },
    default: ({ getCellContent, onCellEdited }: any) => {
      const cell = getCellContent([1, 0]);
      return (
        <div>
          <span data-testid="cell">{cell.displayData}</span>
          <button
            onClick={() =>
              onCellEdited?.([1, 0], {
                kind: "Text",
                data: "Updated Label",
                displayData: "Updated Label",
                allowOverlay: true,
              })
            }
          >
            Edit
          </button>
        </div>
      );
    },
  };
});

describe("GlideOntologyGrid", () => {
  test("renders cell content and emits edits", () => {
    const predicateMeta = buildPredicateMeta([]);
    const rows = [
      {
        __rowId: "row_1",
        iri: "http://example.org/ont000001",
        label: "Doctor",
        elementType: "Class",
        definition: "",
        isA: "",
        isCuratedInOntology: "http://example.org/ontology",
      },
    ];
    const setRows = jest.fn();

    render(
      <GlideOntologyGrid
        rows={rows}
        setRows={setRows}
        columns={buildGridColumns(predicateMeta)}
        predicateMeta={predicateMeta}
        settings={generateOntologySettings()}
        vocabIndex={new VocabularyIndex()}
        selection={{ current: undefined, columns: {} as any, rows: {} as any }}
        setSelection={() => undefined}
      />
    );

    expect(screen.getByTestId("cell")).toHaveTextContent("Doctor");
    fireEvent.click(screen.getByText("Edit"));
    expect(setRows).toHaveBeenCalled();
  });
});
