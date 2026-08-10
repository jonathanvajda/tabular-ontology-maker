import { COMMON_NAMESPACE_IRIS } from '../namespace-registry/index.js';

/**
 * Derive the preferred ontology import target from parsed RDF quads.
 *
 * The import target is the ontology's `owl:versionIRI` when present, otherwise
 * the ontology IRI. This matches OWL import practice while keeping callers free
 * to display either value.
 *
 * @param {Array<{subject?: {value?: string}, predicate?: {value?: string}, object?: {value?: string}}>} quads
 * Parsed RDF/JS-like quads.
 * @param {object} [iris] Optional IRI overrides for tests or alternate profiles.
 * @param {string} [iris.rdfTypeIri]
 * @param {string} [iris.owlOntologyIri]
 * @param {string} [iris.owlVersionIri]
 * @returns {{ontologyIri: string|null, importIri: string|null}}
 */
export function deriveOntologyImportTarget(quads, iris = {}) {
  const rdfTypeIri = iris.rdfTypeIri || COMMON_NAMESPACE_IRIS.rdf.type;
  const owlOntologyIri = iris.owlOntologyIri || COMMON_NAMESPACE_IRIS.owl.Ontology;
  const owlVersionIri = iris.owlVersionIri || COMMON_NAMESPACE_IRIS.owl.versionIRI;
  const ontologySubjects = new Set();
  const versionIris = new Map();

  for (const quad of Array.isArray(quads) ? quads : []) {
    const subject = quad?.subject?.value;
    const predicate = quad?.predicate?.value;
    const object = quad?.object?.value;
    if (!subject || !predicate || !object) continue;

    if (predicate === rdfTypeIri && object === owlOntologyIri) {
      ontologySubjects.add(subject);
    }
    if (predicate === owlVersionIri) {
      versionIris.set(subject, object);
    }
  }

  const ontologyIri = ontologySubjects.values().next().value || null;
  return {
    ontologyIri,
    importIri: ontologyIri ? versionIris.get(ontologyIri) || ontologyIri : null
  };
}

