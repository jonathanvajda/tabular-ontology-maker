(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.OntologySpreadsheetHelpers = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BASE_FIELDS = [
    "iri",
    "label",
    "elementType",
    "definition",
    "isA",
    "isCuratedInOntology",
  ];

  const BASE_HEADERS = [
    "iri",
    "label",
    "element type",
    "definition",
    "is a",
    "is curated in ontology",
  ];

  const ONTOLOGY_KEYS = {
    versionIri: "http://www.w3.org/2002/07/owl#versionIRI",
    versionInfo: "http://www.w3.org/2002/07/owl#versionInfo",
    label: "http://www.w3.org/2000/01/rdf-schema#label",
    creator: "http://purl.org/dc/terms/creator",
    description: "http://purl.org/dc/terms/description",
  };

  function getCurrentDateParts() {
    const now = new Date();
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, "0"),
      day: String(now.getDate()).padStart(2, "0"),
    };
  }

  function toCamelCase(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, function (_, chr) {
        return chr.toUpperCase();
      });
  }

  function toPascalCase(str) {
    return String(str || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, function (_, chr) {
        return chr.toUpperCase();
      })
      .replace(/^./, function (chr) {
        return chr.toUpperCase();
      });
  }

  function toSnakeCase(str) {
    return String(str || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function fromLabelWithCase(label, caseStyle) {
    switch (caseStyle) {
      case "camelCase":
        return toCamelCase(label);
      case "snake_case":
        return toSnakeCase(label);
      case "PascalCase":
      default:
        return toPascalCase(label);
    }
  }

  function generateOntologySettings(
    base,
    label,
    creator,
    description,
    delimiter,
    iriMode,
    opaqueLeading,
    opaqueDigits,
    opaqueStart,
    readableCase
  ) {
    const safeBase = base || "http://example.org";
    const safeLabel = label || "Example Ontology";
    const safeCreator = creator || "Barry Guarino";
    const safeDescription = description || "An example ontology";
    const safeDelimiter = delimiter || "/";
    const safeIriMode = iriMode || "opaque";
    const safeOpaqueLeading = opaqueLeading || "ont";
    const safeOpaqueDigits = opaqueDigits || 6;
    const safeOpaqueStart = opaqueStart || 1;
    const safeReadableCase = readableCase || "PascalCase";

    const parts = getCurrentDateParts();
    const normalizedLabel = toPascalCase(safeLabel);

    return {
      iri: safeBase + safeDelimiter + normalizedLabel,
      [ONTOLOGY_KEYS.versionIri]:
        safeBase +
        "/" +
        parts.year +
        "-" +
        parts.month +
        "-" +
        parts.day +
        safeDelimiter +
        normalizedLabel,
      [ONTOLOGY_KEYS.versionInfo]:
        parts.year + "-" + parts.month + "-" + parts.day,
      [ONTOLOGY_KEYS.label]: safeLabel,
      [ONTOLOGY_KEYS.creator]: safeCreator,
      [ONTOLOGY_KEYS.description]: safeDescription,
      iriMode: safeIriMode,
      opaqueLeading: safeOpaqueLeading,
      opaqueDigits: safeOpaqueDigits,
      opaqueStart: safeOpaqueStart,
      readableCase: safeReadableCase,
      delimiter: safeDelimiter,
      base: safeBase,
    };
  }

  function parseFileExtension(filename) {
    if (typeof filename !== "string") {
      return "";
    }

    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return "";
    }

    return filename.slice(lastDot + 1).toLowerCase();
  }

  function detectFormatByExtension(extension) {
    if (typeof extension !== "string") {
      return "unsupported";
    }

    if (["csv", "tsv", "xls", "xlsx"].includes(extension)) {
      return "spreadsheet";
    }

    if (["ttl", "nt", "rdf", "jsonld"].includes(extension)) {
      return "ontology";
    }

    return "unsupported";
  }

  function predicateFieldFromIri(iri, index) {
    const seed = String(iri || "");
    let hash = 0;

    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
    }

    const suffix = typeof index === "number" ? "_" + index : "";
    return "predicate_" + hash.toString(36) + suffix;
  }

  function buildPredicateMeta(customPredicates) {
    return (customPredicates || []).map(function (predicateIri, index) {
      return {
        predicateIri: predicateIri,
        field: predicateFieldFromIri(predicateIri, index),
        title: predicateIri,
      };
    });
  }

  function createBlankRow(predicateMeta) {
    const row = {
      iri: "",
      label: "",
      elementType: "",
      definition: "",
      isA: "",
      isCuratedInOntology: "",
    };

    (predicateMeta || []).forEach(function (meta) {
      row[meta.field] = "";
    });

    return row;
  }

  function rowObjectFromArray(row, predicateMeta) {
    const values = Array.isArray(row) ? row : [];
    const next = createBlankRow(predicateMeta);

    BASE_FIELDS.forEach(function (field, index) {
      next[field] = values[index] == null ? "" : values[index];
    });

    (predicateMeta || []).forEach(function (meta, index) {
      next[meta.field] = values[BASE_FIELDS.length + index] == null
        ? ""
        : values[BASE_FIELDS.length + index];
    });

    return next;
  }

  function rowArrayFromObject(row, predicateMeta) {
    const data = row || {};
    const values = BASE_FIELDS.map(function (field) {
      return data[field] == null ? "" : data[field];
    });

    (predicateMeta || []).forEach(function (meta) {
      values.push(data[meta.field] == null ? "" : data[meta.field]);
    });

    return values;
  }

  function rowsToObjects(rows, predicateMeta) {
    return (rows || []).map(function (row) {
      return rowObjectFromArray(row, predicateMeta);
    });
  }

  function rowsToArrays(rows, predicateMeta) {
    return (rows || []).map(function (row) {
      return rowArrayFromObject(row, predicateMeta);
    });
  }

  function zeroPad(n, width) {
    const safeNumber = Math.max(0, Number(n) || 0);
    const text = String(Math.trunc(safeNumber));
    return text.length >= width ? text : "0".repeat(width - text.length) + text;
  }

  function getBaseAndDelimiter(settings) {
    const safeSettings = settings || {};
    const base = String(safeSettings.base || "http://example.org").replace(/[\/#]+$/g, "");
    const delimiter = safeSettings.delimiter || "/";

    return { base, delimiter };
  }

  function buildOpaqueIri(nextNum, settings) {
    const parts = getBaseAndDelimiter(settings);
    const safeSettings = settings || {};
    const lead = safeSettings.opaqueLeading || "ont";
    const digits = Math.max(1, safeSettings.opaqueDigits || 6);

    return parts.base + parts.delimiter + lead + zeroPad(nextNum, digits);
  }

  function buildReadableIri(label, settings, existingIris) {
    const parts = getBaseAndDelimiter(settings);
    const safeSettings = settings || {};
    const knownIris = existingIris instanceof Set ? existingIris : new Set();
    const style = safeSettings.readableCase || "PascalCase";

    let localName = fromLabelWithCase(label, style) || "Unnamed";
    let candidate = parts.base + parts.delimiter + localName;
    let suffix = 2;

    while (knownIris.has(candidate)) {
      candidate = parts.base + parts.delimiter + localName + "_" + suffix;
      suffix += 1;
    }

    return candidate;
  }

  function mergeTableData(currentRows, newRows, mode) {
    const existing = Array.isArray(currentRows) ? currentRows : [];
    const incoming = Array.isArray(newRows) ? newRows : [];
    const normalizedMode = mode === "replace" ? "replace" : "append";
    const mergedRows = normalizedMode === "replace"
      ? incoming.slice()
      : existing.concat(incoming);

    return {
      mergedRows: mergedRows,
      stats: {
        original: existing.length,
        appended: incoming.length,
        total: mergedRows.length,
      },
    };
  }

  function isLikelyOntology(content) {
    const text = String(content || "").trim();
    if (!text) {
      return false;
    }

    return (
      /@prefix\s+/i.test(text) ||
      /<rdf:RDF\b/i.test(text) ||
      /<owl:Ontology\b/i.test(text) ||
      /https?:\/\/www\.w3\.org\/2002\/07\/owl#/i.test(text)
    );
  }

  return {
    BASE_FIELDS: BASE_FIELDS,
    BASE_HEADERS: BASE_HEADERS,
    ONTOLOGY_KEYS: ONTOLOGY_KEYS,
    getCurrentDateParts: getCurrentDateParts,
    toCamelCase: toCamelCase,
    toPascalCase: toPascalCase,
    toSnakeCase: toSnakeCase,
    fromLabelWithCase: fromLabelWithCase,
    generateOntologySettings: generateOntologySettings,
    parseFileExtension: parseFileExtension,
    detectFormatByExtension: detectFormatByExtension,
    predicateFieldFromIri: predicateFieldFromIri,
    buildPredicateMeta: buildPredicateMeta,
    createBlankRow: createBlankRow,
    rowObjectFromArray: rowObjectFromArray,
    rowArrayFromObject: rowArrayFromObject,
    rowsToObjects: rowsToObjects,
    rowsToArrays: rowsToArrays,
    zeroPad: zeroPad,
    getBaseAndDelimiter: getBaseAndDelimiter,
    buildOpaqueIri: buildOpaqueIri,
    buildReadableIri: buildReadableIri,
    mergeTableData: mergeTableData,
    isLikelyOntology: isLikelyOntology,
  };
});
