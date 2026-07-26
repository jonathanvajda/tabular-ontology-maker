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
    descriptor("text-turtle", "rdf", "text/turtle", ["ttl", "turtle", "n3"], ["ttl", "turtle", "text/turtle"], "Turtle", "ttl"),
    descriptor("application-n-triples", "rdf", "application/n-triples", ["nt", "ntriples"], ["nt", "n-triples", "ntriples", "application/n-triples"], "N-Triples", "nt"),
    descriptor("application-n-quads", "rdf", "application/n-quads", ["nq", "nquads"], ["nq", "n-quads", "nquads", "application/n-quads"], "N-Quads", "nquads"),
    descriptor("application-trig", "rdf", "application/trig", ["trig"], ["trig", "application/trig"], "TriG", "trig"),
    descriptor("application-ld-json", "rdf", "application/ld+json", ["jsonld", "json-ld"], ["jsonld", "json-ld", "json-ld+json", "application/ld+json"], null, "jsonld"),
    descriptor("application-rdf-xml", "rdf", "application/rdf+xml", ["rdf", "owl", "xml"], ["rdf", "rdfxml", "rdf+xml", "application/rdf+xml"], null, "rdf"),
    descriptor("application-sparql-query", "sparql", "application/sparql-query", ["rq", "sparql"], ["rq", "sparql", "application/sparql-query"], null, "rq"),
    descriptor("text-csv", "tabular", "text/csv", ["csv"], ["csv", "text/csv"], null, "csv"),
    descriptor("text-tsv", "tabular", "text/tab-separated-values", ["tsv", "tab"], ["tsv", "tab", "text/tab-separated-values"], null, "tsv"),
    descriptor("application-vnd-ms-excel", "tabular", "application/vnd.ms-excel", ["xls"], ["xls", "application/vnd.ms-excel"], null, "xls"),
    descriptor("application-vnd-openxmlformats-officedocument-spreadsheetml-sheet", "tabular", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ["xlsx"], ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], null, "xlsx"),
    descriptor("application-json", "data", "application/json", ["json"], ["json", "application/json"], null, "json"),
    descriptor("application-d3-json", "visualization", "application/d3+json", ["d3.json", "d3json"], ["d3", "d3json", "application/d3+json"], null, "json"),
    descriptor("text-mermaid", "visualization", "text/mermaid", ["mmd", "mermaid"], ["mmd", "mermaid", "text/mermaid"], null, "mmd"),
    descriptor("application-docx", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"], ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], null, "docx"),
    descriptor("text-plain", "text", "text/plain", ["txt", "text"], ["txt", "text", "text/plain"], null, "txt"),
    descriptor("text-html", "text", "text/html", ["html", "htm"], ["html", "htm", "text/html"], null, "html"),
    descriptor("text-yaml", "text", "text/yaml", ["yaml", "yml"], ["yaml", "yml", "text/yaml", "application/yaml"], null, "yaml"),
  ]);

  const descriptorsByExtension = new Map();
  const descriptorsByMimeOrAlias = new Map();

  SUPPORTED_MIME_DESCRIPTORS.forEach(function (item) {
    item.extensions.forEach(function (extension) {
      descriptorsByExtension.set(extension, item);
    });
    descriptorsByMimeOrAlias.set(item.mimeType.toLowerCase(), item);
    item.aliases.forEach(function (alias) {
      descriptorsByMimeOrAlias.set(alias.toLowerCase(), item);
    });
  });

  function descriptor(id, category, mimeType, extensions, aliases, n3ParserFormat, preferredExtension) {
    return Object.freeze({
      id,
      category,
      mimeType,
      extensions: Object.freeze(extensions),
      aliases: Object.freeze(aliases),
      n3ParserFormat,
      preferredExtension,
    });
  }

  function ok(value) {
    return { ok: true, value };
  }

  function err(input, extension) {
    return { ok: false, error: "unknown filetype", input, extension: extension || "" };
  }

  function normalizeExtension(extension) {
    return String(extension || "").trim().replace(/^\.+/, "").toLowerCase();
  }

  function getFilenameExtension(fileName) {
    if (typeof fileName !== "string") return "";
    const cleanName = fileName.split(/[?#]/)[0].replace(/\.(gz|zip)$/i, "");
    const slashIndex = Math.max(cleanName.lastIndexOf("/"), cleanName.lastIndexOf("\\"));
    const baseName = slashIndex >= 0 ? cleanName.slice(slashIndex + 1) : cleanName;
    if (/\.d3\.json$/i.test(baseName)) return "d3.json";
    const dotIndex = baseName.lastIndexOf(".");
    if (dotIndex === -1 || dotIndex === baseName.length - 1) return "";
    return baseName.slice(dotIndex + 1).toLowerCase();
  }

  function getDescriptorForExtension(extension) {
    const normalized = normalizeExtension(extension);
    const item = descriptorsByExtension.get(normalized);
    return item ? ok(item) : err(extension, normalized);
  }

  function getSupportedMimeTypeForFilename(fileName) {
    return getDescriptorForExtension(getFilenameExtension(fileName));
  }

  function normalizeSupportedMimeType(input) {
    const normalized = String(input || "").trim().toLowerCase().replace(/;.*$/, "");
    const item = descriptorsByMimeOrAlias.get(normalized);
    return item ? ok(item) : err(input, "");
  }

  function getOutputMimeTypeForExtension(extension) {
    return getDescriptorForExtension(extension);
  }

  function getPreferredExtensionForMimeType(mimeType) {
    const normalized = normalizeSupportedMimeType(mimeType);
    return normalized.ok ? ok(normalized.value.preferredExtension) : normalized;
  }

  function getN3ParserFormatForMimeType(mimeType) {
    const normalized = normalizeSupportedMimeType(mimeType);
    if (!normalized.ok) return normalized;
    return normalized.value.n3ParserFormat
      ? ok(normalized.value.n3ParserFormat)
      : { ok: false, error: "unsupported parser format", input: mimeType, mimeType: normalized.value.mimeType };
  }

  function getInputKindForExtension(extension) {
    const result = getDescriptorForExtension(extension);
    if (!result.ok) return "unsupported";
    if (result.value.category === "tabular") return "spreadsheet";
    if (result.value.category === "rdf") return "ontology";
    return result.value.category;
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
    if (/^\s*\{[\s\S]*"@context"\s*:/.test(content) || /^\s*\[[\s\S]*"@context"\s*:/.test(content)) return "application/ld+json";
    if (/<rdf:RDF\b/.test(content)) return "application/rdf+xml";
    if (/^\s*@prefix\b|@base\b|:\s/.test(content)) return "text/turtle";
    if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(content)) return "application/n-triples";
    return "text/plain";
  }

  function downloadTextFile(fileName, text, options) {
    const opts = options || {};
    const detected = getSupportedMimeTypeForFilename(fileName);
    const mimeType = opts.mimeType || (detected.ok ? detected.value.mimeType : "text/plain");
    const charset = opts.charset === false || /;\s*charset=/i.test(mimeType) ? "" : ";charset=utf-8";
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
      .filter(function (item) {
        return !category || item.category === category;
      })
      .flatMap(function (item) {
        return item.extensions.map(function (extension) {
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
