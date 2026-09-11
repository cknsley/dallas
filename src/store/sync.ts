import type { AppState } from "../types";

export type SyncStatus = "local" | "connecting" | "synced" | "error";

export interface SyncInfo {
  status: SyncStatus;
  label: string;
  detail: string;
}

type Listener = (remote: AppState) => void;

/**
 * Sauvegarde locale par défaut, bascule automatique vers un stockage
 * synchronisé multi-appareil dès qu'un point de synchro est configuré
 * (`VITE_SYNC_URL` + `VITE_SYNC_KEY` dans un fichier `.env.local`).
 *
 * Contrat attendu côté serveur :
 *   GET  <url>  ->  200 { ...AppState }  |  404 si aucun état enregistré
 *   PUT  <url>  <-  { ...AppState }
 * L'en-tête `X-Sync-Key` transporte la clé si elle est renseignée.
 *
 * Sans serveur configuré, la synchro reste active entre les onglets du même
 * navigateur via BroadcastChannel.
 */
const URL_ = (import.meta.env.VITE_SYNC_URL as string | undefined)?.trim();
const KEY = (import.meta.env.VITE_SYNC_KEY as string | undefined)?.trim();
const POLL_MS = 20000;

let channel: BroadcastChannel | null = null;
let listener: Listener | null = null;
let info: SyncInfo = { status: "local", label: "Sauvegarde locale", detail: "Cet appareil uniquement" };
const infoListeners = new Set<(i: SyncInfo) => void>();

function setInfo(next: SyncInfo) {
  info = next;
  infoListeners.forEach((fn) => fn(next));
}

export const getSyncInfo = (): SyncInfo => info;
export function subscribeSyncInfo(fn: (i: SyncInfo) => void): () => void {
  infoListeners.add(fn);
  return () => infoListeners.delete(fn);
}

const headers = (): HeadersInit => ({
  "Content-Type": "application/json",
  ...(KEY ? { "X-Sync-Key": KEY } : {}),
});

export function initSync(onRemote: Listener, current: () => AppState) {
  listener = onRemote;

  try {
    channel = new BroadcastChannel("atelier-revente");
    channel.onmessage = (e) => {
      const remote = e.data as AppState;
      if (remote && remote.updatedAt > current().updatedAt) listener?.(remote);
    };
  } catch {
    channel = null;
  }

  if (!URL_) {
    setInfo({
      status: "local",
      label: "Sauvegarde locale",
      detail: channel ? "Synchronisé entre les onglets de ce navigateur" : "Cet appareil uniquement",
    });
    return () => channel?.close();
  }

  setInfo({ status: "connecting", label: "Connexion…", detail: URL_ });
  let alive = true;

  const pull = async () => {
    try {
      const res = await fetch(URL_, { headers: headers(), cache: "no-store" });
      if (res.status === 404) {
        setInfo({ status: "synced", label: "Synchronisé", detail: "Multi-appareil actif" });
        void push(current());
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const remote = (await res.json()) as AppState;
      setInfo({ status: "synced", label: "Synchronisé", detail: "Multi-appareil actif" });
      if (alive && remote && typeof remote.updatedAt === "number") {
        if (remote.updatedAt > current().updatedAt) listener?.(remote);
        else if (remote.updatedAt < current().updatedAt) void push(current());
      }
    } catch (e) {
      setInfo({
        status: "error",
        label: "Hors ligne",
        detail: "Les données restent enregistrées sur cet appareil",
      });
    }
  };

  void pull();
  const timer = window.setInterval(pull, POLL_MS);
  return () => {
    alive = false;
    window.clearInterval(timer);
    channel?.close();
  };
}

export async function push(state: AppState): Promise<void> {
  try {
    channel?.postMessage(state);
  } catch {
    /* onglet fermé */
  }
  if (!URL_) return;
  try {
    const res = await fetch(URL_, { method: "PUT", headers: headers(), body: JSON.stringify(state) });
    if (!res.ok) throw new Error(String(res.status));
    setInfo({ status: "synced", label: "Synchronisé", detail: "Multi-appareil actif" });
  } catch {
    setInfo({
      status: "error",
      label: "Hors ligne",
      detail: "Les données restent enregistrées sur cet appareil",
    });
  }
}
