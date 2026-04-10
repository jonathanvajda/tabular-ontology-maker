import { generateOntologySettings } from "@/lib/ontology";
import type { OntologySettings } from "@/types";

const DB_NAME = "TabularOntologyDB";
const DB_VERSION = 1;
const STORE_NAME = "rdfStore";
const SETTINGS_STORE = "ontologySettingsStore";

export async function ensureDb(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

export async function loadOntologySettings() {
  const db = await ensureDb();
  const tx = db.transaction(SETTINGS_STORE, "readonly");
  const rec = await idbRequest(tx.objectStore(SETTINGS_STORE).get("ontologySettings"));
  if (rec && (rec as any).value) {
    return (rec as any).value as OntologySettings;
  }

  const defaults = generateOntologySettings();
  const writeTx = db.transaction(SETTINGS_STORE, "readwrite");
  writeTx.objectStore(SETTINGS_STORE).put({
    key: "ontologySettings",
    value: defaults,
    updatedAt: new Date().toISOString(),
  });
  await idbTransactionDone(writeTx);
  return defaults;
}

export async function saveOntologySettings(next: OntologySettings) {
  const db = await ensureDb();
  const tx = db.transaction(SETTINGS_STORE, "readwrite");
  tx.objectStore(SETTINGS_STORE).put({
    key: "ontologySettings",
    value: next,
    updatedAt: new Date().toISOString(),
  });
  await idbTransactionDone(tx);
}

export async function saveRdfSession(rdfData: string, format: string) {
  const db = await ensureDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add({
    rdfData,
    format,
    timestamp: new Date().toISOString(),
  });
  await idbTransactionDone(tx);
}

export async function getSavedSessions() {
  const db = await ensureDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const result = "getAll" in store ? await idbRequest(store.getAll()) : [];
  await idbTransactionDone(tx);
  return result as Array<{ rdfData: string; format: string; timestamp: string }>;
}

export async function hasPriorSession() {
  const db = await ensureDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const count = await idbRequest(tx.objectStore(STORE_NAME).count());
  await idbTransactionDone(tx);
  return count > 0;
}
