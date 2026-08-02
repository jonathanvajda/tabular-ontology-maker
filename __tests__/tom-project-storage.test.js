import {
  readLatestTomSavedSession,
  readTomOntologySettings,
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
    await writeTomOntologySettings({ iri: 'http://example.org#Ontology', label: 'Ontology' });

    await expect(readTomOntologySettings()).resolves.toEqual({
      iri: 'http://example.org#Ontology',
      label: 'Ontology'
    });
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
  });

  test('falls back to read-only legacy TOM IndexedDB sessions', async () => {
    globalThis.indexedDB.seed('TabularOntologyDB', 'workspaceStore', [{
      id: 1,
      timestamp: '2026-07-01T12:00:00.000Z',
      rows: [['legacy']]
    }]);
    globalThis.indexedDB.seed('TabularOntologyDB', 'rdfStore', [{
      id: 1,
      timestamp: '2026-07-01T12:00:00.000Z',
      rdfData: '@prefix legacy: <http://example.org/> .',
      format: 'ttl'
    }]);

    await expect(readLatestTomSavedSession()).resolves.toMatchObject({
      source: 'legacy-indexeddb',
      latestWorkspace: { rows: [['legacy']] },
      latestRdfRecord: {
        rdfData: '@prefix legacy: <http://example.org/> .',
        format: 'ttl'
      }
    });
  });
});
