// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

const {
  escapeCsvField,
  buildCsvExportRows,
  generateCsvString,
} = require("../docs/app/tom-core-utils.js");

describe("CSV export utilities", () => {
  test("escapeCsvField quotes commas, quotes, and newlines", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
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
});
