(function () {
  const TOM = (window.TOM = window.TOM || {});
  const GDG = window.GlideDataGrid || {};
  const React = GDG.React || window.React;
  const ReactDOM = GDG.ReactDOM || window.ReactDOM;
  const DataEditor = GDG.DataEditor || GDG.default;
  const GridCellKind = GDG.GridCellKind;
  const CompactSelection = GDG.CompactSelection;

  const BASE_FIELDS = [
    "iri",
    "label",
    "elementType",
    "definition",
    "isA",
    "isCuratedInOntology",
  ];

  const DEFAULT_WIDTHS = {
    iri: 220,
    label: 180,
    elementType: 160,
    definition: 360,
    isA: 220,
    isCuratedInOntology: 220,
  };

  function ensureDependencies() {
    if (!React || !ReactDOM || !DataEditor || !GridCellKind) {
      throw new Error(
        "Glide Data Grid bundle not found. Expected window.GlideDataGrid, React, and ReactDOM."
      );
    }
  }

  function ensurePortal() {
    let portal = document.getElementById("portal");
    if (!portal) {
      portal = document.createElement("div");
      portal.id = "portal";
      document.body.appendChild(portal);
    }
    return portal;
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "column";
  }

  function createEmptySelection() {
    const empty =
      CompactSelection && typeof CompactSelection.empty === "function"
        ? CompactSelection.empty()
        : [];

    return {
      columns: empty,
      rows: empty,
    };
  }

  function defaultWidthForField(field, header) {
    if (DEFAULT_WIDTHS[field]) return DEFAULT_WIDTHS[field];
    if (/definition|description|citation|comment|scope|note/i.test(header)) return 280;
    if (/iri|curated/i.test(header)) return 220;
    return 180;
  }

  function buildSchema(headers, columns, previousSchema) {
    const prevByHeader = new Map((previousSchema || []).map((meta) => [meta.header, meta]));

    return (headers || []).map((header, index) => {
      const previous = prevByHeader.get(header);
      const column = columns?.[index] || {};
      const field =
        index < BASE_FIELDS.length
          ? BASE_FIELDS[index]
          : previous?.field || `predicate_${slugify(header)}_${index - BASE_FIELDS.length}`;

      return {
        field,
        header: String(header),
        index,
        width: previous?.width || column.width || defaultWidthForField(field, header),
        type: column.type || "text",
        strict: column.strict,
        allowInvalid: column.allowInvalid,
        source: column.source,
        allowWrapping:
          column.allowWrapping === true ||
          field === "definition" ||
          /definition|description|citation|comment|scope|note/i.test(header),
      };
    });
  }

  function blankObjectRow(schema) {
    const out = {};
    schema.forEach((meta) => {
      out[meta.field] = "";
    });
    return out;
  }

  function arrayRowToObject(row, schema) {
    const out = blankObjectRow(schema);
    schema.forEach((meta, index) => {
      out[meta.field] = row?.[index] ?? "";
    });
    return out;
  }

  function objectRowToArray(row, schema) {
    return schema.map((meta) => row?.[meta.field] ?? "");
  }

  function cloneObjectRows(rows, schema) {
    return (rows || []).map((row) => {
      if (Array.isArray(row)) return arrayRowToObject(row, schema);
      const out = blankObjectRow(schema);
      schema.forEach((meta) => {
        out[meta.field] = row?.[meta.field] ?? "";
      });
      return out;
    });
  }

  function extractEditedValue(value) {
    if (value == null) return "";
    if (typeof value === "object" && "data" in value) return value.data ?? "";
    return value;
  }

  function getRangeForSelection(selection) {
    if (!selection || !selection.current || !selection.current.range) return null;
    return selection.current.range;
  }

  function getSelectionAnchor(selection) {
    if (!selection || !selection.current || !selection.current.cell) return null;
    return selection.current.cell;
  }

  function normalizePasteMatrix(values) {
    if (!Array.isArray(values)) return [];
    return values.map((row) =>
      Array.isArray(row) ? row.map((value) => String(value ?? "")) : [String(row ?? "")]
    );
  }

  function createTextEditor(kind) {
    return function TextLikeEditor(props) {
      const value = props.value?.data ?? "";
      const baseStyle = {
        width: "100%",
        minHeight: kind === "textarea" ? "6.5rem" : "2.25rem",
        border: "1px solid #b7c7d9",
        borderRadius: "6px",
        padding: "0.55rem 0.65rem",
        font: "inherit",
        boxSizing: "border-box",
      };

      const handleChange = (event) => {
        props.onChange({
          ...props.value,
          data: event.target.value,
          displayData: event.target.value,
        });
      };

      if (kind === "textarea") {
        return React.createElement("textarea", {
          autoFocus: true,
          className: "tom-grid-editor",
          style: baseStyle,
          value,
          onChange: handleChange,
        });
      }

      return React.createElement("input", {
        autoFocus: true,
        className: "tom-grid-editor",
        style: baseStyle,
        value,
        onChange: handleChange,
      });
    };
  }

  const PlainTextEditor = createTextEditor("text");
  const MultilineEditor = createTextEditor("textarea");

  function SelectEditor(props) {
    const options = props.value?.tomOptions || [];
    return React.createElement(
      "select",
      {
        autoFocus: true,
        className: "tom-grid-editor",
        style: {
          width: "100%",
          minHeight: "2.4rem",
          border: "1px solid #b7c7d9",
          borderRadius: "6px",
          padding: "0.45rem 0.65rem",
          font: "inherit",
          boxSizing: "border-box",
        },
        value: props.value?.data ?? "",
        onChange: (event) => {
          const nextValue = event.target.value;
          const nextCell = {
            ...props.value,
            data: nextValue,
            displayData: nextValue,
          };
          props.onChange(nextCell);
          if (typeof props.onFinishedEditing === "function") {
            props.onFinishedEditing(nextCell);
          }
        },
      },
      options.map((option) =>
        React.createElement(
          "option",
          { key: option, value: option },
          option || ""
        )
      )
    );
  }

  function AutocompleteEditor(props) {
    const options = props.value?.tomOptions || [];
    const listId = `tom-autocomplete-${props.value?.tomField || "field"}-${
      props.target?.y || 0
    }-${props.target?.x || 0}`;

    return React.createElement(
      "div",
      null,
      React.createElement("input", {
        autoFocus: true,
        className: "tom-grid-editor",
        style: {
          width: "100%",
          minHeight: "2.25rem",
          border: "1px solid #b7c7d9",
          borderRadius: "6px",
          padding: "0.55rem 0.65rem",
          font: "inherit",
          boxSizing: "border-box",
        },
        list: listId,
        value: props.value?.data ?? "",
        onChange: (event) => {
          const nextValue = event.target.value;
          props.onChange({
            ...props.value,
            data: nextValue,
            displayData: nextValue,
          });
        },
      }),
      React.createElement(
        "datalist",
        { id: listId },
        options.map((option) =>
          React.createElement("option", { key: option, value: option })
        )
      )
    );
  }

  function buildEditorDescriptor(cell) {
    const editorType = cell?.tomEditor;
    if (editorType === "dropdown") {
      return { disablePadding: true, editor: SelectEditor };
    }
    if (editorType === "autocomplete") {
      return { disablePadding: true, editor: AutocompleteEditor };
    }
    if (cell?.allowWrapping === true) {
      return { disablePadding: true, editor: MultilineEditor };
    }
    return { disablePadding: true, editor: PlainTextEditor };
  }

  function remapRowsToSchema(rows, oldSchema, newSchema) {
    const previousByHeader = new Map((oldSchema || []).map((meta) => [meta.header, meta]));

    return (rows || []).map((row) => {
      const next = blankObjectRow(newSchema);
      newSchema.forEach((meta) => {
        const previous = previousByHeader.get(meta.header);
        if (previous) {
          next[meta.field] = row?.[previous.field] ?? "";
        }
      });
      return next;
    });
  }

  function createGrid(container, config) {
    ensureDependencies();
    ensurePortal();

    const root = ReactDOM.createRoot(container);
    const state = {
      root,
      hooks: {},
      selection: createEmptySelection(),
      schema: buildSchema(config.colHeaders || [], config.columns || [], null),
      rows: [],
      destroyed: false,
    };

    state.rows = cloneObjectRows(config.data || [], state.schema);

    function visibleSchema() {
      return state.schema.filter((meta) => !meta.hidden);
    }

    function getSchemaIndexForVisibleCol(visibleColIndex) {
      const meta = visibleSchema()[visibleColIndex];
      return meta ? meta.index : -1;
    }

    function getRowObject(rowIndex) {
      if (!state.rows[rowIndex]) {
        state.rows[rowIndex] = blankObjectRow(state.schema);
      }
      return state.rows[rowIndex];
    }

    function callHooks(name, args) {
      (state.hooks[name] || []).forEach((hook) => {
        hook.apply(api, args);
      });
    }

    function getCellOptions(meta, rowIndex) {
      if (typeof meta.source === "function") {
        let resolved = [];
        try {
          meta.source.call({ row: rowIndex }, "", (values) => {
            resolved = Array.isArray(values) ? values : [];
          });
        } catch (error) {
          console.error("[TOM.Grid] Failed to resolve cell options", error);
        }
        return resolved;
      }

      return Array.isArray(meta.source) ? meta.source : [];
    }

    function getDisplayValue(meta, rowIndex, value) {
      if (typeof config.getDisplayValue === "function") {
        return config.getDisplayValue({
          rowIndex,
          colIndex: meta.index,
          field: meta.field,
          header: meta.header,
          value,
          rowObject: getRowObject(rowIndex),
          row: objectRowToArray(getRowObject(rowIndex), state.schema),
        });
      }
      return value;
    }

    function buildCell(visibleColIndex, rowIndex) {
      const meta = visibleSchema()[visibleColIndex];
      const row = getRowObject(rowIndex);
      const raw = row?.[meta.field] ?? "";
      const display = getDisplayValue(meta, rowIndex, raw);
      const isInvalid =
        typeof config.validateCell === "function"
          ? config.validateCell({
              rowIndex,
              colIndex: meta.index,
              field: meta.field,
              header: meta.header,
              value: raw,
              rowObject: row,
              row: objectRowToArray(row, state.schema),
            }) === false
          : false;

      return {
        kind: GridCellKind.Text,
        allowOverlay: true,
        allowWrapping: meta.allowWrapping === true,
        data: String(raw ?? ""),
        displayData: String(display ?? raw ?? ""),
        readonly: false,
        themeOverride: isInvalid
          ? {
              bgCell: "#fff0f0",
              borderColor: "#d95c5c",
            }
          : undefined,
        tomField: meta.field,
        tomHeader: meta.header,
        tomColIndex: meta.index,
        tomEditor:
          meta.type === "dropdown"
            ? "dropdown"
            : meta.type === "autocomplete"
            ? "autocomplete"
            : meta.allowWrapping
            ? "textarea"
            : "text",
        tomOptions: getCellOptions(meta, rowIndex),
      };
    }

    function commitChanges(changes, source) {
      if (!changes.length) return;

      const beforeChanges = changes.map((change) => change.slice());
      callHooks("beforeChange", [beforeChanges, source]);

      beforeChanges.forEach((change) => {
        const rowIndex = change[0];
        const colIndex = change[1];
        const nextValue = change[3] ?? "";
        const meta = state.schema[colIndex];
        if (!meta) return;
        const row = getRowObject(rowIndex);
        row[meta.field] = nextValue;
      });

      render();
      callHooks("afterChange", [beforeChanges, source]);
    }

    function clearRange(range) {
      if (!range) return;
      const visible = visibleSchema();
      const changes = [];

      for (let row = range.y; row < range.y + range.height; row++) {
        for (let col = range.x; col < range.x + range.width; col++) {
          const meta = visible[col];
          if (!meta) continue;
          const current = getRowObject(row)?.[meta.field] ?? "";
          changes.push([row, meta.index, current, ""]);
        }
      }

      commitChanges(changes, "delete");
    }

    function render() {
      if (state.destroyed) return;

      const columns = visibleSchema().map((meta) => ({
        id: meta.field,
        title: meta.header,
        width: meta.width,
      }));

      state.root.render(
        React.createElement(DataEditor, {
          columns,
          rows: state.rows.length,
          getCellContent: function getCellContent(item) {
            return buildCell(item[0], item[1]);
          },
          getCellsForSelection: true,
          gridSelection: state.selection,
          onGridSelectionChange: function onGridSelectionChange(selection) {
            state.selection = selection || createEmptySelection();
            render();
          },
          rowMarkers: "number",
          rowMarkerWidth: 36,
          height: Math.max(420, container.clientHeight || 520),
          width: "100%",
          smoothScrollX: true,
          smoothScrollY: true,
          columnSelect: "multi",
          rowSelect: "multi",
          rangeSelect: "multi-rect",
          fillHandle: true,
          validateCell: function validateCell(item, newValue) {
            const meta = visibleSchema()[item[0]];
            if (!meta) return true;
            const value = String(extractEditedValue(newValue) ?? "");

            if (
              meta.type === "dropdown" &&
              meta.strict === true &&
              Array.isArray(meta.source) &&
              value &&
              !meta.source.includes(value)
            ) {
              return false;
            }

            if (typeof config.validateCell === "function") {
              return config.validateCell({
                rowIndex: item[1],
                colIndex: meta.index,
                field: meta.field,
                header: meta.header,
                value,
                rowObject: getRowObject(item[1]),
                row: objectRowToArray(getRowObject(item[1]), state.schema),
              });
            }

            return true;
          },
          provideEditor: function provideEditor(cell) {
            return buildEditorDescriptor(cell);
          },
          onCellEdited: function onCellEdited(item, newValue) {
            const meta = visibleSchema()[item[0]];
            if (!meta) return;
            const current = getRowObject(item[1])?.[meta.field] ?? "";
            commitChanges(
              [[item[1], meta.index, current, String(extractEditedValue(newValue) ?? "")]],
              "edit"
            );
          },
          onPaste: function onPaste(target, values) {
            const anchor = target || getSelectionAnchor(state.selection);
            if (!anchor) return false;
            api.applyPastePatch({ col: anchor[0], row: anchor[1] }, normalizePasteMatrix(values));
            return false;
          },
          onDelete: function onDelete() {
            clearRange(getRangeForSelection(state.selection));
            return false;
          },
          onColumnResize: function onColumnResize(column, newSize, visibleColIndex) {
            const schemaIndex =
              typeof visibleColIndex === "number"
                ? getSchemaIndexForVisibleCol(visibleColIndex)
                : state.schema.findIndex((meta) => meta.field === column.id);
            if (schemaIndex >= 0) {
              state.schema[schemaIndex].width = newSize;
            }
          },
        })
      );
    }

    const api = {
      createGrid: createGrid,
      replaceRows(rows, source) {
        state.rows = cloneObjectRows(rows, state.schema);
        render();
        if (source === "LoadData") {
          callHooks("afterChange", [null, "LoadData"]);
        }
      },
      getRows() {
        return cloneObjectRows(state.rows, state.schema);
      },
      getData() {
        return state.rows.map((row) => objectRowToArray(row, state.schema));
      },
      getDataAtCell(rowIndex, colIndex) {
        const meta = state.schema[colIndex];
        return meta ? getRowObject(rowIndex)?.[meta.field] ?? "" : "";
      },
      setDataAtCell(rowIndex, colIndex, value, source) {
        const meta = state.schema[colIndex];
        if (!meta) return;
        const current = getRowObject(rowIndex)?.[meta.field] ?? "";
        commitChanges([[rowIndex, colIndex, current, String(value ?? "")]], source || "edit");
      },
      countRows() {
        return state.rows.length;
      },
      getColHeader() {
        return state.schema.map((meta) => meta.header);
      },
      getSourceDataAtRow(rowIndex) {
        return objectRowToArray(getRowObject(rowIndex), state.schema);
      },
      propToCol(prop) {
        if (typeof prop === "number") return prop;
        const headerIndex = state.schema.findIndex((meta) => meta.header === prop);
        if (headerIndex >= 0) return headerIndex;
        return state.schema.findIndex((meta) => meta.field === prop);
      },
      loadData(rows) {
        state.rows = cloneObjectRows(rows, state.schema);
        render();
        callHooks("afterChange", [null, "LoadData"]);
      },
      alter(action, start, amount) {
        if (action === "remove_row") {
          this.removeRows(start, amount);
        }
      },
      addHook(name, fn) {
        state.hooks[name] = state.hooks[name] || [];
        state.hooks[name].push(fn);
      },
      applyCellEdit(rowIndex, field, value, source) {
        const colIndex =
          typeof field === "number"
            ? field
            : state.schema.findIndex((meta) => meta.field === field || meta.header === field);
        if (colIndex < 0) return;
        const current = this.getDataAtCell(rowIndex, colIndex);
        commitChanges([[rowIndex, colIndex, current, String(value ?? "")]], source || "edit");
      },
      applyPastePatch(anchor, matrix) {
        const visible = visibleSchema();
        const changes = [];

        (matrix || []).forEach((rowValues, rowOffset) => {
          rowValues.forEach((value, colOffset) => {
            const visibleMeta = visible[(anchor.col ?? anchor[0]) + colOffset];
            if (!visibleMeta) return;
            const rowIndex = (anchor.row ?? anchor[1]) + rowOffset;
            const current = getRowObject(rowIndex)?.[visibleMeta.field] ?? "";
            changes.push([rowIndex, visibleMeta.index, current, String(value ?? "")]);
          });
        });

        commitChanges(changes, "paste");
      },
      insertRows(index, amount) {
        const safeIndex = Math.max(0, Math.min(index, state.rows.length));
        const rows = Array.from({ length: Math.max(0, amount || 0) }, function () {
          return blankObjectRow(state.schema);
        });
        state.rows.splice(safeIndex, 0, ...rows);
        render();
        callHooks("afterCreateRow", [safeIndex, rows.length, "insertRows"]);
      },
      removeRows(index, amount) {
        const safeIndex = Math.max(0, index || 0);
        const count = Math.max(0, amount || 0);
        state.rows.splice(safeIndex, count);
        render();
      },
      setSchema(nextHeaders, nextColumns) {
        const headers = Array.isArray(nextHeaders)
          ? nextHeaders
          : state.schema.map((meta) => meta.header);
        const columns = Array.isArray(nextColumns)
          ? nextColumns
          : state.schema.map((meta) => ({ type: meta.type }));
        const nextSchema = buildSchema(headers, columns, state.schema);
        state.rows = remapRowsToSchema(state.rows, state.schema, nextSchema);
        state.schema = nextSchema;
        render();
      },
      refresh() {
        render();
      },
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        state.root.unmount();
        container.innerHTML = "";
      },
    };

    render();
    return api;
  }

  TOM.Grid = {
    createGrid,
  };
})();
