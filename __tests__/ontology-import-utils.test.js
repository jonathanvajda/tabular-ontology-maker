const { deriveOntologyImportTarget } = require("../docs/app/tom-core-utils.js");

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
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "http://www.w3.org/2002/07/owl#Ontology"
      ),
      quad(
        "http://example.org/ontology",
        "http://www.w3.org/2002/07/owl#versionIRI",
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
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "http://www.w3.org/2002/07/owl#Ontology"
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
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        "http://www.w3.org/2002/07/owl#Class"
      ),
    ];

    expect(deriveOntologyImportTarget(quads)).toEqual({
      ontologyIri: null,
      importIri: null,
    });
  });
});
