import type { ConversionResult } from "@/types/vector";

const DB_NAME = "r2v-lab-db-v2";
const DB_VERSION = 1;
const FILES_STORE = "files";
const RESULTS_STORE = "results";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE);
      }
      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        db.createObjectStore(RESULTS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function put<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).put(value, key);
  });
  db.close();
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(storeName).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
  db.close();
  return value;
}

async function del(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(storeName).delete(key);
  });
  db.close();
}

export async function putFileBlob(id: string, file: Blob): Promise<void> {
  return put(FILES_STORE, id, file);
}

/**
 * Writes multiple file blobs in a single transaction. Use when you want to
 * avoid many concurrent transactions; prefer sequential putFileBlob when
 * minimizing peak memory (e.g. many large images).
 */
export async function putFileBlobs(
  entries: { id: string; blob: Blob }[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(FILES_STORE);
    for (const { id, blob } of entries) {
      store.put(blob, id);
    }
  });
  db.close();
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(FILES_STORE, id);
}

export async function putResult(id: string, result: ConversionResult): Promise<void> {
  return put(RESULTS_STORE, id, result);
}

export async function deleteItemData(id: string): Promise<void> {
  await Promise.all([del(FILES_STORE, id), del(RESULTS_STORE, id)]);
}

export async function clearAllData(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([FILES_STORE, RESULTS_STORE], "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(FILES_STORE).clear();
    tx.objectStore(RESULTS_STORE).clear();
  });
  db.close();
}
