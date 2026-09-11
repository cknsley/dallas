/**
 * Stockage des photos dans IndexedDB (les blobs ne tiennent pas dans localStorage).
 * Une petite couche d'abonnement permet aux composants de re-rendre quand une
 * photo est ajoutée ou supprimée.
 */
const DB_NAME = "atelier-photos";
const STORE = "photos";
const MAX_EDGE = 1400;
const QUALITY = 0.78;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const urlCache = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribePhotos(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** URL déjà résolue pour cette photo, sinon null (le chargement est lancé). */
export function photoURL(id: string | null | undefined): string | null {
  if (!id) return null;
  const hit = urlCache.get(id);
  if (hit !== undefined) return hit || null;
  urlCache.set(id, "");
  tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>)
    .then((blob) => {
      urlCache.set(id, blob ? URL.createObjectURL(blob) : "");
      notify();
    })
    .catch(() => urlCache.set(id, ""));
  return null;
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  await tx("readwrite", (s) => s.put(blob, id) as IDBRequest<IDBValidKey>);
  const old = urlCache.get(id);
  if (old) URL.revokeObjectURL(old);
  urlCache.set(id, URL.createObjectURL(blob));
  notify();
}

export async function deletePhoto(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
  const old = urlCache.get(id);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(id);
  notify();
}

/** Redimensionne et recompresse une image avant stockage. */
export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Fichier illisible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image illisible"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_EDGE || height > MAX_EDGE) {
          const s = MAX_EDGE / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression impossible"))),
          "image/jpeg",
          QUALITY,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
