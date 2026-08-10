import {
  COMMON_NAMESPACE_IRIS
} from '../docs/app/shared/namespace-registry/index.js';
import {
  readLatestTomSavedSession,
  readTomOntologySettings,
  migrateLegacyTomSessionToProjectStorage,
  openTomProjectStores,
  resetTomProjectStorageForTests,
  storeTomAuthoringSession,
  writeTomOntologySettings
} from '../docs/app/tom-project-storage.js';

function createAsyncRequest({ result, error = null }) {
  const request = { result, error, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
  queueMicrotask(() => {
    if (error) request.onerror?.();
    else request.onsuccess?.();
  });
  return request;
}

function createNameList(values = []) {
  return {
    values,
    contains(name) {
      return this.values.includes(name);
    },
    [Symbol.iterator]() {
      return this.values[Symbol.iterator]();
    }
  };
}

function createMockIndexedDB() {
  const databases = new Map();

  function ensureDb(name) {
    if (databases.has(name)) return databases.get(name);
    const stores = new Map();
    const db = {
      name,
      objectStoreNames: createNameList([]),
      close() {},
      createObjectStore(storeName, options = {}) {
        const records = new Map();
        const storeMeta = {
          name: storeName,
          keyPath: options.keyPath || null,
          autoIncrement: !!options.autoIncrement,
          nextKey: 1,
          records,
          indexNames: createNameList([]),
          createIndex(indexName) {
            this.indexNames.values.push(indexName);
          }
        };
        stores.set(storeName, storeMeta);
        db.objectStoreNames.values.push(storeName);
        return storeMeta;
      },
      transaction(storeNames, mode) {
        const tx = {
          mode,
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: null,
          completionQueued: false,
          objectStore(storeName) {
            const meta = stores.get(storeName);
            if (!meta) throw new Error(`Missing store ${storeName}`);
            return createObjectStoreApi(meta, tx);
          }
        };
        return tx;
      }
    };
    databases.set(name, db);
    return db;
  }

  function queueTransactionComplete(tx) {
    if (tx.completionQueued) return;
    tx.completionQueued = true;
    setTimeout(() => tx.oncomplete?.(), 0);
  }

  function createObjectStoreApi(meta, tx) {
    return {
      get(key) {
        const request = createAsyncRequest({ result: meta.records.get(key) || null });
        queueTransactionComplete(tx);
        return request;
      },
      put(value, key) {
        let resolvedKey = key;
        if (resolvedKey == null && meta.keyPath) resolvedKey = value?.[meta.keyPath];
        if (resolvedKey == null && meta.autoIncrement) {
          resolvedKey = meta.nextKey;
          meta.nextKey += 1;
          value = { ...value, id: resolvedKey };
        }
        meta.records.set(resolvedKey, value);
        const request = createAsyncRequest({ result: resolvedKey });
        queueTransactionComplete(tx);
        return request;
      },
      delete(key) {
        meta.records.delete(key);
        const request = createAsyncRequest({ result: undefined });
        queueTransactionComplete(tx);
        return request;
      },
      clear() {
        meta.records.clear();
        const request = createAsyncRequest({ result: undefined });
        queueTransactionComplete(tx);
        return request;
      },
      getAll() {
        const request = createAsyncRequest({ result: [...meta.records.values()] });
        queueTransactionComplete(tx);
        return request;
      },
      count() {
        const request = createAsyncRequest({ result: meta.records.size });
        queueTransactionComplete(tx);
        return request;
      }
    };
  }

  return {
    databases() {
      return Promise.resolve([...databases.keys()].map((name) => ({ name })));
    },
    open(name, version) {
      const db = ensureDb(name);
      const request = { result: db, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
      queueMicrotask(() => {
        request.transaction = {
          objectStore(storeName) {
            return db.transaction(storeName, 'versionchange').objectStore(storeName);
          }
        };
        if (version) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.();
      });
      return request;
    },
    seed(name, storeName, rows, { keyPath = 'id', autoIncrement = true } = {}) {
      const db = ensureDb(name);
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath, autoIncrement });
      }
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      rows.forEach((row) => store.put(row));
    }
  };
}

