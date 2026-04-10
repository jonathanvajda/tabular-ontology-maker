import {
  buildOpaqueIri,
  buildReadableIri,
  detectFormatByExtension,
  generateOntologySettings,
  getCurrentDateParts,
  isLikelyOntology,
  parseFileExtension,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
} from "@/lib/ontology";
import { w3cIRI } from "@/lib/constants";

describe("ontology helpers", () => {
  test("returns date parts as padded strings", () => {
    const { year, month, day } = getCurrentDateParts();
    expect(year).toMatch(/^\d{4}$/);
    expect(month).toMatch(/^\d{2}$/);
    expect(day).toMatch(/^\d{2}$/);
  });

  test("normalizes case formats", () => {
    expect(toCamelCase("Example Ontology")).toBe("exampleOntology");
    expect(toPascalCase("example ontology")).toBe("ExampleOntology");
    expect(toSnakeCase("Example Ontology")).toBe("example_ontology");
  });

  test("generates stable ontology settings", () => {
    const settings = generateOntologySettings("http://example.org", "My Ontology", "Ada", "Test", "#", "readable");
    expect(settings.iri).toBe("http://example.org#MyOntology");
    expect(settings[w3cIRI.RDFS_LABEL]).toBe("My Ontology");
    expect(settings[w3cIRI.OWL_VERSION_INFO]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("builds opaque and readable iris", () => {
    const settings = generateOntologySettings("http://example.org", "My Ontology", "Ada", "Test", "#", "readable");
    expect(buildOpaqueIri(7, settings)).toContain("ont000007");
    expect(buildReadableIri("My Term", settings, new Set(["http://example.org#MyTerm"]))).toBe("http://example.org#MyTerm_2");
  });

  test("detects file formats and ontology text", () => {
    expect(parseFileExtension("sample.ttl")).toBe("ttl");
    expect(detectFormatByExtension("xlsx")).toBe("spreadsheet");
    expect(detectFormatByExtension("ttl")).toBe("ontology");
    expect(isLikelyOntology("@prefix ex: <http://example.org/> .")).toBe(true);
  });
});
