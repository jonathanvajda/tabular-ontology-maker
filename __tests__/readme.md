# TOM Jest Coverage

The current TOM Jest suite covers the promoted shared-package migration paths:

| Area | Coverage |
| --- | --- |
| Ontology settings utilities | Date parts, case conversion, registry-backed RDF/OWL/DCTERMS settings keys |
| Project storage | Shared IndexedDB project settings, TOM workspace artifacts, generated RDF artifacts, legacy `TabularOntologyDB` migration |
| RDF I/O | Bundled N3 adapter serialization through shared `rdf-io` without dropping triples |
| Format registry | File extension and MIME detection for RDF, tabular, and unsupported inputs |
| Tabular export | Shared `tabular-io` CSV serialization and TOM row normalization |
| Ontology import | Ontology/version IRI target derivation |
| Predicate and feature utilities | Predicate modes, registry normalization, workspace snapshot normalization |

TOM should not use `localStorage` for durable settings. User/app/project settings now belong in shared IndexedDB project settings.
