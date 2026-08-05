// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

import {
  getCurrentDateParts,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  generateOntologySettings,
} from "../docs/app/tom-core-utils.js";
import { COMMON_NAMESPACE_IRIS } from "../docs/app/shared/namespace-registry/namespace-registry.js";

describe("ontology settings utilities", () => {
  test("getCurrentDateParts formats a provided date predictably", () => {
    expect(getCurrentDateParts(new Date("2026-04-13T12:00:00Z"))).toEqual({
      year: 2026,
      month: "04",
      day: "13",
    });
  });

  test("case conversion helpers stay stable", () => {
    expect(toCamelCase("Example Ontology")).toBe("exampleOntology");
    expect(toPascalCase("example ontology")).toBe("ExampleOntology");
    expect(toSnakeCase("Example Ontology Value")).toBe("example_ontology_value");
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

    expect(settings.iri).toBe("http://example.org#TestOntology");
    expect(settings[COMMON_NAMESPACE_IRIS.owl.versionIRI]).toBe("http://example.org/2026-04-13#TestOntology");
    expect(settings[COMMON_NAMESPACE_IRIS.owl.versionInfo]).toBe("2026-04-13");
    expect(settings.opaqueLeading).toBe("ONT_");
    expect(settings.opaqueDigits).toBe(5);
    expect(settings.opaqueStart).toBe(42);
    expect(settings.readableCase).toBe("snake_case");
  });
});
