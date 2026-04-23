// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Jonathan Vajda

module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: [
    "docs/app/tom-core-utils.js",
    "docs/app/tom-feature-utils.js",
  ],
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 90,
      lines: 95,
      statements: 95,
    },
  },
};
