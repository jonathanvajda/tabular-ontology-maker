import DataEditor, { GridCellKind, type EditableGridCell, type GridSelection, type Item } from "@glideapps/glide-data-grid";
import { useMemo, useRef } from "react";
import { applyCellEdit, applyPastePatch, insertBlankRows } from "@/lib/ontology";
import { clearSelection, editableValueFromCell, getCell, selectionToPatch, toGlideColumns } from "@/lib/gridAdapter";
import type { GridColumnDef, GridRow, OntologySettings, PredicateColumnMeta } from "@/types";
import type { VocabularyIndex } from "@/lib/vocab";

interface GlideOntologyGridProps {
  rows: GridRow[];
  setRows: (rows: GridRow[]) => void;
  columns: GridColumnDef[];
  predicateMeta: PredicateColumnMeta[];
  settings: OntologySettings;
  vocabIndex: VocabularyIndex;
  selection: GridSelection;
  setSelection: (selection: GridSelection) => void;
}

export function GlideOntologyGrid({
  rows,
  setRows,
  columns,
  predicateMeta,
  settings,
  vocabIndex,
  selection,
  setSelection,
}: GlideOntologyGridProps) {
  const glideColumns = useMemo(() => toGlideColumns(predicateMeta), [predicateMeta]);
  const dataEditorRef = useRef<any>(null);

  const editContext = useMemo(
    () => ({
      rows,
      columns,
      settings,
      predicateMeta,
      resolveToIri: (value: string) => vocabIndex.resolveToIri(value),
    }),
    [columns, predicateMeta, rows, settings, vocabIndex]
  );

  return (
    <div className="tom-grid-shell">
      <DataEditor
        ref={dataEditorRef}
        columns={glideColumns}
        rows={rows.length}
        getCellContent={(item: Item) => getCell(rows, glideColumns, predicateMeta, item, vocabIndex)}
        getCellsForSelection={true}
        gridSelection={selection}
        onGridSelectionChange={setSelection}
        rangeSelect="multi-rect"
        rowSelect="multi"
        columnSelect="multi"
        fillHandle
        allowedFillDirections="any"
        rowMarkers="both"
        freezeColumns={1}
        smoothScrollX
        smoothScrollY
        width="100%"
        height={620}
        trailingRowOptions={{ hint: "Add Row", sticky: true, tint: true }}
        onRowAppended={() => {
          setRows(insertBlankRows(rows, rows.length, 1, settings, predicateMeta));
          return "bottom";
        }}
        onPaste={(target, values) => {
          const patch = selectionToPatch(target, values);
          setRows(applyPastePatch(rows, patch, editContext));
          return false;
        }}
        onDelete={(currentSelection) => {
          const rect = currentSelection.current?.range;
          if (!rect) return false;
          setRows(clearSelection(rows, rect, editContext));
          return false;
        }}
        validateCell={(cell, newValue) => {
          if (newValue.kind !== GridCellKind.Text) return false;
          const field = String(glideColumns[cell[0]]?.id || "");
          if (field === "elementType" && newValue.data && !["Class", "NamedIndividual", "ObjectProperty", "DatatypeProperty", "AnnotationProperty"].includes(newValue.data)) {
            return false;
          }
          return newValue;
        }}
        onCellEdited={(item: Item, newValue: EditableGridCell) => {
          if (newValue.kind !== GridCellKind.Text) return;
          const field = String(glideColumns[item[0]]?.id || "");
          setRows(applyCellEdit(rows, item[1], field, editableValueFromCell(newValue), editContext));
        }}
      />
    </div>
  );
}
