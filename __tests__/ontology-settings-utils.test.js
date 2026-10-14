// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  createOntologySettingsViewFromMetadataRecord,
  generateOntologySettings,
} from "../docs/app/tom-core-utils.js";
import { COMMON_NAMESPACE_IRIS } from "../docs/app/shared/namespace-registry/namespace-registry.js";
import {
  getLocalDateParts,
  normalizeStringToCamelCase,
  normalizeStringToPascalCase,
  normalizeStringToSnakeCase
} from "../docs/app/shared/normalization-utils/index.js";

describe("ontology settings utilities", () => {
  test("promoted date helper formats a provided date predictably", () => {
    expect(getLocalDateParts(new Date("2026-04-13T12:00:00Z"))).toEqual({
      year: "2026",
      month: "04",
      day: "13",
    });
  });

  test("promoted case conversion helpers cover TOM's legacy expectations", () => {
    expect(normalizeStringToCamelCase("Example Ontology")).toBe("exampleOntology");
    expect(normalizeStringToPascalCase("example ontology")).toBe("ExampleOntology");
    expect(normalizeStringToSnakeCase("Example Ontology Value")).toBe("example_ontology_value");
  });

  test("generateOntologySettings builds consistent ontology metadata", () => {
    const settings = generateOntologySettings({
      base: "http://example.org",
      label: "Test Ontology",
      creator: "Tester",
      description: "For regression tests",
      delimiter: "#",
      iriMode: "opaque",
      opaqueLeading: "ONT_",
      opaqueDigits: 5,
      opaqueStart: 42,
      readableCase: "snake_case",
      dateParts: { year: 2026, month: "04", day: "13" },
    });

    expect(settings["@id"]).toBe("http://example.org#TestOntology");
    expect(settings[COMMON_NAMESPACE_IRIS.owl.versionIRI]).toEqual([{ "@id": "http://example.org/2026-04-13#TestOntology" }]);
    expect(settings[COMMON_NAMESPACE_IRIS.owl.versionInfo]).toEqual([{ "@value": "2026-04-13" }]);
    expect(settings.opaqueLeading).toBeUndefined();

    const view = createOntologySettingsViewFromMetadataRecord(settings);
    expect(view.iri).toBe("http://example.org#TestOntology");
    expect(view.opaqueLeading).toBe("ONT_");
    expect(view.opaqueDigits).toBe(5);
    expect(view.opaqueStart).toBe(42);
    expect(view.readableCase).toBe("snake_case");
  });
});
