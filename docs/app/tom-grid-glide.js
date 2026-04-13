const TOM = (window.TOM = window.TOM || {});
const GDG = window.GlideDataGrid || {};
const React = GDG.React || window.React;
const ReactDOM = GDG.ReactDOM || window.ReactDOM;
const DataEditor = GDG.DataEditor || GDG.default;
const GridCellKind = GDG.GridCellKind;
const CompactSelection = GDG.CompactSelection;
const GRID_ROW_HEIGHT = 36;
const GRID_HEADER_HEIGHT = 40;
const GRID_ROW_MARKER_WIDTH = 32;
const GRID_FRAME_SIZE = 2;
const GRID_TEXT_FONT_SIZE = 14;
const GRID_LINE_HEIGHT = 1.25;
const GRID_HORIZONTAL_PADDING = 10;
const GRID_VERTICAL_PADDING = 8;
const EDITOR_OPTION_LIMIT = 50;
const AUTOCOMPLETE_MENU_MIN_WIDTH = 360;
const AUTOCOMPLETE_MENU_MAX_WIDTH = 760;
const autocompleteDrafts = new Map();
let textMeasureContext = null;

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
  isCuratedInOntology: 275,
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

function renderPortal(children, container) {
  if (!container || !children) return children;

  if (ReactDOM && typeof ReactDOM.createPortal === "function") {
    return ReactDOM.createPortal(children, container);
  }

  if (window.ReactDOM && typeof window.ReactDOM.createPortal === "function") {
    return window.ReactDOM.createPortal(children, container);
  }

  return children;
}