describe('TOM shared project storage adapter', () => {
  let originalIndexedDB;

  beforeEach(() => {
    originalIndexedDB = globalThis.indexedDB;
    globalThis.indexedDB = createMockIndexedDB();
    resetTomProjectStorageForTests();
  });

  afterEach(() => {
    resetTomProjectStorageForTests();
    globalThis.indexedDB = originalIndexedDB;
  });

  test('writes and reads ontology settings through shared project settings', async () => {
    await writeTomOntologySettings({
      iri: 'http://example.org#Ontology',
      base: 'http://example.org',
      label: 'Ontology',
      creator: 'Creator',
      contributor: ['Contributor']
    });

    await expect(readTomOntologySettings()).resolves.toMatchObject({
      iri: 'http://example.org#Ontology',
      base: 'http://example.org',
      [COMMON_NAMESPACE_IRIS.rdfs.label]: 'Ontology',
      [COMMON_NAMESPACE_IRIS.dcterms.creator]: 'Creator',
      [COMMON_NAMESPACE_IRIS.dcterms.contributor]: ['Contributor']
    });
    const stores = await openTomProjectStores();
    const stored = await stores.settings.readSettingValue(COMMON_NAMESPACE_IRIS.okea.OntologyMetadataProfile);
    expect(stored['@type']).toBe(COMMON_NAMESPACE_IRIS.okea.Setting);
    expect(stored[COMMON_NAMESPACE_IRIS.okea.settingKey]).toBe(COMMON_NAMESPACE_IRIS.okea.OntologyMetadataProfile);
    expect(stored[COMMON_NAMESPACE_IRIS.rdf.value]).toMatchObject({
      '@id': 'http://example.org#Ontology',
      '@type': [COMMON_NAMESPACE_IRIS.owl.Ontology],
      [COMMON_NAMESPACE_IRIS.dcterms.title]: [{ '@value': 'Ontology', '@language': 'en' }],
      [COMMON_NAMESPACE_IRIS.dcterms.creator]: [{ '@value': 'Creator' }],
      [COMMON_NAMESPACE_IRIS.dcterms.contributor]: [{ '@value': 'Contributor' }]
    });
    expect(stored[COMMON_NAMESPACE_IRIS.rdf.value][COMMON_NAMESPACE_IRIS.okea.hasOntologyBaseIri]).toEqual([
      { '@value': 'http://example.org', '@type': COMMON_NAMESPACE_IRIS.xsd.anyURI }
    ]);
    expect(stored[COMMON_NAMESPACE_IRIS.rdf.value][COMMON_NAMESPACE_IRIS.okea.hasIriPolicyModeTextValue]).toEqual([
      { '@value': 'opaque' }
    ]);
  });

  test('stores TOM sessions as workspace and RDF project artifacts', async () => {
    await storeTomAuthoringSession({
      timestamp: '2026-08-01T12:00:00.000Z',
      format: 'ttl',
      rdfString: '@prefix ex: <http://example.org/> .',
      workspaceSnapshot: {
        version: 1,
        timestamp: '2026-08-01T12:00:00.000Z',
        activeView: 'ontology',
        predicates: [],
        axioms: [],
        rows: [['http://example.org#A', 'A']]
      }
    });

    await expect(readLatestTomSavedSession()).resolves.toMatchObject({
      source: 'shared-project-portfolio',
      latestWorkspace: {
        rows: [['http://example.org#A', 'A']]
      },
      latestRdfRecord: {
        rdfData: '@prefix ex: <http://example.org/> .',
        format: 'ttl'
      }
    });
    const stores = await openTomProjectStores();
    const workspaceArtifacts = await stores.artifacts.listProjectArtifacts('project:default-workspace', {
      artifactKind: 'tom-workspace-snapshot'
    });
    const rdfArtifacts = await stores.artifacts.listProjectArtifacts('project:default-workspace', {
      artifactKind: 'ontology-rdf'
    });
    expect(workspaceArtifacts[0].payload[COMMON_NAMESPACE_IRIS.rdf.value].rows).toEqual([
      ['http://example.org#A', 'A']
    ]);
    expect(rdfArtifacts[0].payload[COMMON_NAMESPACE_IRIS.dcterms.format]).toBe('ttl');
    expect(rdfArtifacts[0].payload[COMMON_NAMESPACE_IRIS.rdf.value]).toEqual({
      '@value': '@prefix ex: <http://example.org/> .',
      '@type': COMMON_NAMESPACE_IRIS.xsd.string
    });
  });

  test('migrates latest legacy TOM IndexedDB sessions into shared project storage', async () => {
    globalThis.indexedDB.seed('TabularOntologyDB', 'workspaceStore', [{
      id: 1,
      timestamp: '2026-07-01T12:00:00.000Z',
      rows: [['legacy']]
    }, {
      id: 2,
      timestamp: '2026-07-02T12:00:00.000Z',
      rows: [['latest legacy']]
    }]);
    globalThis.indexedDB.seed('TabularOntologyDB', 'rdfStore', [{
      id: 1,
      timestamp: '2026-07-01T12:00:00.000Z',
      rdfData: '@prefix legacy: <http://example.org/> .',
      format: 'ttl'
    }, {
      id: 2,
      timestamp: '2026-07-02T12:00:00.000Z',
      rdfData: '{"@id":"http://example.org/latest"}',
      format: 'jsonld'
    }]);

    await expect(readLatestTomSavedSession()).resolves.toMatchObject({
      source: 'legacy-migrated-to-shared-project-portfolio',
      latestWorkspace: { rows: [['latest legacy']] },
      latestRdfRecord: {
        rdfData: '{"@id":"http://example.org/latest"}',
        format: 'jsonld'
      }
    });

    await expect(readLatestTomSavedSession()).resolves.toMatchObject({
      source: 'shared-project-portfolio',
      latestWorkspace: { rows: [['latest legacy']] },
      latestRdfRecord: {
        rdfData: '{"@id":"http://example.org/latest"}',
        format: 'jsonld'
      }
    });
  });

  test('stores generated RDF artifact MIME and extension through the format registry', async () => {
    await migrateLegacyTomSessionToProjectStorage({
      latestWorkspace: {
        timestamp: '2026-08-01T12:00:00.000Z',
        rows: [['s']]
      },
      latestRdfRecord: {
        timestamp: '2026-08-01T12:00:00.000Z',
        rdfData: '<http://example.org/s> <http://example.org/p> <http://example.org/o> .',
        format: 'nquads'
      }
    });

    await expect(readLatestTomSavedSession()).resolves.toMatchObject({
      latestRdfRecord: {
        format: 'nquads',
        rdfData: '<http://example.org/s> <http://example.org/p> <http://example.org/o> .'
      }
    });
    const stores = await openTomProjectStores();
    const artifacts = await stores.artifacts.listProjectArtifacts('project:default-workspace', {
      artifactKind: 'ontology-rdf'
    });
    expect(artifacts[0]).toMatchObject({
      mediaType: 'application/n-quads',
      extension: 'nq'
    });
  });
});
