import {
  getCurrentDateParts,
  toCamelCase,
  generateOntologySettings,
  loadOntologySettings,
  isValidOntology
} from '../src/ontology-settings.js';

// Mock localStorage
beforeEach(() => {
  localStorage.clear();
  jest.resetModules();
});

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

describe('generateOntologySettings and loadOntologySettings', () => {
  it('should generate and store settings in localStorage', () => {
    const baseIRI = "http://example.org";
    const label = "My Ontology";

    const settings = generateOntologySettings(baseIRI, label);
    expect(settings["iri"]).toContain("myOntology");
    expect(settings["rdfs:label"]).toBe("My Ontology");

    const stored = JSON.parse(localStorage.getItem('ontologySettings'));
    expect(stored).toEqual(settings);
  });

  it('should load settings from localStorage', () => {
    const expected = { test: "value" };
    localStorage.setItem('ontologySettings', JSON.stringify(expected));
    expect(loadOntologySettings()).toEqual(expected);
  });
});

describe('isValidOntology', () => {
  it('should detect valid RDF or OWL strings', () => {
    expect(isValidOntology("@prefix ex: <http://example.org/> .")).toBe(true);
    expect(isValidOntology("<rdf:RDF></rdf:RDF>")).toBe(true);
    expect(isValidOntology("<owl:Ontology rdf:about='...'></owl:Ontology>")).toBe(true);
    expect(isValidOntology("")).toBe(false);
    expect(isValidOntology("not a valid rdf")).toBe(false);
  });
});
