// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  buildCsvExportRows,
  generateCsvString,
  normalizeTomTableRows,
} from "../docs/app/tom-core-utils.js";
import {
  escapeDelimitedCell,
  serializeDelimitedRows,
} from "../docs/app/shared/tabular-io/index.js";

describe("CSV export utilities", () => {
  test("shared tabular-io quotes commas, quotes, and newlines", () => {
    expect(escapeDelimitedCell("plain")).toBe("plain");
    expect(escapeDelimitedCell("a,b")).toBe('"a,b"');
    expect(escapeDelimitedCell('a"b')).toBe('"a""b"');
    expect(escapeDelimitedCell("a\nb")).toBe('"a\nb"');
  });

  test("buildCsvExportRows resolves values from raw rows", () => {
    const rows = buildCsvExportRows({
      headers: ["iri", "is a", "note"],
      rows: [["http://example.org/ont1", "Displayed Label - ex:Parent", 'He said "hi"']],
      resolveCellValue: (_, colIndex, rawValue) => {
        if (colIndex === 1) return "http://example.org/Parent";
        return rawValue;
      },
    });

    expect(rows).toEqual([
      ["iri", "is a", "note"],
      ["http://example.org/ont1", "http://example.org/Parent", 'He said "hi"'],
    ]);
  });

  test("generateCsvString produces stable CRLF-separated output", () => {
    const csv = generateCsvString({
      headers: ["iri", "is a", "definition"],
      rows: [["http://example.org/ont1", "Displayed Label - ex:Parent", "line 1\nline 2"]],
      resolveCellValue: (_, colIndex, rawValue) => {
        if (colIndex === 1) return "http://example.org/Parent";
        return rawValue;
      },
    });

    expect(csv).toBe(
      'iri,is a,definition\r\nhttp://example.org/ont1,http://example.org/Parent,"line 1\nline 2"'
    );
  });

  test("normalizeTomTableRows accepts Glide-style object rows", () => {
    expect(normalizeTomTableRows([
      {
        iri: "http://example.org/ont000001",
        label: "Doctor",
        elementType: "Class",
        definition: "A human person who has earned a doctorate.",
        isA: "cco2:ont00001017",
        isCuratedInOntology: "http://example.org/ExampleOntology",
      },
    ], {
      fields: ["iri", "label", "elementType", "definition", "isA", "isCuratedInOntology"],
      expectedColumnCount: 6,
    })).toEqual([[
      "http://example.org/ont000001",
      "Doctor",
      "Class",
      "A human person who has earned a doctorate.",
      "cco2:ont00001017",
      "http://example.org/ExampleOntology",
    ]]);
  });

  test("buildCsvExportRows does not drop object-row data", () => {
    const rows = buildCsvExportRows({
      headers: ["iri", "label", "element type"],
      fields: ["iri", "label", "elementType"],
      rows: [{
        iri: "http://example.org/ont000001",
        label: "Doctor",
        elementType: "Class",
      }],
    });

    expect(rows).toEqual([
      ["iri", "label", "element type"],
      ["http://example.org/ont000001", "Doctor", "Class"],
    ]);
  });

  test("shared tabular-io preserves TOM CRLF CSV output contract", () => {
    const csv = serializeDelimitedRows([
      ["iri", "is a", "definition"],
      ["http://example.org/ont1", "http://example.org/Parent", "line 1\nline 2"],
    ], {
      delimiter: ",",
      newline: "\r\n",
      trailingNewline: false,
    });

    expect(csv).toBe(
      'iri,is a,definition\r\nhttp://example.org/ont1,http://example.org/Parent,"line 1\nline 2"'
    );
  });
});
