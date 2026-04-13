const {
  parseFileExtension,
  detectFormatByExtension,
  guessMediaType,
  isValidOntology,
} = require("../docs/app/tom-core-utils.js");

describe("file and media type helpers", () => {
  test("parseFileExtension handles common and edge-case filenames", () => {
    expect(parseFileExtension("data.csv")).toBe("csv");
    expect(parseFileExtension("2026.04.13.ontology.JSONLD")).toBe("jsonld");
    expect(parseFileExtension("no-extension")).toBe("");
    expect(parseFileExtension("trailing.")).toBe("");
    expect(parseFileExtension(null)).toBe("");
  });

  test("detectFormatByExtension classifies supported formats", () => {
    expect(detectFormatByExtension("csv")).toBe("spreadsheet");
    expect(detectFormatByExtension("xlsx")).toBe("spreadsheet");
    expect(detectFormatByExtension("ttl")).toBe("ontology");
    expect(detectFormatByExtension("jsonld")).toBe("ontology");
    expect(detectFormatByExtension("trig")).toBe("ontology");
    expect(detectFormatByExtension("exe")).toBe("unsupported");
  });

  test("guessMediaType recognizes JSON-LD before Turtle-like punctuation", () => {
    expect(guessMediaType('{ "@context": { "ex": "http://example.org/" }, "@id": "ex:test" }')).toBe("application/ld+json");
    expect(guessMediaType('@prefix ex: <http://example.org/> .')).toBe("text/turtle");
    expect(guessMediaType('<rdf:RDF></rdf:RDF>')).toBe("application/rdf+xml");
    expect(guessMediaType('<http://ex/s> <http://ex/p> <http://ex/o> .')).toBe("application/n-triples");
    expect(guessMediaType('plain text')).toBe("text/plain");
  });

  test("isValidOntology accepts Turtle, RDF/XML, and JSON-LD markers", () => {
    expect(isValidOntology('@prefix ex: <http://example.org/> .')).toBe(true);
    expect(isValidOntology('<rdf:RDF></rdf:RDF>')).toBe(true);
    expect(isValidOntology('{ "@context": { "ex": "http://example.org/" } }')).toBe(true);
    expect(isValidOntology("")).toBe(false);
    expect(isValidOntology("just some text")).toBe(false);
  });
});
