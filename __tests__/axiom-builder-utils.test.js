import AxiomBuilder from "../docs/app/tom-axiom-builder.js";
import { COMMON_NAMESPACE_IRIS } from "../docs/app/shared/namespace-registry/namespace-registry.js";

const nn = (value) => ({ termType: "NamedNode", value });
const bn = (value) => ({ termType: "BlankNode", value });
const lit = (value) => ({
  termType: "Literal",
  value: String(value),
  language: "",
    datatype: nn(COMMON_NAMESPACE_IRIS.xsd.string),
});
const quad = (subject, predicate, object) => ({ subject, predicate: nn(predicate), object });

const prefixes = {
  ex: "http://example.org/",
};

function resolver(value) {
  if (value.startsWith("ex:")) return `http://example.org/${value.slice(3)}`;
  if (value.startsWith("<") && value.endsWith(">")) return value.slice(1, -1);
  return null;
}

describe("TOM axiom builder utilities", () => {
  test("parses supported object restrictions", () => {
    const ast = AxiomBuilder.parseExpression("ex:has_part some ex:Wheel", resolver);
    expect(ast).toMatchObject({
      type: "restriction",
      propertyIri: "http://example.org/has_part",
      operator: "some",
      filler: {
        type: "class",
        iri: "http://example.org/Wheel",
      },
    });
  });

  test("splits additional simple superclasses into structured axioms", () => {
    const quads = [
      quad(nn("http://example.org/Car"), COMMON_NAMESPACE_IRIS.rdfs.subClassOf, nn("http://example.org/Vehicle")),
      quad(nn("http://example.org/Car"), COMMON_NAMESPACE_IRIS.rdfs.subClassOf, nn("http://example.org/Artifact")),
    ];

    const record = AxiomBuilder.extractClassAxioms(quads, {
      subjectIri: "http://example.org/Car",
      primaryIsA: "http://example.org/Vehicle",
      prefixes,
    });

    expect(record.axioms).toHaveLength(1);
    expect(record.axioms[0]).toMatchObject({
      kind: "SubClassOf",
      expressionText: "ex:Artifact",
      source: "import",
    });
  });

  test("converts supported subclass restriction blank nodes into structured axioms", () => {
    const restriction = bn("r1");
    const quads = [
      quad(nn("http://example.org/Car"), COMMON_NAMESPACE_IRIS.rdfs.subClassOf, nn("http://example.org/Vehicle")),
      quad(nn("http://example.org/Car"), COMMON_NAMESPACE_IRIS.rdfs.subClassOf, restriction),
      quad(restriction, COMMON_NAMESPACE_IRIS.rdf.type, nn(COMMON_NAMESPACE_IRIS.owl.Restriction)),
      quad(restriction, COMMON_NAMESPACE_IRIS.owl.onProperty, nn("http://example.org/has_part")),
      quad(restriction, COMMON_NAMESPACE_IRIS.owl.someValuesFrom, nn("http://example.org/Wheel")),
    ];

    const record = AxiomBuilder.extractClassAxioms(quads, {
      subjectIri: "http://example.org/Car",
      primaryIsA: "http://example.org/Vehicle",
      prefixes,
    });

    expect(record.axioms).toHaveLength(1);
    expect(record.axioms[0].expressionText).toBe("ex:has_part some ex:Wheel");
    expect(record.preservedTriples).toHaveLength(0);
  });

  test("preserves unsupported subclass blank nodes as opaque triples", () => {
    const unsupported = bn("u1");
    const quads = [
      quad(nn("http://example.org/Car"), COMMON_NAMESPACE_IRIS.rdfs.subClassOf, unsupported),
      quad(unsupported, COMMON_NAMESPACE_IRIS.rdf.type, nn(COMMON_NAMESPACE_IRIS.owl.Class)),
      quad(unsupported, COMMON_NAMESPACE_IRIS.owl.intersectionOf, lit("not-a-list")),
    ];

    const record = AxiomBuilder.extractClassAxioms(quads, {
      subjectIri: "http://example.org/Car",
      primaryIsA: "",
      prefixes,
    });

    expect(record.axioms).toHaveLength(0);
    expect(record.preservedTriples).toHaveLength(3);
    expect(record.preservedTriples[0].predicate.value).toBe(COMMON_NAMESPACE_IRIS.rdfs.subClassOf);
  });
});
