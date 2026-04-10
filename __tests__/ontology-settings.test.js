const {
  ONTOLOGY_KEYS,
  fromLabelWithCase,
  generateOntologySettings,
  getCurrentDateParts,
  isLikelyOntology,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
} = require("../docs/app/ontology_spreadsheet_helpers.js");

describe('getCurrentDateParts', () => {
  it('should return year, month, and day as strings', () => {
    const { year, month, day } = getCurrentDateParts();
    expect(year).toMatch(/^\d{4}$/);
    expect(month).toMatch(/^\d{2}$/);
    expect(day).toMatch(/^\d{2}$/);
  });
});

describe('toCamelCase', () => {
  it('should convert phrases to camelCase', () => {
    expect(toCamelCase("Example Ontology")).toBe("exampleOntology");
    expect(toCamelCase("Foo Bar Baz")).toBe("fooBarBaz");
    expect(toCamelCase("snake_case_text")).toBe("snakeCaseText");
  });
});

describe("case helpers", () => {
  it("should support pascal and snake case generation", () => {
    expect(toPascalCase("example ontology")).toBe("ExampleOntology");
    expect(toSnakeCase("Example Ontology")).toBe("example_ontology");
    expect(fromLabelWithCase("Example Ontology", "camelCase")).toBe("exampleOntology");
  });
});

describe("generateOntologySettings", () => {
  it("should generate ontology metadata with stable IRI keys", () => {
    const settings = generateOntologySettings(
      "http://example.org",
      "My Ontology",
      "Ada Lovelace",
      "A test ontology",
      "#",
      "readable",
      "ont",
      8,
      10,
      "snake_case"
    );

    expect(settings.iri).toBe("http://example.org#MyOntology");
    expect(settings[ONTOLOGY_KEYS.label]).toBe("My Ontology");
    expect(settings[ONTOLOGY_KEYS.creator]).toBe("Ada Lovelace");
    expect(settings[ONTOLOGY_KEYS.description]).toBe("A test ontology");
    expect(settings[ONTOLOGY_KEYS.versionIri]).toContain("http://example.org/");
    expect(settings[ONTOLOGY_KEYS.versionInfo]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(settings.readableCase).toBe("snake_case");
    expect(settings.delimiter).toBe("#");
  });
});

describe("isLikelyOntology", () => {
  it("should detect valid RDF or OWL strings", () => {
    expect(isLikelyOntology("@prefix ex: <http://example.org/> .")).toBe(true);
    expect(isLikelyOntology("<rdf:RDF></rdf:RDF>")).toBe(true);
    expect(isLikelyOntology("<owl:Ontology rdf:about='...'></owl:Ontology>")).toBe(true);
    expect(isLikelyOntology("")).toBe(false);
    expect(isLikelyOntology("not a valid rdf")).toBe(false);
  });
});