function canRenderPortal() {
  return Boolean(
    (ReactDOM && typeof ReactDOM.createPortal === "function") ||
      (window.ReactDOM && typeof window.ReactDOM.createPortal === "function")
  );
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

function readCssVar(name, fallback) {
  const rootValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (rootValue) return rootValue;
  const bodyValue = getComputedStyle(document.body).getPropertyValue(name).trim();
  return bodyValue || fallback;
}

function buildGridTheme() {
  const accent = readCssVar("--ont-accent", "#2563eb");
  const accentSoft = readCssVar("--ont-accent-soft", "#e0e7ff");
  const panel = readCssVar("--ont-panel-bg", "#ffffff");
  const background = readCssVar("--ont-bg", "#f8fafc");
  const border = readCssVar("--ont-border", "#d0d7de");
  const text = readCssVar("--ont-text", "#1f2937");
  const muted = readCssVar("--ont-muted", "#4b5563");
  const fontFamily = readCssVar(
    "--ont-font-body",
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  );

      return {
        accentColor: accent,
    accentFg: "#ffffff",
    accentLight: accentSoft,
    textDark: text,
    textMedium: muted,
    textLight: muted,
      textHeader: text,
    textHeaderSelected: text,
    textGroupHeader: text,
    textBubble: text,
    textMenu: text,
    bgCell: panel,
    bgCellMedium: background,
    bgHeader: background,
    bgHeaderHasFocus: panel,
    bgHeaderHovered: accentSoft,
    bgBubble: accentSoft,
    bgBubbleSelected: accentSoft,
    bgSearchResult: accentSoft,
    bgSearchResultStacked: accentSoft,
    bgIconHeader: background,
    fgIconHeader: muted,
    borderColor: border,
    drilldownBorder: border,
    linkColor: accent,
    headerFontStyle: "600 14px",
    baseFontStyle: "14px",
    fontFamily,
    editorFontSize: "14px",
    cellHorizontalPadding: GRID_HORIZONTAL_PADDING,
    cellVerticalPadding: GRID_VERTICAL_PADDING,
    lineHeight: GRID_LINE_HEIGHT,
    roundingRadius: 8,
  };
}

function getTextMeasureContext() {
  if (!textMeasureContext) {
    textMeasureContext = document.createElement("canvas").getContext("2d");
  }
  return textMeasureContext;
}

function measureTextWidth(value, font) {
  const text = String(value ?? "");
  if (!text) return 0;

  const context = getTextMeasureContext();
  if (!context) {
    return text.length * GRID_TEXT_FONT_SIZE * 0.62;
  }

  context.font = font;
  return context.measureText(text).width;
}

function computeAutocompleteMenuWidth(options, inputWidth, status) {
  const fontFamily = readCssVar(
    "--ont-font-body",
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
  );
  const labelFont = `${GRID_TEXT_FONT_SIZE}px ${fontFamily}`;
  const metaFont = `${Math.round(GRID_TEXT_FONT_SIZE * 0.92)}px ${fontFamily}`;
  const baseWidth = Math.max(
    AUTOCOMPLETE_MENU_MIN_WIDTH,
    Math.ceil(Number(inputWidth) || 0)
  );
  const statusText =
    status === "loading"
      ? "Loading matches..."
      : status === "error"
      ? "Lookup failed."
      : status === "empty"
      ? "No matches found."
      : "Type to search.";
  const widestOption = (Array.isArray(options) ? options : []).reduce(function (widest, option) {
    const labelWidth = measureTextWidth(option?.label, labelFont);
    const metaWidth = option?.description ? measureTextWidth(option.description, metaFont) : 0;
    return Math.max(widest, labelWidth, metaWidth);
  }, measureTextWidth(statusText, labelFont));
  const viewportCap = Math.max(
    baseWidth,
    Math.min(AUTOCOMPLETE_MENU_MAX_WIDTH, (window.innerWidth || AUTOCOMPLETE_MENU_MAX_WIDTH) - 16)
  );

  return Math.min(viewportCap, Math.max(baseWidth, Math.ceil(widestOption + 40)));
}

function wrapTextLine(line, maxWidth, measureText) {
  const value = String(line ?? "");
  if (!value) return 1;
  if (maxWidth <= 0) return Math.max(1, value.split(/\s+/).length);
  if (measureText(value) <= maxWidth) return 1;

  const words = value.split(/\s+/);
  let lines = 0;
  let current = "";

  words.forEach(function (word) {
    const next = current ? `${current} ${word}` : word;
    if (!current || measureText(next) <= maxWidth) {
      current = next;
      return;
    }

    lines += 1;
    current = word;

    while (current && measureText(current) > maxWidth) {
      let sliceLength = current.length;
      while (sliceLength > 1 && measureText(current.slice(0, sliceLength)) > maxWidth) {
        sliceLength -= 1;
      }
      lines += 1;
      current = current.slice(sliceLength);
    }
  });

  if (current) {
    lines += 1;
  }

  return Math.max(1, lines);
}

function measureWrappedLineCount(value, maxWidth, theme) {
  const text = String(value ?? "");
  if (!text) return 1;

  const context = getTextMeasureContext();
  if (!context) return Math.max(1, text.split(/\r?\n/).length);

  context.font = `${theme.baseFontStyle || `${GRID_TEXT_FONT_SIZE}px`} ${theme.fontFamily || ""}`;

  return text.split(/\r?\n/).reduce(function (total, line) {
    return total + wrapTextLine(line, maxWidth, function (sample) {
      return context.measureText(sample).width;
    });
  }, 0);
}

function computeRowHeight(row, rowIndex, schema, theme, displayResolver) {
  const verticalPadding = (theme.cellVerticalPadding || GRID_VERTICAL_PADDING) * 2;
  const lineHeightPx =
    Math.ceil((theme.lineHeight || GRID_LINE_HEIGHT) * GRID_TEXT_FONT_SIZE);

  let height = GRID_ROW_HEIGHT;

  (schema || []).forEach(function (meta) {
    if (!meta.allowWrapping) return;

    const value = displayResolver(meta, row, rowIndex);
    const usableWidth = Math.max(
      24,
      (meta.width || defaultWidthForField(meta.field, meta.header)) -
        (theme.cellHorizontalPadding || GRID_HORIZONTAL_PADDING) * 2
    );
    const lineCount = measureWrappedLineCount(value, usableWidth, theme);
    const wrappedHeight = lineCount * lineHeightPx + verticalPadding;
    height = Math.max(height, wrappedHeight);
  });

  return Math.ceil(height);
}

function computeRowHeights(rows, schema, theme, displayResolver) {
  return (rows || []).map(function (row, rowIndex) {
    return computeRowHeight(row, rowIndex, schema, theme, displayResolver);
  });
}

function computeGridHeight(rowHeights) {
  const totalRowHeight = (rowHeights || []).reduce(function (sum, height) {
    return sum + Math.max(0, Number(height) || 0);
  }, 0);

  return GRID_HEADER_HEIGHT + totalRowHeight + GRID_FRAME_SIZE;
}

function computeGridWidth(columns) {
  const totalColumnWidth = (columns || []).reduce(function (sum, column) {
    return sum + Math.max(0, Number(column?.width) || 0);
  }, 0);

  return GRID_ROW_MARKER_WIDTH + totalColumnWidth + GRID_FRAME_SIZE;
}

function computeViewportCaps(container) {
  const rect = container.getBoundingClientRect();
  const parentWidth = container.parentElement?.clientWidth || window.innerWidth || 0;
  const viewportWidth = Math.max(320, Math.floor(parentWidth));
  const viewportHeight = Math.max(
    GRID_HEADER_HEIGHT + GRID_ROW_HEIGHT + GRID_FRAME_SIZE,
    Math.floor((window.innerHeight || 0) - rect.top - 32),
  );

  return {
    width: viewportWidth,
    height: viewportHeight,
  };
}

function normalizeEditorOption(option) {
  if (option == null) return null;

  if (typeof option === "object" && !Array.isArray(option)) {
    const label = option.label ?? option.display ?? option.text ?? option.value;
    const value =
      option.commitValue ?? option.value ?? option.label ?? option.display ?? option.text;

    if (label == null && value == null) return null;

    const normalizedLabel = String(label ?? value ?? "");
    const normalizedValue = String(value ?? normalizedLabel);
    const searchTerms = [
      normalizedLabel,
      normalizedValue,
      option.description,
      ...(Array.isArray(option.keywords) ? option.keywords : []),
      ...(Array.isArray(option.searchTerms) ? option.searchTerms : []),
    ]
      .filter((entry) => entry != null && String(entry).trim() !== "")
      .map((entry) => String(entry).toLowerCase());

    return {
      label: normalizedLabel,
      value: normalizedValue,
      description: option.description ? String(option.description) : "",
      searchText: searchTerms.join("\n"),
      raw: option,
    };
  }

  const text = String(option ?? "");
  return {
    label: text,
    value: text,
    description: "",
    searchText: text.toLowerCase(),
    raw: option,
  };
}

function normalizeEditorOptions(values) {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((option) => normalizeEditorOption(option))
    .filter((option) => {
      if (!option) return false;
      const key = `${option.value}::${option.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function filterEditorOptions(options, query, limit) {
  const max = Math.max(1, Number(limit) || EDITOR_OPTION_LIMIT);
  const normalized = normalizeEditorOptions(options);
  const term = String(query || "").trim().toLowerCase();

  if (!term) return normalized.slice(0, max);
  return normalized.filter((option) => option.searchText.includes(term)).slice(0, max);
}

function resolveEditorOptions(source, rowIndex, query) {
  if (Array.isArray(source)) {
    return Promise.resolve(filterEditorOptions(source, query, EDITOR_OPTION_LIMIT));
  }

  if (typeof source === "function") {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (values) => {
        if (settled) return;
        settled = true;
        resolve(filterEditorOptions(values, query, EDITOR_OPTION_LIMIT));
      };

      try {
        const maybe = source.call({ row: rowIndex }, query, finish);
        if (maybe && typeof maybe.then === "function") {
          maybe.then(finish).catch(reject);
        } else if (maybe !== undefined) {
          finish(maybe);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  return Promise.resolve([]);
}

function getDropdownOptions(source) {
  return normalizeEditorOptions(Array.isArray(source) ? source : []).map((option) => option.value);
}

function getAutocompleteDraftKey(value) {
  return `${value?.tomField || ""}::${value?.tomRowIndex ?? ""}`;
}

function getInitialAutocompleteQuery(value) {
  const liveValue = String(value?.data ?? "");
  const storedValue = String(value?.tomStoredValue ?? "");
  return liveValue && liveValue !== storedValue ? liveValue : "";
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
      editor: column.editor || previous?.editor || null,
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
  const portal = ensurePortal();
  const supportsPortal = canRenderPortal();
  const draftKey = getAutocompleteDraftKey(props.value);
  const initialStoredValue = props.value?.tomStoredValue ?? props.value?.data ?? "";
  const initialDisplayValue =
    props.value?.tomEditValue ?? props.value?.displayData ?? props.value?.data ?? "";
  const initialQueryValue = getInitialAutocompleteQuery(props.value);
  if (!autocompleteDrafts.has(draftKey)) {
    autocompleteDrafts.set(draftKey, String(initialQueryValue ?? ""));
  }
  const [inputValue, setInputValue] = React.useState(
    autocompleteDrafts.get(draftKey) ?? initialQueryValue
  );
  const [options, setOptions] = React.useState([]);
  const [status, setStatus] = React.useState(
    String(autocompleteDrafts.get(draftKey) ?? initialQueryValue ?? "").trim() ? "loading" : "idle"
  );
  const [isMenuOpen, setIsMenuOpen] = React.useState(true);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const lookupRequestRef = React.useRef(0);
  const cellIdentityRef = React.useRef("");
  const originalCellRef = React.useRef({
    ...props.value,
    data: String(initialStoredValue ?? ""),
    displayData: String(initialDisplayValue ?? initialStoredValue ?? ""),
  });
  const listId = `tom-autocomplete-${props.value?.tomField || "field"}-${
    props.target?.y || 0
  }-${props.target?.x || 0}`;

  React.useEffect(() => {
    const cellIdentity = `${props.value?.tomField || ""}::${props.value?.tomRowIndex ?? ""}`;
    if (cellIdentityRef.current === cellIdentity) return;
    cellIdentityRef.current = cellIdentity;

    const nextStoredValue = props.value?.tomStoredValue ?? props.value?.data ?? "";
    const nextDisplayValue =
      props.value?.tomEditValue ?? props.value?.displayData ?? props.value?.data ?? "";
    const nextQueryValue = getInitialAutocompleteQuery(props.value);
    originalCellRef.current = {
      ...props.value,
      data: String(nextStoredValue ?? ""),
      displayData: String(nextDisplayValue ?? nextStoredValue ?? ""),
    };
    setInputValue(String(autocompleteDrafts.get(draftKey) ?? nextQueryValue ?? ""));
    setOptions([]);
    setHighlightedIndex(0);
    setStatus(
      String(autocompleteDrafts.get(draftKey) ?? nextQueryValue ?? "").trim() ? "loading" : "idle"
    );
    setIsMenuOpen(true);
  }, [
    draftKey,
    props.value?.tomField,
    props.value?.tomRowIndex,
  ]);

  React.useEffect(() => {
    const source = props.value?.tomSource;
    const rowIndex = props.value?.tomRowIndex;
    const query = String(inputValue ?? "");
    const trimmed = query.trim();

    setHighlightedIndex(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }

    if (!Array.isArray(source) && typeof source === "function" && !trimmed) {
      setOptions([]);
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    const requestId = lookupRequestRef.current + 1;
    lookupRequestRef.current = requestId;
    setStatus("loading");

    resolveEditorOptions(source, rowIndex, query)
      .then((resolved) => {
        if (cancelled || lookupRequestRef.current !== requestId) return;
        setOptions(resolved);
        setHighlightedIndex(0);
        setStatus(resolved.length ? "ready" : trimmed ? "empty" : "idle");
      })
      .catch((error) => {
        if (cancelled || lookupRequestRef.current !== requestId) return;
        console.error("[TOM.Grid] Failed to resolve autocomplete options", error);
        setOptions([]);
        setHighlightedIndex(0);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [inputValue, props.value?.tomRowIndex, props.value?.tomSource]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list || !options.length) return;
    if (highlightedIndex <= 0) {
      list.scrollTop = 0;
      return;
    }
    const active = list.querySelector("[data-active='true']");
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, options]);

  function emitDraftValue(nextValue) {
    const nextCell = {
      ...props.value,
      data: nextValue,
      displayData: nextValue,
    };
    props.onChange(nextCell);
    return nextCell;
  }

  function finishEditing(nextCell) {
    if (typeof props.onFinishedEditing === "function") {
      props.onFinishedEditing(nextCell);
    }
  }

  function updateValue(nextValue) {
    autocompleteDrafts.set(draftKey, nextValue);
    setInputValue(nextValue);
    setIsMenuOpen(true);
  }

  function chooseOption(option) {
    const nextLabel = option?.label ?? "";
    const nextValue = option?.value ?? nextLabel;
    const nextCell = {
      ...props.value,
      data: nextValue,
      displayData: nextLabel,
    };

    autocompleteDrafts.delete(draftKey);
    setInputValue(nextLabel);
    setIsMenuOpen(false);
    props.onChange(nextCell);
    finishEditing(nextCell);
  }

  function restoreOriginalValue() {
    autocompleteDrafts.delete(draftKey);
    setInputValue(originalCellRef.current.displayData ?? originalCellRef.current.data ?? "");
    setIsMenuOpen(false);
    props.onChange(originalCellRef.current);
    finishEditing(originalCellRef.current);
  }

  function commitTypedValue() {
    autocompleteDrafts.delete(draftKey);
    const nextCell = emitDraftValue(inputValue);
    setIsMenuOpen(false);
    finishEditing(nextCell);
  }

  const activeOption =
    options.length > 0 ? options[Math.max(0, Math.min(highlightedIndex, options.length - 1))] : null;
  const inputRect = props.target || { x: 0, y: 0, width: 0, height: 0 };
  const menuWidth = computeAutocompleteMenuWidth(options, inputRect.width, status);
  const viewportWidth = window.innerWidth || menuWidth;
  const viewportHeight = window.innerHeight || 0;
  const overlayMaxWidth = Math.max(
    AUTOCOMPLETE_MENU_MIN_WIDTH,
    Math.min(menuWidth, viewportWidth - 16)
  );
  const menuLeft = Math.max(8, Math.min(inputRect.x || 0, viewportWidth - menuWidth - 8));
  const preferredTop = (inputRect.y || 0) + (inputRect.height || 0) + 4;
  const menuHeight = 280;
  const menuTop =
    preferredTop + menuHeight <= viewportHeight - 8
      ? preferredTop
      : Math.max(8, (inputRect.y || 0) - menuHeight - 4);
  let menuBody = null;

  if (status === "loading") {
    menuBody = React.createElement(
      "div",
      { className: "tom-autocomplete-status" },
      "Loading matches..."
    );
  } else if (status === "error") {
    menuBody = React.createElement(
      "div",
      { className: "tom-autocomplete-status tom-autocomplete-status-error" },
      "Lookup failed."
    );
  } else if (status === "empty") {
    menuBody = React.createElement(
      "div",
      { className: "tom-autocomplete-status" },
      "No matches found."
    );
  } else if (status === "idle") {
    menuBody = React.createElement(
      "div",
      { className: "tom-autocomplete-status" },
      "Type to search."
    );
  } else {
    menuBody = React.createElement(
      "div",
      {
        className: "tom-autocomplete-options",
        role: "listbox",
        id: listId,
        ref: listRef,
      },
      options.map((option, index) =>
        React.createElement(
          "button",
          {
            key: `${option.value}-${index}`,
            id: `${listId}-option-${index}`,
            type: "button",
            role: "option",
            className: `tom-autocomplete-option${
              index === highlightedIndex ? " is-active" : ""
            }`,
            "data-active": index === highlightedIndex ? "true" : "false",
            "aria-selected": index === highlightedIndex ? "true" : "false",
            onMouseEnter: () => setHighlightedIndex(index),
            onMouseDown: (event) => {
              event.preventDefault();
              chooseOption(option);
            },
          },
          React.createElement(
            "span",
            { className: "tom-autocomplete-option-label" },
            option.label
          ),
          option.description
            ? React.createElement(
                "span",
                { className: "tom-autocomplete-option-meta" },
                option.description
              )
            : null
        )
      )
    );
  }

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const overlay =
      root.closest("[id^='gdg-overlay-']") || root.closest(".gdg-d19meir1");
    if (!(overlay instanceof HTMLElement)) return undefined;

    const previousVarWidth = overlay.style.getPropertyValue("--d19meir1-2");
    const previousMinWidth = overlay.style.minWidth;
    const previousMaxWidth = overlay.style.maxWidth;

    overlay.style.setProperty("--d19meir1-2", `${overlayMaxWidth}px`);
    overlay.style.minWidth = `${overlayMaxWidth}px`;
    overlay.style.maxWidth = `${overlayMaxWidth}px`;

    return () => {
      if (previousVarWidth) {
        overlay.style.setProperty("--d19meir1-2", previousVarWidth);
      } else {
        overlay.style.removeProperty("--d19meir1-2");
      }
      overlay.style.minWidth = previousMinWidth;
      overlay.style.maxWidth = previousMaxWidth;
    };
  }, [overlayMaxWidth]);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      {
        style: {
          position: "relative",
          width: `${overlayMaxWidth}px`,
          paddingBottom: !supportsPortal && isMenuOpen ? `${menuHeight + 8}px` : undefined,
        },
        ref: rootRef,
        className: "tom-autocomplete-root click-outside-ignore",
      },
      React.createElement("input", {
        autoFocus: true,
        ref: inputRef,
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
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": isMenuOpen ? "true" : "false",
        "aria-controls": listId,
        "aria-activedescendant":
          activeOption && status === "ready" ? `${listId}-option-${highlightedIndex}` : undefined,
        value: inputValue,
        placeholder: String(initialDisplayValue || ""),
        onFocus: (event) => {
          setIsMenuOpen(true);
        },
        onChange: (event) => {
          updateValue(event.target.value);
        },
        onKeyDown: (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsMenuOpen(true);
            setHighlightedIndex((current) =>
              options.length ? Math.min(current + 1, options.length - 1) : 0
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsMenuOpen(true);
            setHighlightedIndex((current) => (options.length ? Math.max(current - 1, 0) : 0));
            return;
          }

          if (event.key === "Enter") {
            if (activeOption && status === "ready") {
              event.preventDefault();
              chooseOption(activeOption);
              return;
            }
            commitTypedValue();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            restoreOriginalValue();
          }
        },
      }),
      !supportsPortal && isMenuOpen
        ? React.createElement(
            "div",
            {
              className:
                "tom-autocomplete-popover tom-autocomplete-popover-inline click-outside-ignore",
              style: {
                left: "0",
                width: `${menuWidth}px`,
                maxHeight: `${menuHeight}px`,
              },
              onMouseDown: (event) => {
                event.preventDefault();
              },
            },
            menuBody
          )
        : null
    ),
    supportsPortal && portal && isMenuOpen
      ? renderPortal(
          React.createElement(
            "div",
            {
              className: "tom-autocomplete-popover click-outside-ignore",
              style: {
                left: `${menuLeft}px`,
                top: `${menuTop}px`,
                width: `${menuWidth}px`,
                maxHeight: `${menuHeight}px`,
              },
              onMouseDown: (event) => {
                event.preventDefault();
              },
            },
            menuBody
          ),
          portal
        )
      : null
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
    themeObserver: null,
    mediaQueryList: null,
  };

  state.rows = cloneObjectRows(config.data || [], state.schema);

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => render());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    }
    state.themeObserver = observer;
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    const handleThemeChange = () => render();
    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleThemeChange);
    } else if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(handleThemeChange);
    }
    state.mediaQueryList = { mediaQueryList, handleThemeChange };
  }

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
      tomRowIndex: rowIndex,
      tomSource: meta.source,
      tomStoredValue: String(raw ?? ""),
      tomEditValue: String(display ?? raw ?? ""),
      tomEditor:
        meta.editor === "autocomplete" || meta.type === "autocomplete"
          ? "autocomplete"
          : meta.type === "dropdown"
          ? "dropdown"
          : meta.allowWrapping
          ? "textarea"
          : "text",
      tomOptions: meta.type === "dropdown" ? getDropdownOptions(meta.source) : [],
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
    const theme = buildGridTheme();
    const visible = visibleSchema();
    const columns = visible.map((meta) => ({
      id: meta.field,
      title: meta.header,
      width: meta.width,
    }));
    const rowHeights = computeRowHeights(state.rows, visible, theme, function (meta, row, rowIndex) {
      return getDisplayValue(meta, rowIndex, row?.[meta.field] ?? "");
    });
    const gridHeight = computeGridHeight(rowHeights);
    const gridWidth = computeGridWidth(columns);
    const viewportCaps = computeViewportCaps(container);
    const viewportHeight = Math.min(gridHeight, viewportCaps.height);
    const viewportWidth = Math.min(gridWidth, viewportCaps.width);
    container.style.height = `${viewportHeight}px`;
    container.style.minHeight = `${viewportHeight}px`;
    container.style.maxHeight = `${viewportHeight}px`;
    container.style.width = `${viewportWidth}px`;
    container.style.minWidth = `${viewportWidth}px`;
    container.style.maxWidth = `${viewportWidth}px`;

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
        rowMarkerWidth: GRID_ROW_MARKER_WIDTH,
        rowHeight: function rowHeight(rowIndex) {
          return rowHeights[rowIndex] || GRID_ROW_HEIGHT;
        },
        headerHeight: GRID_HEADER_HEIGHT,
        height: gridHeight,
        width: gridWidth,
        theme,
        scaleToRem: false,
        overscrollY: 0,
        overscrollX: 0,
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
            render();
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
      if (state.themeObserver) {
        state.themeObserver.disconnect();
      }
      if (state.mediaQueryList) {
        const { mediaQueryList, handleThemeChange } = state.mediaQueryList;
        if (typeof mediaQueryList.removeEventListener === "function") {
          mediaQueryList.removeEventListener("change", handleThemeChange);
        } else if (typeof mediaQueryList.removeListener === "function") {
          mediaQueryList.removeListener(handleThemeChange);
        }
      }
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
