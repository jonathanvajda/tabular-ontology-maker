// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

const {
  parseFileExtension,
  detectFormatByExtension,
  guessMediaType,
} = require("../docs/app/tom-core-utils.js");

describe("runtime format registry integration", () => {
  afterEach(() => {
    delete globalThis.FormatRegistry;
  });

  test("TOM utility helpers consume the promoted browser registry at call time", () => {
    globalThis.FormatRegistry = {
      getFilenameExtension: jest.fn(() => "d3.json"),
      getInputKindForExtension: jest.fn(() => "data"),
      guessRdfMimeTypeFromText: jest.fn(() => "application/ld+json"),
    };

    expect(parseFileExtension("graph.d3.json")).toBe("d3.json");
    expect(detectFormatByExtension("json")).toBe("data");
    expect(guessMediaType('{ "@context": {} }')).toBe("application/ld+json");

    expect(globalThis.FormatRegistry.getFilenameExtension).toHaveBeenCalledWith("graph.d3.json");
    expect(globalThis.FormatRegistry.getInputKindForExtension).toHaveBeenCalledWith("json");
    expect(globalThis.FormatRegistry.guessRdfMimeTypeFromText).toHaveBeenCalledWith('{ "@context": {} }');
  });

  test("TOM utility helpers retain local fallbacks without a registry global", () => {
    expect(parseFileExtension("ontology.TTL")).toBe("ttl");
    expect(detectFormatByExtension("xlsx")).toBe("spreadsheet");
    expect(detectFormatByExtension("ttl")).toBe("ontology");
    expect(guessMediaType("@prefix ex: <http://example.org/> .")).toBe("text/turtle");
  });
});
