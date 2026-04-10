import { GridCellKind, type EditableGridCell, type GridCell, type GridColumn, type Item, type Rectangle } from "@glideapps/glide-data-grid";
import { buildGridColumns, displayLabelAndCurie } from "@/lib/ontology";
import type { GridColumnDef, GridEditContext, GridRow, PredicateColumnMeta } from "@/types";
import type { VocabularyIndex } from "@/lib/vocab";

export interface TomTextCell extends GridCell {
  readonly kind: GridCellKind.Text;
  readonly allowOverlay: true;
  readonly readonly?: boolean;
  readonly data: string;
  readonly displayData: string;
  readonly field: string;
  readonly editorKind: GridColumnDef["editor"];
  readonly choices?: readonly string[];
}

export function toGlideColumns(predicateMeta: PredicateColumnMeta[]): GridColumn[] {
  return buildGridColumns(predicateMeta).map((column) => ({
    id: column.field,
    title: column.title,
    width: column.width,
    hasMenu: true,
  }));
}

function getColumnDefinition(field: string, predicateMeta: PredicateColumnMeta[]): GridColumnDef {
  return buildGridColumns(predicateMeta).find((column) => column.field === field) ?? {
    field,
    title: field,
    width: 180,
    editor: "text",
  };
}

export function getCell(
  rows: GridRow[],
  columns: GridColumn[],
  predicateMeta: PredicateColumnMeta[],
  item: Item,
  vocabIndex: VocabularyIndex
): TomTextCell {
  const [colIndex, rowIndex] = item;
  const row = rows[rowIndex];
  const field = String(columns[colIndex]?.id || "");
  const column = getColumnDefinition(field, predicateMeta);
  const rawValue = String(row?.[field] ?? "");
  const maybeRecord = vocabIndex.getByIri(rawValue);
  const displayData = maybeRecord ? displayLabelAndCurie(maybeRecord) : rawValue;

  return {
    kind: GridCellKind.Text,
    allowOverlay: true,
    readonly: false,
    data: rawValue,
    displayData,
    field,
    editorKind: column.editor,
    choices: column.choices,
  };
}

export function editableValueFromCell(cell: EditableGridCell | GridCell) {
  if (cell.kind === GridCellKind.Text) {
    return String(cell.data ?? "");
  }
  return "";
}

export function selectionToPatch(target: Item, values: readonly (readonly string[])[]) {
  return {
    startCol: target[0],
    startRow: target[1],
    values: values.map((row) => row.map((value) => String(value))),
  };
}

export function rectangleToItems(rect: Rectangle) {
  const out: Item[] = [];
  for (let row = rect.y; row < rect.y + rect.height; row += 1) {
    for (let col = rect.x; col < rect.x + rect.width; col += 1) {
      out.push([col, row]);
    }
  }
  return out;
}

export function clearSelection(rows: GridRow[], rect: Rectangle, context: GridEditContext) {
  let nextRows = [...rows];
  for (let row = rect.y; row < rect.y + rect.height; row += 1) {
    for (let col = rect.x; col < rect.x + rect.width; col += 1) {
      const field = context.columns[col]?.field;
      if (!field) continue;
      nextRows = context.columns.length ? nextRows.map((entry) => ({ ...entry })) : nextRows;
      if (nextRows[row]) {
        nextRows[row][field] = "";
      }
    }
  }
  return nextRows;
}
