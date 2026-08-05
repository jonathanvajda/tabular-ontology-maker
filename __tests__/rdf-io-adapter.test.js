// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import * as n3Module from "../docs/app/shared/vendor/n3.min.js";
import { serializeRdfDatasetWithAdapters } from "../docs/app/shared/rdf-io/index.js";
import { COMMON_NAMESPACE_IRIS } from "../docs/app/shared/namespace-registry/namespace-registry.js";
import { selectPrefixesUsedByRdfTerms } from "../docs/app/shared/namespace-registry/index.js";

const N3 = globalThis.N3 || n3Module.default || n3Module;

describe("RDF IO adapter integration", () => {
  test("serializes RDF/JS quads through bundled N3 without dropping triples", async () => {
    const { namedNode, literal, quad } = N3.DataFactory;
    const quads = [
      quad(
        namedNode("http://example.org/ont000001"),
        namedNode(COMMON_NAMESPACE_IRIS.rdf.type),
        namedNode(COMMON_NAMESPACE_IRIS.owl.Class)
      ),
      quad(
        namedNode("http://example.org/ont000001"),
        namedNode(COMMON_NAMESPACE_IRIS.rdfs.label),
        literal("Doctor")
      ),
    ];

    const result = await serializeRdfDatasetWithAdapters(quads, {
      format: "text/turtle",
      prefixes: {
        ex: "http://example.org/",
        owl: "http://www.w3.org/2002/07/owl#",
        rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      },
      runtime: { N3 },
    });

    expect(result.text).toContain("ex:ont000001");
    expect(result.text).toContain("owl:Class");
    expect(result.text).toContain('"Doctor"');
  });

  test("serializes Turtle with only prefixes used by the exported quads", async () => {
    const { namedNode, literal, quad } = N3.DataFactory;
    const quads = [
      quad(
        namedNode("http://example.org/ont000001"),
        namedNode(COMMON_NAMESPACE_IRIS.rdf.type),
        namedNode(COMMON_NAMESPACE_IRIS.owl.Class)
      ),
      quad(
        namedNode("http://example.org/ont000001"),
        namedNode(COMMON_NAMESPACE_IRIS.rdfs.label),
        literal("Doctor")
      ),
    ];
    const prefixes = {
      ex: "http://example.org/",
      owl: "http://www.w3.org/2002/07/owl#",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      skos: "http://www.w3.org/2004/02/skos/core#",
      dcterms: "http://purl.org/dc/terms/",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    };

    const usedPrefixes = selectPrefixesUsedByRdfTerms(prefixes, quads);
    const result = await serializeRdfDatasetWithAdapters(quads, {
      format: "text/turtle",
      prefixes: usedPrefixes.value,
      runtime: { N3 },
    });

    expect(result.text).toContain("@prefix ex:");
    expect(result.text).toContain("@prefix owl:");
    expect(result.text).toContain("@prefix rdfs:");
    expect(result.text).toContain("ex:ont000001");
    expect(result.text).not.toContain("@prefix skos:");
    expect(result.text).not.toContain("@prefix dcterms:");
    expect(result.text).not.toContain("@prefix xsd:");
  });
});
