const browserGlobals = {
  Blob: 'readonly',
  BroadcastChannel: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  btoa: 'readonly',
  caches: 'readonly',
  requestAnimationFrame: 'readonly',
  structuredClone: 'readonly',
  AbortController: 'readonly',
  DataTransfer: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  customElements: 'readonly',
  getComputedStyle: 'readonly',
  global: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  CustomEvent: 'readonly',
  DOMParser: 'readonly',
  Event: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  HTMLElement: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  XMLSerializer: 'readonly',
  alert: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  confirm: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  globalThis: 'readonly',
  indexedDB: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  queueMicrotask: 'readonly',
  self: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly'
};

const vendorGlobals = {
  N3: 'readonly',
  Papa: 'readonly',
  Tabulator: 'readonly',
  XLSX: 'readonly',
  jsonld: 'readonly'
};

const testGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  jest: 'readonly',
  test: 'readonly'
};

export default [
  {
    ignores: [
      'coverage/**',
      'node_modules/**',
      'docs/app/shared/vendor/**',
      '**/*.min.js',
      '**/(deprecated)_*.js'
    ]
  },  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        ...vendorGlobals,
        process: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['__tests__/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: testGlobals
    }
  }
];
