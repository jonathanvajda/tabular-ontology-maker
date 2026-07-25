// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

const FormatRegistry = require("../docs/app/shared/format-registry/browser-global.js");

describe("browser-ready format registry", () => {
  test("detects supported MIME descriptors from filename extensions", () => {
    expect(FormatRegistry.getSupportedMimeTypeForFilename("ontology.TTL")).toMatchObject({
      ok: true,
      value: { mimeType: "text/turtle", category: "rdf" },
    });
    expect(FormatRegistry.getSupportedMimeTypeForFilename("table.xlsx")).toMatchObject({
      ok: true,
      value: {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        category: "tabular",
      },
    });
  });

  test("returns the agreed unknown-filetype error object for unsupported extensions", () => {
    expect(FormatRegistry.getSupportedMimeTypeForFilename("archive.zip")).toEqual({
      ok: false,
      error: "unknown filetype",
      input: "zip",
      extension: "zip",
    });
  });

  test("maps intended output extensions to MIME types and preferred extensions", () => {
    expect(FormatRegistry.getOutputMimeTypeForExtension("jsonld")).toMatchObject({
      ok: true,
      value: { mimeType: "application/ld+json", preferredExtension: "jsonld" },
    });
    expect(FormatRegistry.getPreferredExtensionForMimeType("application/n-quads")).toEqual({
      ok: true,
      value: "nquads",
    });
  });

  test("keeps N3 parser format names separate from MIME values", () => {
    expect(FormatRegistry.getN3ParserFormatForMimeType("text/turtle")).toEqual({
      ok: true,
      value: "Turtle",
    });
    expect(FormatRegistry.getN3ParserFormatForMimeType("application/n-quads")).toEqual({
      ok: true,
      value: "N-Quads",
    });
    expect(FormatRegistry.getN3ParserFormatForMimeType("application/ld+json")).toMatchObject({
      ok: false,
      error: "unsupported parser format",
      mimeType: "application/ld+json",
    });
  });

  test("builds TOM compatibility maps from the same registry", () => {
    expect(FormatRegistry.createFormatMimeTypeMap(["ttl", "jsonld", "csv", "nquads"])).toEqual({
      ttl: "text/turtle",
      jsonld: "application/ld+json",
      csv: "text/csv",
      nquads: "application/n-quads",
    });
    expect(FormatRegistry.createFormatExtensionMap(["ttl", "jsonld", "csv", "nquads"])).toEqual({
      ttl: "ttl",
      jsonld: "jsonld",
      csv: "csv",
      nquads: "nquads",
    });
  });
});
