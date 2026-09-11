import type { Delivery, ItemStatus } from "../types";

/** Toutes les destinations inter-sections passent par ici : un seul endroit à relire. */
export const links = {
  stock: (f: { status?: ItemStatus | "all"; brand?: string; type?: string; size?: string; q?: string } = {}) =>
    withQuery("/stock", f),
  ventes: (f: { delivery?: Delivery | "all"; platform?: string; brand?: string } = {}) =>
    withQuery("/ventes", f),
  livraison: (f: { tab?: "faire" | "recevoir"; late?: string } = {}) => withQuery("/livraison", f),
  facturation: (f: { state?: "all" | "unpaid" | "paid" } = {}) => withQuery("/facturation", f),
  newDoc: (itemId: string) => `/facturation?new=${itemId}`,
  doc: (docId: string) => `/facturation?doc=${docId}`,
  bilan: () => "/bilan",
  deal: () => "/deal",
  clients: (f: { q?: string; client?: string } = {}) => withQuery("/clients", f),
  fournisseurs: (f: { q?: string } = {}) => withQuery("/fournisseurs", f),
  charges: () => "/charges",
  todo: () => "/todo",
};

function withQuery(path: string, filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== "all") params.set(k, v);
  });
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
