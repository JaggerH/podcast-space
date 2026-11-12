/*
 * On-device offline store (IndexedDB): episode metadata in one store, the
 * audio bytes (Blob) in another, so listing downloaded episodes never loads
 * audio into memory. This is what makes airplane-mode playback real: once an
 * episode's blob is here, playback uses an object URL and needs no network
 * (the app page itself must already be open — see the offline section copy).
 */

export interface OfflineMeta {
  episodeKey: string;
  podcastKey: string | null;
  podcastTitle: string;
  episodeTitle: string;
  audioUrl: string;
  artworkUrl: string | null;
  durationSec: number | null;
  sizeBytes: number;
  downloadedAt: number;
}

const DB_NAME = "podcast-offline";
const DB_VERSION = 1;
const META_STORE = "episode-meta";
const BLOB_STORE = "episode-blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "episodeKey" });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
    });
  }
  return dbPromise;
}

function tx<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  run: (stores: IDBObjectStore[]) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const stores = storeNames.map((n) => transaction.objectStore(n));
        let request: IDBRequest<T> | undefined;
        try {
          request = run(stores);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("IndexedDB 操作失败"));
          return;
        }
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 操作失败"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 操作被中止"));
      }),
  );
}

export async function offlineSupported(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export async function listOfflineMeta(): Promise<OfflineMeta[]> {
  const all = await tx<OfflineMeta[]>([META_STORE], "readonly", (stores) => stores[0]!.getAll());
  return (all ?? []).sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export async function getOfflineMeta(episodeKey: string): Promise<OfflineMeta | null> {
  const one = await tx<OfflineMeta>([META_STORE], "readonly", (stores) => stores[0]!.get(episodeKey));
  return one ?? null;
}

export async function getOfflineBlob(episodeKey: string): Promise<Blob | null> {
  const blob = await tx<Blob>([BLOB_STORE], "readonly", (stores) => stores[0]!.get(episodeKey));
  return blob ?? null;
}

export async function putOfflineEpisode(meta: OfflineMeta, blob: Blob): Promise<void> {
  await tx([META_STORE, BLOB_STORE], "readwrite", (stores) => {
    stores[0]!.put(meta);
    stores[1]!.put(blob, meta.episodeKey);
    return undefined;
  });
}

export async function removeOfflineEpisode(episodeKey: string): Promise<void> {
  await tx([META_STORE, BLOB_STORE], "readwrite", (stores) => {
    stores[0]!.delete(episodeKey);
    stores[1]!.delete(episodeKey);
    return undefined;
  });
}
