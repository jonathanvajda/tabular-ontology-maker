import { BASE_HEADERS, w3cIRI } from "@/lib/constants";
import { getIsAPredicate, resolveToIri } from "@/lib/ontology";
import type { GridRow, OntologySettings, PredicateColumnMeta } from "@/types";

const formatMap: Record<string, string> = {
  ttl: "Turtle",
  rdf: "RDF/XML",
  jsonld: "JSON-LD",
  nt: "N-Triples",
  trig: "TriG",
};

export const mimeTypes: Record<string, string> = {
  ttl: "text/turtle",
  rdf: "application/rdf+xml",
  jsonld: "application/ld+json",
  nt: "application/n-triples",
  trig: "application/trig",
};

export async function generateRdfString(
  rows: GridRow[],
  settings: OntologySettings,
  predicateMeta: PredicateColumnMeta[],
  format = "ttl"
) {
  const N3 = window.N3;
  const writer = new N3.Writer({
    prefixes: {
      owl: "http://www.w3.org/2002/07/owl#",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      skos: "http://www.w3.org/2004/02/skos/core#",
      dcterms: "http://purl.org/dc/terms/",
    },
    format: formatMap[format] || "Turtle",
  });

  const ontologyIri = settings.iri || "http://example.org/ExampleOntology";

  writer.addQuad(
    N3.DataFactory.namedNode(ontologyIri),
    N3.DataFactory.namedNode(w3cIRI.RDF_TYPE),
    N3.DataFactory.namedNode(w3cIRI.OWL_ONTOLOGY)
  );

  rows.forEach((row) => {
    if (!row.iri || !row.elementType) return;

    writer.addQuad(
      N3.DataFactory.namedNode(row.iri),
      N3.DataFactory.namedNode(w3cIRI.RDF_TYPE),
      N3.DataFactory.namedNode(`http://www.w3.org/2002/07/owl#${row.elementType}`)
    );

    if (row.label) {
      writer.addQuad(
        N3.DataFactory.namedNode(row.iri),
        N3.DataFactory.namedNode(w3cIRI.RDFS_LABEL),
        N3.DataFactory.literal(row.label)
      );
    }

    if (row.definition) {
      writer.addQuad(
        N3.DataFactory.namedNode(row.iri),
        N3.DataFactory.namedNode(w3cIRI.SKOS_DEFINITION),
        N3.DataFactory.literal(row.definition)
      );
    }

    const isAPredicate = getIsAPredicate(row.elementType);
    const resolvedIsA = resolveToIri(String(row.isA || ""));
    if (isAPredicate && resolvedIsA) {
      writer.addQuad(
        N3.DataFactory.namedNode(row.iri),
        N3.DataFactory.namedNode(isAPredicate),
        N3.DataFactory.namedNode(resolvedIsA)
      );
    }

    if (row.isCuratedInOntology) {
      writer.addQuad(
        N3.DataFactory.namedNode(row.iri),
        N3.DataFactory.namedNode(w3cIRI.CCO_CURATEDIN),
        N3.DataFactory.namedNode(String(row.isCuratedInOntology))
      );
    }

    predicateMeta.forEach((meta) => {
      const cellValue = String(row[meta.field] || "").trim();
      if (!cellValue) return;

      if (meta.mode === "iri") {
        const resolved = resolveToIri(cellValue);
        writer.addQuad(
          N3.DataFactory.namedNode(row.iri),
          N3.DataFactory.namedNode(meta.predicateIri),
          resolved ? N3.DataFactory.namedNode(resolved) : N3.DataFactory.literal(cellValue)
        );
      } else {
        writer.addQuad(
          N3.DataFactory.namedNode(row.iri),
          N3.DataFactory.namedNode(meta.predicateIri),
          N3.DataFactory.literal(cellValue)
        );
      }
    });
  });

  return await new Promise<string>((resolve, reject) => {
    writer.end((error: unknown, result: string) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export function n3FormatForSaved(format: string) {
  const text = String(format || "").toLowerCase();
  if (text === "ttl" || text.includes("turtle")) return "Turtle";
  if (text === "nt" || text.includes("n-triple")) return "N-Triples";
  if (text === "trig") return "TriG";
  return "Turtle";
}
