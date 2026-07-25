// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FormatRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SUPPORTED_MIME_DESCRIPTORS = Object.freeze([
    {
      id: "text-turtle",
      category: "rdf",
      mimeType: "text/turtle",
      extensions: Object.freeze(["ttl", "turtle", "n3"]),
      aliases: Object.freeze(["ttl", "turtle", "text/turtle"]),
      n3ParserFormat: "Turtle",
      preferredExtension: "ttl",
    },
    {
      id: "application-n-triples",
      category: "rdf",
      mimeType: "application/n-triples",
      extensions: Object.freeze(["nt", "ntriples"]),
      aliases: Object.freeze(["nt", "n-triples", "ntriples", "application/n-triples"]),
      n3ParserFormat: "N-Triples",
      preferredExtension: "nt",
    },
    {
      id: "application-n-quads",
      category: "rdf",
      mimeType: "application/n-quads",
      extensions: Object.freeze(["nq", "nquads"]),
      aliases: Object.freeze(["nq", "n-quads", "nquads", "application/n-quads"]),
      n3ParserFormat: "N-Quads",
      preferredExtension: "nquads",
    },
    {
      id: "application-trig",
      category: "rdf",
      mimeType: "application/trig",
      extensions: Object.freeze(["trig"]),
      aliases: Object.freeze(["trig", "application/trig"]),
      n3ParserFormat: "TriG",
      preferredExtension: "trig",
    },
    {
      id: "application-ld-json",
      category: "rdf",
      mimeType: "application/ld+json",
      extensions: Object.freeze(["jsonld", "json-ld"]),
      aliases: Object.freeze(["jsonld", "json-ld", "json-ld+json", "application/ld+json"]),
      n3ParserFormat: null,
      preferredExtension: "jsonld",
    },
    {
      id: "application-rdf-xml",
      category: "rdf",
      mimeType: "application/rdf+xml",
      extensions: Object.freeze(["rdf", "owl", "xml"]),
      aliases: Object.freeze(["rdf", "rdfxml", "rdf+xml", "application/rdf+xml"]),
      n3ParserFormat: null,
      preferredExtension: "rdf",
    },
    {
      id: "text-csv",
      category: "tabular",
      mimeType: "text/csv",
      extensions: Object.freeze(["csv"]),
      aliases: Object.freeze(["csv", "text/csv"]),
      preferredExtension: "csv",
    },
    {
      id: "text-tsv",
      category: "tabular",
      mimeType: "text/tab-separated-values",
      extensions: Object.freeze(["tsv", "tab"]),
      aliases: Object.freeze(["tsv", "tab", "text/tab-separated-values"]),
      preferredExtension: "tsv",
    },
    {
      id: "application-vnd-ms-excel",
      category: "tabular",
      mimeType: "application/vnd.ms-excel",
      extensions: Object.freeze(["xls"]),
      aliases: Object.freeze(["xls", "application/vnd.ms-excel"]),
      preferredExtension: "xls",
    },
    {
      id: "application-vnd-openxmlformats-officedocument-spreadsheetml-sheet",
      category: "tabular",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extensions: Object.freeze(["xlsx"]),
      aliases: Object.freeze(["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
      preferredExtension: "xlsx",
    },
  ]);

  const descriptorsByExtension = new Map();
  const descriptorsByMimeOrAlias = new Map();

  SUPPORTED_MIME_DESCRIPTORS.forEach(function (descriptor) {
    descriptor.extensions.forEach(function (extension) {
      descriptorsByExtension.set(extension, descriptor);
    });
    descriptorsByMimeOrAlias.set(descriptor.mimeType.toLowerCase(), descriptor);
    descriptor.aliases.forEach(function (alias) {
      descriptorsByMimeOrAlias.set(alias.toLowerCase(), descriptor);
    });
  });

  function ok(value) {
    return { ok: true, value };
  }

  function err(input, extension) {
    return {
      ok: false,
      error: "unknown filetype",
      input,
      extension: extension || "",
    };
  }

  function normalizeExtension(extension) {
    return String(extension || "")
      .trim()
      .replace(/^\.+/, "")
      .toLowerCase();
  }

  function getFilenameExtension(fileName) {
    if (typeof fileName !== "string") return "";
    const cleanName = fileName.split(/[?#]/)[0];
    const slashIndex = Math.max(cleanName.lastIndexOf("/"), cleanName.lastIndexOf("\\"));
    const baseName = slashIndex >= 0 ? cleanName.slice(slashIndex + 1) : cleanName;
    const dotIndex = baseName.lastIndexOf(".");
    if (dotIndex === -1 || dotIndex === baseName.length - 1) return "";
    return baseName.slice(dotIndex + 1).toLowerCase();
  }

  function getDescriptorForExtension(extension) {
    const normalized = normalizeExtension(extension);
    const descriptor = descriptorsByExtension.get(normalized);
    return descriptor ? ok(descriptor) : err(extension, normalized);
  }

  function getSupportedMimeTypeForFilename(fileName) {
    return getDescriptorForExtension(getFilenameExtension(fileName));
  }

  function normalizeSupportedMimeType(input) {
    const normalized = String(input || "").trim().toLowerCase();
    const descriptor = descriptorsByMimeOrAlias.get(normalized);
    return descriptor ? ok(descriptor) : err(input, "");
  }

  function getOutputMimeTypeForExtension(extension) {
    return getDescriptorForExtension(extension);
  }

  function getPreferredExtensionForMimeType(mimeType) {
    const normalized = normalizeSupportedMimeType(mimeType);
    if (!normalized.ok) return normalized;
    return ok(normalized.value.preferredExtension);
  }

  function getN3ParserFormatForMimeType(mimeType) {
    const normalized = normalizeSupportedMimeType(mimeType);
    if (!normalized.ok) return normalized;
    return normalized.value.n3ParserFormat
      ? ok(normalized.value.n3ParserFormat)
      : {
          ok: false,
          error: "unsupported parser format",
          input: mimeType,
          mimeType: normalized.value.mimeType,
        };
  }

  function getInputKindForExtension(extension) {
    const result = getDescriptorForExtension(extension);
    if (!result.ok) return "unsupported";
    if (result.value.category === "tabular") return "spreadsheet";
    if (result.value.category === "rdf") return "ontology";
    return "unsupported";
  }

  function getMimeTypeForFormatKey(formatKey) {
    return normalizeSupportedMimeType(formatKey);
  }

  function createFormatMimeTypeMap(formatKeys) {
    return (formatKeys || []).reduce(function (map, key) {
      const result = getMimeTypeForFormatKey(key);
      if (result.ok) map[key] = result.value.mimeType;
      return map;
    }, {});
  }

  function createFormatExtensionMap(formatKeys) {
    return (formatKeys || []).reduce(function (map, key) {
      const result = getMimeTypeForFormatKey(key);
      if (result.ok) map[key] = result.value.preferredExtension;
      return map;
    }, {});
  }

  function guessRdfMimeTypeFromText(text) {
    const content = String(text || "");
    if (/^\s*\{[\s\S]*"@context"\s*:/.test(content) || /^\s*\[[\s\S]*"@context"\s*:/.test(content)) {
      return "application/ld+json";
    }
    if (/<rdf:RDF\b/.test(content)) return "application/rdf+xml";
    if (/^\s*@prefix\b|@base\b|:\s/.test(content)) return "text/turtle";
    if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(content)) return "application/n-triples";
    return "text/plain";
  }

  function downloadTextFile(fileName, text, options) {
    const opts = options || {};
    const detected = getSupportedMimeTypeForFilename(fileName);
    const mimeType = opts.mimeType || (detected.ok ? detected.value.mimeType : "text/plain");
    const charset = opts.charset === false ? "" : ";charset=utf-8";
    const blob = new Blob([text], { type: `${mimeType}${charset}` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function getAcceptExtensions(category) {
    return SUPPORTED_MIME_DESCRIPTORS
      .filter(function (descriptor) {
        return !category || descriptor.category === category;
      })
      .flatMap(function (descriptor) {
        return descriptor.extensions.map(function (extension) {
          return `.${extension}`;
        });
      })
      .join(",");
  }

  return Object.freeze({
    SUPPORTED_MIME_DESCRIPTORS,
    getFilenameExtension,
    getDescriptorForExtension,
    getSupportedMimeTypeForFilename,
    normalizeSupportedMimeType,
    getOutputMimeTypeForExtension,
    getPreferredExtensionForMimeType,
    getN3ParserFormatForMimeType,
    getInputKindForExtension,
    getMimeTypeForFormatKey,
    createFormatMimeTypeMap,
    createFormatExtensionMap,
    guessRdfMimeTypeFromText,
    downloadTextFile,
    getAcceptExtensions,
  });
});
