// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda
import { COMMON_NAMESPACE_IRIS } from './shared/namespace-registry/namespace-registry.js';
import { serializeDelimitedRows } from './shared/tabular-io/index.js';

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

  function buildCsvExportRows(options) {
    const headers = Array.isArray(options && options.headers) ? options.headers : [];
    const rows = normalizeTomTableRows(options && options.rows, {
      headers,
      fields: options && options.fields,
      expectedColumnCount: headers.length,
    });
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

  /**
   * Normalizes TOM table data to the array-row shape consumed by RDF and CSV
   * generation.
   *
   * TOM historically used Handsontable and now uses a Glide Data Grid adapter.
   * App code should not depend on either internal row representation here: the
   * durable export contract is still ordered table rows.
   *
   * @param {unknown} rows Candidate rows from a grid adapter, snapshot, or test fixture.
   * @param {object} [options]
   * @param {string[]} [options.headers] Column headers to use as object keys.
   * @param {string[]} [options.fields] Adapter field names to use as object keys.
   * @param {number} [options.expectedColumnCount] Minimum output column count.
   * @returns {string[][]} Array rows padded to the expected column count.
   */
  function normalizeTomTableRows(rows, options) {
    const opts = options || {};
    const headers = Array.isArray(opts.headers) ? opts.headers : [];
    const fields = Array.isArray(opts.fields) ? opts.fields : [];
    const expectedColumnCount = Number.isInteger(opts.expectedColumnCount)
      ? Math.max(0, opts.expectedColumnCount)
      : Math.max(headers.length, fields.length);

    return (Array.isArray(rows) ? rows : []).map(function (row) {
      const next = [];
      const width = Math.max(expectedColumnCount, Array.isArray(row) ? row.length : 0);
      for (let index = 0; index < width; index += 1) {
        let value = "";
        if (Array.isArray(row)) {
          value = row[index] ?? "";
        } else if (row && typeof row === "object") {
          const field = fields[index];
          const header = headers[index];
          value = row[field] ?? row[header] ?? row[index] ?? "";
        }
        next.push(String(value ?? ""));
      }
      return next;
    });
  }

  function generateCsvString(options) {
    return serializeDelimitedRows(buildCsvExportRows(options), {
      delimiter: ",",
      newline: "\r\n",
      trailingNewline: false,
    });
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
  isValidOntology,
  generateOntologySettings,
  normalizeTomTableRows,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export {
  getCurrentDateParts,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  isValidOntology,
  generateOntologySettings,
  normalizeTomTableRows,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export default api;
