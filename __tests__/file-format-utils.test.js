// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  getFilenameExtension,
  getInputKindForExtension,
  guessRdfMimeTypeFromText,
} from "../docs/app/shared/format-registry/index.js";
import { isValidOntology } from "../docs/app/tom-core-utils.js";

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

  test("shared guessRdfMimeTypeFromText recognizes JSON-LD before Turtle-like punctuation", () => {
    expect(guessRdfMimeTypeFromText('{ "@context": { "ex": "http://example.org/" }, "@id": "ex:test" }')).toBe("application/ld+json");
    expect(guessRdfMimeTypeFromText('@prefix ex: <http://example.org/> .')).toBe("text/turtle");
    expect(guessRdfMimeTypeFromText('<rdf:RDF></rdf:RDF>')).toBe("application/rdf+xml");
    expect(guessRdfMimeTypeFromText('<http://ex/s> <http://ex/p> <http://ex/o> .')).toBe("application/n-triples");
    expect(guessRdfMimeTypeFromText('plain text')).toBe("text/plain");
  });

  test("isValidOntology accepts Turtle, RDF/XML, and JSON-LD markers", () => {
    expect(isValidOntology('@prefix ex: <http://example.org/> .')).toBe(true);
    expect(isValidOntology('<rdf:RDF></rdf:RDF>')).toBe(true);
    expect(isValidOntology('{ "@context": { "ex": "http://example.org/" } }')).toBe(true);
    expect(isValidOntology("")).toBe(false);
    expect(isValidOntology("just some text")).toBe(false);
  });
});
