import {
  buildOpaqueOntologyIri,
  buildReadableOntologyIri,
  deriveOntologyImportTarget,
  findNextAvailableOpaqueOntologyIriNumber,
  generateOntologySettings,
  writeOntologyMetadataQuads
} from '../docs/app/shared/ontology-metadata/index.js';
import { COMMON_NAMESPACE_IRIS } from '../docs/app/shared/namespace-registry/index.js';
import * as CoreUtils from '../docs/app/tom-core-utils.js';

describe('TOM ontology metadata wiring', () => {
  test('CoreUtils exports promoted ontology settings behavior', () => {
    const settings = CoreUtils.generateOntologySettings({
      base: 'https://example.org',
      label: 'Example Ontology',
      creator: 'Creator',
      description: 'Description',
      dateParts: { year: '2026', month: '08', day: '10' }
    });

    expect(settings).toEqual(generateOntologySettings({
      base: 'https://example.org',
      label: 'Example Ontology',
      creator: 'Creator',
      description: 'Description',
      dateParts: { year: '2026', month: '08', day: '10' }
    }));
    expect(settings[COMMON_NAMESPACE_IRIS.owl.versionIRI]).toBe('https://example.org/2026-08-10/ExampleOntology');
  });

  test('CoreUtils exports promoted ontology import target derivation', () => {
    const quads = [
      {
        subject: { value: 'https://example.org/ont' },
        predicate: { value: COMMON_NAMESPACE_IRIS.rdf.type },
        object: { value: COMMON_NAMESPACE_IRIS.owl.Ontology }
      },
      {
        subject: { value: 'https://example.org/ont' },
        predicate: { value: COMMON_NAMESPACE_IRIS.owl.versionIRI },
        object: { value: 'https://example.org/2026/ont' }
      }
    ];

    expect(CoreUtils.deriveOntologyImportTarget(quads)).toEqual(deriveOntologyImportTarget(quads));
    expect(CoreUtils.deriveOntologyImportTarget(quads)).toEqual({
      ontologyIri: 'https://example.org/ont',
      importIri: 'https://example.org/2026/ont'
    });
  });

  test('promoted IRI provisioning covers opaque and readable TOM cases', () => {
    const settings = {
      base: 'https://example.org',
      delimiter: '/',
      opaqueLeading: 'ont',
      opaqueDigits: 6,
      readableCase: 'PascalCase'
    };

    const used = new Set([1, 2]);
    const next = findNextAvailableOpaqueOntologyIriNumber(used, settings, 1);
    expect(next).toBe(3);
    expect(buildOpaqueOntologyIri(next, settings)).toBe('https://example.org/ont000003');
    expect(buildReadableOntologyIri('Example entity', settings, new Set(['https://example.org/ExampleEntity']))).toBe('https://example.org/ExampleEntity_2');
  });

  test('promoted ontology metadata writer emits TOM ontology declaration and title quads', () => {
    const quads = writeOntologyMetadataQuads(generateOntologySettings({
      base: 'https://example.org',
      label: 'Example Ontology',
      creator: 'Creator',
      dateParts: { year: '2026', month: '08', day: '10' }
    }));

    expect(quads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subject: expect.objectContaining({ value: 'https://example.org/ExampleOntology' }),
        predicate: expect.objectContaining({ value: COMMON_NAMESPACE_IRIS.rdf.type }),
        object: expect.objectContaining({ value: COMMON_NAMESPACE_IRIS.owl.Ontology })
      }),
      expect.objectContaining({
        predicate: expect.objectContaining({ value: COMMON_NAMESPACE_IRIS.dcterms.title }),
        object: expect.objectContaining({ value: 'Example Ontology' })
      })
    ]));
  });
});
