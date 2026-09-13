import type { Delivery, ItemStatus } from "../types";

/** Un secteur métier : "fashion"/"tcg", ou l'id d'un univers personnalisé ajouté par
 *  l'utilisateur (hors "all", qui n'a de sens que dans les pages avec sélecteur interne). */
export type SectorDomain = string;

/** Toutes les destinations inter-sections passent par ici : un seul endroit à relire. */
export const links = {
  stock: (f: { status?: ItemStatus | "all"; brand?: string; type?: string; size?: string; q?: string; secteur?: SectorDomain } = {}) =>
    withQuery("/stock", f),
  ventes: (f: { delivery?: Delivery | "all"; platform?: string; brand?: string; type?: string; size?: string; secteur?: SectorDomain } = {}) =>
    withQuery("/ventes", f),
  livraison: (f: { tab?: "a_partir" | "a_venir"; secteur?: SectorDomain } = {}) => withQuery("/livraison", f),
  sav: () => "/sav",
  retours: () => "/sav?tab=retours",
  facturation: (f: { state?: "all" | "unpaid" | "paid" } = {}) => withQuery("/facturation", f),
  newDoc: (itemId: string) => `/facturation?new=${itemId}`,
  doc: (docId: string) => `/facturation?doc=${docId}`,
  bilan: (f: { secteur?: SectorDomain } = {}) => withQuery("/bilan", f),
  deal: () => "/deal",
  clients: (f: { q?: string; client?: string } = {}) => withQuery("/clients", f),
  fournisseurs: (f: { q?: string } = {}) => withQuery("/fournisseurs", f),
  achats: (f: { secteur?: SectorDomain } = {}) => withQuery("/achats", f),
  arrivage: () => "/achats",
  charges: () => "/charges",
  todo: () => "/todo",
  sourcing: () => "/sourcing",
  performance: (f: { secteur?: SectorDomain } = {}) => withQuery("/performance", f),
  tcg: (f: { category?: "raw" | "graded" | "sealed" | "grading" | "blister" | "case" | "all"; game?: string } = {}) => withQuery("/tcg", f),
  reglages: () => "/reglages",
  secteur: (s: SectorDomain) => `/secteur?secteur=${s}`,
};

function withQuery(path: string, filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== "all") params.set(k, v);
  });
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
