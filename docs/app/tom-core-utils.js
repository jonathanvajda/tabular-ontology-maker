// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda
import {
  createOntologySettingsViewFromMetadataRecord,
  deriveOntologyImportTarget,
  generateOntologySettings
} from './shared/ontology-metadata/index.js';
import { serializeDelimitedRows } from './shared/tabular-io/index.js';

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
   * App code should not depend on a specific grid adapter row representation
   * here: the durable export contract is ordered table rows.
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

const api = {
  createOntologySettingsViewFromMetadataRecord,
  generateOntologySettings,
  normalizeTomTableRows,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export {
  createOntologySettingsViewFromMetadataRecord,
  generateOntologySettings,
  normalizeTomTableRows,
  buildCsvExportRows,
  generateCsvString,
  deriveOntologyImportTarget,
};

export default api;
