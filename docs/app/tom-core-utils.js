// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/namespace-registry.js';

const NS = COMMON_NAMESPACE_IRIS;

  function getCurrentDateParts(date) {
    const now = date instanceof Date ? date : new Date();
    return {
      year: now.getFullYear(),
      month: String(now.getMonth() + 1).padStart(2, "0"),
      day: String(now.getDate()).padStart(2, "0"),
    };
  }

  function toCamelCase(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, function (_, chr) {
        return chr.toUpperCase();
      });
  }

  function toPascalCase(str) {
    return String(str || "")
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

  function parseFileExtension(filename) {
    if (typeof filename !== "string") return "";
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === filename.length - 1) return "";
    return filename.slice(lastDot + 1).toLowerCase();
  }

  function detectFormatByExtension(extension) {
    if (typeof extension !== "string") return "unsupported";
    const normalized = extension.toLowerCase();
    const spreadsheetExts = ["csv", "tsv", "xls", "xlsx"];
    const ontologyExts = ["ttl", "turtle", "n3", "nt", "ntriples", "nq", "nquads", "rdf", "owl", "xml", "jsonld", "json-ld", "trig"];

    if (spreadsheetExts.includes(normalized)) return "spreadsheet";
    if (ontologyExts.includes(normalized)) return "ontology";
    return "unsupported";
  }

  function guessMediaType(text) {
    const content = String(text || "");
    if (/^\s*\{[\s\S]*"@context"\s*:/.test(content) || /^\s*\[[\s\S]*"@context"\s*:/.test(content)) {
      return "application/ld+json";
    }
    if (/<rdf:RDF\b/.test(content)) return "application/rdf+xml";
    if (/^\s*@prefix\b|@base\b|:\s/.test(content)) return "text/turtle";
    if (/^\s*<[^>]+>\s+<[^>]+>\s+/.test(content)) return "application/n-triples";
    return "text/plain";
  }

  function isValidOntology(content) {
    return (
      typeof content === "string" &&
      content.length > 0 &&
      /rdf:RDF|@prefix|owl:Ontology|"@context"\s*:/.test(content)
    );
  }

  function generateOntologySettings(options) {
    const opts = options || {};
    const dateParts = opts.dateParts || getCurrentDateParts();
    const base = opts.base || "http://example.org";
    const label = opts.label || "Example Ontology";
    const creator = opts.creator || "Barry Guarino";
    const description = opts.description || "An example ontology";
    const delimiter = opts.delimiter || "/";
    const iriMode = opts.iriMode || "opaque";
    const opaqueLeading = opts.opaqueLeading || "ont";
    const opaqueDigits = opts.opaqueDigits == null ? 6 : opts.opaqueDigits;
    const opaqueStart = opts.opaqueStart == null ? 1 : opts.opaqueStart;
    const readableCase = opts.readableCase || "PascalCase";
    const normalizedLabel = toPascalCase(label);

    return {
      iri: `${base}${delimiter}${normalizedLabel}`,
      [NS.owl.versionIRI]: `${base}/${dateParts.year}-${dateParts.month}-${dateParts.day}${delimiter}${normalizedLabel}`,
      [NS.owl.versionInfo]: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
      [NS.rdfs.label]: label,
      [NS.dcterms.creator]: creator,
      [NS.dcterms.description]: description,
      iriMode,
      opaqueLeading,
      opaqueDigits,
      opaqueStart,
      readableCase,
      delimiter,
      base,
    };
  }

  function escapeCsvField(value) {
    const text = String(value == null ? "" : value);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildCsvExportRows(options) {
    const headers = Array.isArray(options && options.headers) ? options.headers : [];
    const rows = Array.isArray(options && options.rows) ? options.rows : [];
    const resolveCellValue =
      options && typeof options.resolveCellValue === "function"
        ? options.resolveCellValue
        : function (_, __, value) {
            return value;
          };

    const csvRows = [headers.slice()];
    rows.forEach(function (row, rowIndex) {
      csvRows.push(
        headers.map(function (_, colIndex) {
          const rawValue = Array.isArray(row) ? row[colIndex] : "";
          return String(resolveCellValue(rowIndex, colIndex, rawValue) ?? "");
        })
      );
    });
    return csvRows;
  }

  function generateCsvString(options) {
    return buildCsvExportRows(options)
      .map(function (row) {
        return row.map(escapeCsvField).join(",");
      })
      .join("\r\n");
  }

  function deriveOntologyImportTarget(quads, iris) {
    const cfg = iris || {};
    const rdfTypeIri = cfg.rdfTypeIri || NS.rdf.type;
    const owlOntologyIri = cfg.owlOntologyIri || NS.owl.Ontology;
    const owlVersionIri = cfg.owlVersionIri || NS.owl.versionIRI;
    const ontologySubjects = new Set();
    const versionIris = new Map();

    (Array.isArray(quads) ? quads : []).forEach(function (quad) {
      const subject = quad && quad.subject && quad.subject.value;
      const predicate = quad && quad.predicate && quad.predicate.value;
      const object = quad && quad.object && quad.object.value;
      if (!subject || !predicate || !object) return;

      if (predicate === rdfTypeIri && object === owlOntologyIri) {
        ontologySubjects.add(subject);
      }
      if (predicate === owlVersionIri) {
        versionIris.set(subject, object);
      }
    });

    const ontologyIri = ontologySubjects.values().next().value || null;
    return {
      ontologyIri,
      importIri: ontologyIri ? versionIris.get(ontologyIri) || ontologyIri : null,
    };
  }

const api = {
  getCurrentDateParts,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  parseFileExtension,
  detectFormatByExtension,
  guessMediaType,
  isValidOntology,
  generateOntologySettings,
  escapeCsvField,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export {
  getCurrentDateParts,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  parseFileExtension,
  detectFormatByExtension,
  guessMediaType,
  isValidOntology,
  generateOntologySettings,
  escapeCsvField,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export default api;
