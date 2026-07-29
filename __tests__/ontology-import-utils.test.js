// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import { deriveOntologyImportTarget } from "../docs/app/tom-core-utils.js";
import { COMMON_NAMESPACE_IRIS as NS } from "../docs/app/shared/namespace-registry/namespace-registry.js";

function quad(subject, predicate, object) {
  return {
    subject: { value: subject },
    predicate: { value: predicate },
    object: { value: object },
  };
}

describe("ontology import target derivation", () => {
  test("prefers owl:versionIRI over the ontology IRI", () => {
    const quads = [
      quad(
        "http://example.org/ontology",
        NS.rdf.type,
        NS.owl.Ontology
      ),
      quad(
        "http://example.org/ontology",
        NS.owl.versionIRI,
        "http://example.org/ontology/2026-04-13"
      ),
    ];

    expect(deriveOntologyImportTarget(quads)).toEqual({
      ontologyIri: "http://example.org/ontology",
      importIri: "http://example.org/ontology/2026-04-13",
    });
  });

  test("falls back to ontology IRI when versionIRI is absent", () => {
    const quads = [
      quad(
        "http://example.org/ontology",
        NS.rdf.type,
        NS.owl.Ontology
      ),
    ];

    expect(deriveOntologyImportTarget(quads)).toEqual({
      ontologyIri: "http://example.org/ontology",
      importIri: "http://example.org/ontology",
    });
  });

  test("returns nulls when no ontology subject is present", () => {
    const quads = [
      quad(
        "http://example.org/class1",
        NS.rdf.type,
        NS.owl.Class
      ),
    ];

    expect(deriveOntologyImportTarget(quads)).toEqual({
      ontologyIri: null,
      importIri: null,
    });
  });
});
