#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Generate a simplified JSON lookup from an OWL/RDF file.

Usage:
  python generate-lookup-json.py some-ontology.ttl
Output:
  some-ontology-lookup.json

Schema per item:
{
  "iri": <full IRI string>,
  "type": <OWL type CURIE, e.g., "owl:NamedIndividual", "owl:Class">,
  "curie": <CURIE made with provided prefixes>,
  "label": <rdfs:label string or None>,
  "synonym": [ list of strings from skos:altLabel | skos:prefLabel | cceo:acronym | cco2:ont00001753 ],
  "deprecated": <boolean>
}
"""

import argparse
import json
import logging
import os
import sys
from rdflib import Graph, URIRef, Namespace, RDF, RDFS, Literal
from rdflib.namespace import OWL, SKOS, DC, DCTERMS
from rdflib.util import guess_format

# -----------------------
# Logging
# -----------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
log = logging.getLogger("lookup-json")

# -----------------------
# Prefixes for CURIEs
# -----------------------
PREFIXES = {
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "dc11": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "obo": "http://purl.obolibrary.org/obo/",
    "cceo": "http://www.ontologyrepository.com/CommonCoreOntologies/",
    "cco2": "https://www.commoncoreontologies.org/",
}

# Namespaces
CCEONS = Namespace(PREFIXES["cceo"])
CCO2NS = Namespace(PREFIXES["cco2"])

# Synonym properties
SYN_PROPS = [
    SKOS.altLabel,
    SKOS.prefLabel,
    CCEONS["acronym"],
    CCO2NS["ont00001753"],
]

# OWL types we care about, in priority order when multiple types exist
OWL_TYPE_PRIORITY = [
    OWL.NamedIndividual,
    OWL.Class,
    OWL.ObjectProperty,
    OWL.DatatypeProperty,
    OWL.AnnotationProperty,
    OWL.Ontology,  # rarely desired, but included for completeness
]

# -----------------------
# Helpers
# -----------------------

def bind_prefixes(g: Graph):
    """Bind all provided prefixes to the graph's namespace manager."""
    for pfx, iri in PREFIXES.items():
        g.namespace_manager.bind(pfx, Namespace(iri), override=True)

def to_curie(uri: URIRef, g: Graph) -> str:
    """
    Convert a full IRI into a CURIE using the provided prefix bindings.
    Falls back to the IRI string if no compaction is possible.
    """
    try:
        qname = g.namespace_manager.qname(uri)
        return qname
    except Exception:
        # Manual longest-prefix compaction as fallback
        s = str(uri)
        best = None
        for pfx, base in PREFIXES.items():
            if s.startswith(base) and (best is None or len(base) > len(best[1])):
                best = (pfx, base)
        if best:
            return f"{best[0]}:{s[len(best[1]):]}"
        return s

def coerce_bool(lit: Literal) -> bool:
    """Coerce an RDF literal to bool using common conventions."""
    if isinstance(lit, Literal):
        val = str(lit).strip().lower()
        return val in {"true", "1", "yes"}
    return False

def first_label(g: Graph, s: URIRef):
    """Return the first rdfs:label (lexical form) if present; else None."""
    for _, _, o in g.triples((s, RDFS.label, None)):
        if isinstance(o, Literal):
            return str(o)
    return None

def collect_synonyms(g: Graph, s: URIRef):
    """Collect unique synonym strings from all configured synonym properties."""
    out = []
    seen = set()
    for p in SYN_PROPS:
        for _, _, o in g.triples((s, p, None)):
            if isinstance(o, Literal):
                text = str(o)
                if text not in seen:
                    seen.add(text)
                    out.append(text)
    return out

def is_deprecated(g: Graph, s: URIRef) -> bool:
    """Return boolean based on owl:deprecated (default False)."""
    for _, _, o in g.triples((s, OWL.deprecated, None)):
        return coerce_bool(o)
    return False

def best_owl_type(g: Graph, s: URIRef):
    """
    Choose the most relevant OWL type based on OWL_TYPE_PRIORITY.
    Returns the chosen type URIRef or None.
    """
    types = set(o for o in g.objects(s, RDF.type))
    for t in OWL_TYPE_PRIORITY:
        if t in types:
            return t
    # If nothing from priority list, see if any rdf:type exists that’s an OWL term
    for t in types:
        if str(t).startswith(str(OWL)):
            return t
    return None

def iter_entities(g: Graph):
    """
    Yield URIRef subjects that have at least one rdf:type (preferably OWL-related),
    skipping blank nodes.
    """
    subjects = set(s for s in g.subjects(RDF.type, None) if isinstance(s, URIRef))
    for s in subjects:
        yield s

# -----------------------
# Main
# -----------------------

def make_output_path(input_path: str) -> str:
    base, _ext = os.path.splitext(input_path)
    return f"{base}-lookup.json"

def load_graph(path: str) -> Graph:
    fmt = guess_format(path)
    if fmt is None:
        # Try a sensible default if unknown
        fmt = "turtle"
        log.warning("Could not guess format from extension; defaulting to Turtle.")
    log.info(f"Parsing '{path}' as {fmt}")
    g = Graph()
    bind_prefixes(g)
    g.parse(path, format=fmt)
    return g

def build_lookup(g: Graph):
    items = []
    for s in iter_entities(g):
        t = best_owl_type(g, s)
        if t is None:
            # If it has no recognizable OWL type, skip
            continue

        item = {
            "iri": str(s),
            "type": to_curie(t, g),            # e.g., owl:Class
            "curie": to_curie(s, g),           # e.g., obo:IAO_0000115
            "label": first_label(g, s),        # rdfs:label only (per spec)
            "synonym": collect_synonyms(g, s), # list of strings
            "deprecated": is_deprecated(g, s), # boolean
        }
        items.append(item)
    # Sort for stable output: by type then curie
    items.sort(key=lambda x: (x["type"], x["curie"]))
    return items

def main():
    ap = argparse.ArgumentParser(
        description="Generate a simplified JSON lookup from an OWL/RDF file."
    )
    ap.add_argument("input", help="Path to OWL/RDF file (ttl, rdf/xml, ntriples, trig, n3, etc.)")
    ap.add_argument("-o", "--output", help="Output JSON path (default: <input>-lookup.json)")
    args = ap.parse_args()

    if not os.path.exists(args.input):
        log.error(f"Input file not found: {args.input}")
        sys.exit(1)

    try:
        g = load_graph(args.input)
    except Exception as e:
        log.exception("Failed to parse input RDF/OWL file.")
        sys.exit(2)

    log.info("Building lookup objects…")
    data = build_lookup(g)

    out_path = args.output or make_output_path(args.input)
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log.info(f"Wrote {len(data)} items → {out_path}")
    except Exception as e:
        log.exception("Failed to write output JSON.")
        sys.exit(3)

if __name__ == "__main__":
    main()
