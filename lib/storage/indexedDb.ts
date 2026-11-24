import type { ConversionResult } from "@/types/vector";

const DB_NAME = "r2v-lab-db-v2";
const DB_VERSION = 1;
const FILES_STORE = "files";
const RESULTS_STORE = "results";

// Per-tab isolation.
//
// IndexedDB is shared across every tab of the same origin, but each tab
// owns its own queue. Keys are namespaced by a per-tab id kept in
// sessionStorage (per-tab storage that survives reloads), so one tab
// loading can never wipe another tab's in-progress conversion. Before
// this, mounting a second tab cleared the shared stores and the first
// tab's next re-convert failed with "Missing source image data."
const TAB_ID_KEY = "r2v-tab-id";
// Live-tab registry in localStorage: tab id -> last heartbeat timestamp.
// Lets a tab clean up files left behind by tabs that closed. Entries go
// stale when a tab stops heartbeating, so a crash still gets cleaned up.
const LIVE_TABS_KEY = "r2v-live-tabs";
const HEARTBEAT_MS = 30_000;
const STALE_TAB_MS = 5 * 60_000;
// Orphan cleanup runs shortly after mount, so a tab that just opened has
// already registered and its keys are never mistaken for orphans.
const ORPHAN_CLEANUP_DELAY_MS = 5_000;

export function getTabId(): string {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(TAB_ID_KEY);
  } catch {
    // Storage unavailable (private mode): fall through to a fresh id.
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      sessionStorage.setItem(TAB_ID_KEY, id);
    } catch {
      // Storage unavailable: the id still isolates this page load.
    }
  }
  return id;
}

/** Namespaced IndexedDB key for one tab's item. */
export function tabKey(tabId: string, id: string): string {
  return `${tabId}:${id}`;
}

/** The tab id a namespaced key belongs to, or null for a legacy bare key. */
export function keyTabId(key: string): string | null {
  const idx = key.indexOf(":");
  return idx > 0 ? key.slice(0, idx) : null;
}

type LiveTabs = Record<string, number>;

function readLiveTabs(): LiveTabs {
  try {
    const raw = localStorage.getItem(LIVE_TABS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: LiveTabs = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLiveTabs(tabs: LiveTabs): void {
  try {
    localStorage.setItem(LIVE_TABS_KEY, JSON.stringify(tabs));
  } catch {
    // Storage unavailable: orphan cleanup simply does not run.
  }
}

/** Drop registry entries that have not heartbeated recently. */
export function pruneLiveTabs(tabs: LiveTabs, now: number): LiveTabs {
  const out: LiveTabs = {};
  for (const [key, value] of Object.entries(tabs)) {
    if (now - value <= STALE_TAB_MS) out[key] = value;
  }
  return out;
}

/**
 * True when a stored key belongs to a tab that is gone: a legacy bare key
 * (from before namespacing), or a namespaced key whose tab is not in the
 * live registry or has gone stale. Keys of this tab or of a live tab are
 * never orphans.
 */
export function isOrphanKey(
  key: string,
  ownTabId: string,
  liveTabs: LiveTabs,
  now: number,
): boolean {
  const tabId = keyTabId(key);
  if (!tabId) return true;
  if (tabId === ownTabId) return false;
  const lastSeen = liveTabs[tabId];
  return lastSeen === undefined || now - lastSeen > STALE_TAB_MS;
}

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
    tx.objectStore(storeName).put(value, tabKey(getTabId(), key));
  });
  db.close();
}

async function get<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(storeName).get(tabKey(getTabId(), key));
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
    tx.objectStore(storeName).delete(tabKey(getTabId(), key));
  });
  db.close();
}

async function deleteKeys(
  storeName: string,
  shouldDelete: (key: string) => boolean,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(storeName);
    const request = store.getAllKeys();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      for (const key of request.result) {
        if (typeof key === "string" && shouldDelete(key)) store.delete(key);
      }
    };
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
    const tabId = getTabId();
    for (const { id, blob } of entries) {
      store.put(blob, tabKey(tabId, id));
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

/**
 * Delete only this tab's stored files and results. The old shared clear
 * wiped every open tab's work; this keeps the mount-time cleanup (the
 * queue is never restored, so leftovers from an earlier visit in this
 * tab are unreachable) without touching other tabs.
 */
export async function clearTabData(): Promise<void> {
  const prefix = `${getTabId()}:`;
  await Promise.all(
    [FILES_STORE, RESULTS_STORE].map((storeName) =>
      deleteKeys(storeName, (key) => key.startsWith(prefix)),
    ),
  );
}

/** Delete files and results left behind by tabs that are gone. */
export async function cleanupOrphanedData(): Promise<void> {
  const ownTabId = getTabId();
  const now = Date.now();
  const liveTabs = pruneLiveTabs(readLiveTabs(), now);
  await Promise.all(
    [FILES_STORE, RESULTS_STORE].map((storeName) =>
      deleteKeys(storeName, (key) => isOrphanKey(key, ownTabId, liveTabs, now)),
    ),
  );
}

/**
 * Register this tab as live (heartbeat) and schedule orphan cleanup.
 * Returns a stop function for unmount; the registry entry itself is
 * removed on beforeunload, so a tab that closes normally leaves no
 * stale entry behind.
 */
export function initTabStorage(): () => void {
  const tabId = getTabId();
  const touch = () => {
    const tabs = pruneLiveTabs(readLiveTabs(), Date.now());
    tabs[tabId] = Date.now();
    writeLiveTabs(tabs);
  };
  touch();
  const heartbeat = setInterval(touch, HEARTBEAT_MS);
  const cleanupTimer = setTimeout(() => {
    void cleanupOrphanedData();
  }, ORPHAN_CLEANUP_DELAY_MS);
  const onUnload = () => {
    const tabs = readLiveTabs();
    delete tabs[tabId];
    writeLiveTabs(tabs);
  };
  window.addEventListener("beforeunload", onUnload);
  return () => {
    clearInterval(heartbeat);
    clearTimeout(cleanupTimer);
    window.removeEventListener("beforeunload", onUnload);
  };
}
