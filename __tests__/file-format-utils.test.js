// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  getFilenameExtension,
  getInputKindForExtension,
  detectRdfMimeTypeFromText,
} from "../docs/app/shared/format-registry/index.js";
import { classifyOntologyInput } from "../docs/app/shared/ontology-utils/index.js";

describe("file and media type helpers", () => {
  test("shared getFilenameExtension handles common and edge-case filenames", () => {
    expect(getFilenameExtension("data.csv")).toBe("csv");
    expect(getFilenameExtension("2026.04.13.ontology.JSONLD")).toBe("jsonld");
    expect(getFilenameExtension("no-extension")).toBe("");
    expect(getFilenameExtension("trailing.")).toBe("");
    expect(getFilenameExtension(null)).toBe("");
  });

  test("shared getInputKindForExtension classifies supported formats", () => {
    expect(getInputKindForExtension("csv")).toBe("spreadsheet");
    expect(getInputKindForExtension("tsv")).toBe("spreadsheet");
    expect(getInputKindForExtension("xlsx")).toBe("spreadsheet");
    expect(getInputKindForExtension("ttl")).toBe("ontology");
    expect(getInputKindForExtension("n3")).toBe("ontology");
    expect(getInputKindForExtension("jsonld")).toBe("ontology");
    expect(getInputKindForExtension("nq")).toBe("ontology");
    expect(getInputKindForExtension("trig")).toBe("ontology");
    expect(getInputKindForExtension("owl")).toBe("ontology");
    expect(getInputKindForExtension("exe")).toBe("unsupported");
  });

  test("shared detectRdfMimeTypeFromText recognizes JSON-LD before Turtle-like punctuation", () => {
    expect(detectRdfMimeTypeFromText('{ "@context": { "ex": "http://example.org/" }, "@id": "ex:test" }')).toMatchObject({
      ok: true,
      value: { mimeType: "application/ld+json" }
    });
    expect(detectRdfMimeTypeFromText('@prefix ex: <http://example.org/> .')).toMatchObject({
      ok: true,
      value: { mimeType: "text/turtle" }
    });
    expect(detectRdfMimeTypeFromText('<rdf:RDF></rdf:RDF>')).toMatchObject({
      ok: true,
      value: { mimeType: "application/rdf+xml" }
    });
    expect(detectRdfMimeTypeFromText('<http://ex/s> <http://ex/p> <http://ex/o> .')).toMatchObject({
      ok: true,
      value: { mimeType: "application/n-triples" }
    });
    expect(detectRdfMimeTypeFromText('plain text')).toMatchObject({
      ok: true,
      value: { mimeType: "text/plain" }
    });
  });

  test("shared classifyOntologyInput accepts Turtle, RDF/XML, and JSON-LD markers", () => {
    expect(classifyOntologyInput({ text: '@prefix ex: <http://example.org/> .' }).isOntologyCandidate).toBe(true);
    expect(classifyOntologyInput({ text: '<rdf:RDF></rdf:RDF>' }).isOntologyCandidate).toBe(true);
    expect(classifyOntologyInput({ text: '{ "@context": { "ex": "http://example.org/" } }' }).isOntologyCandidate).toBe(true);
    expect(classifyOntologyInput({ text: "" }).isOntologyCandidate).toBe(false);
    expect(classifyOntologyInput({ text: "just some text" }).isOntologyCandidate).toBe(false);
  });
});
