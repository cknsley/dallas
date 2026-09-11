import type { AppState, Expense, Item, Period } from "../types";
import { num } from "./format";

/** Coût d'acquisition : prix payé + frais d'achat (port entrant, nettoyage, retouche). */
export const costOf = (i: Item): number => num(i.cost) + num(i.fees);

/** Frais supportés lors de la vente : commission de la plateforme + port à la charge du vendeur. */
export const saleCostsOf = (i: Item): number => num(i.saleFees) + num(i.shippingCost);

/** Encaissé pour la pièce : prix de vente + port refacturé à l'acheteur. */
export const revenueOf = (i: Item): number => num(i.price) + num(i.shippingPaid);

/** Marge nette : tout ce qui rentre moins tout ce qui sort, port compris. */
export const marginOf = (i: Item): number => revenueOf(i) - costOf(i) - saleCostsOf(i);

export const roiOf = (i: Item): number => {
  const engaged = costOf(i) + saleCostsOf(i);
  return engaged > 0 ? (marginOf(i) / engaged) * 100 : 0;
};

export interface Range {
  from: string;
  to: string;
  label: string;
}

export function periodRange(period: Period, now = new Date()): Range {
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: toISO(from),
      to: "9999-12-31",
      label: capitalize(now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })),
    };
  }
  if (period === "year") {
    return { from: `${now.getFullYear()}-01-01`, to: "9999-12-31", label: `Année ${now.getFullYear()}` };
  }
  return { from: "0000-01-01", to: "9999-12-31", label: "Depuis le début" };
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const inRange = (date: string, r: Range): boolean => !!date && date >= r.from && date <= r.to;

export const soldItems = (items: Item[], r?: Range): Item[] =>
  items.filter((i) => i.status === "vendu" && (!r || inRange(i.saleDate, r)));

export interface Stats {
  ca: number;
  /** Somme des estimations de revente des pièces non vendues. */
  stockEstimate: number;
  /** Marge que dégagerait le stock s'il partait aux prix estimés. */
  stockPotential: number;
  shippingIn: number;
  saleCosts: number;
  cost: number;
  marge: number;
  margePct: number;
  count: number;
  stockValue: number;
  stockCount: number;
  arrivage: number;
  enStock: number;
  engaged: number;
}

export function computeStats(state: AppState, r: Range): Stats {
  const sold = soldItems(state.items, r);
  const ca = sold.reduce((a, i) => a + num(i.price), 0);
  const shippingIn = sold.reduce((a, i) => a + num(i.shippingPaid), 0);
  const saleCosts = sold.reduce((a, i) => a + saleCostsOf(i), 0);
  const cost = sold.reduce((a, i) => a + costOf(i), 0);
  const marge = ca + shippingIn - cost - saleCosts;
  const inStock = state.items.filter((i) => i.status !== "vendu");
  const stockValue = inStock.reduce((a, i) => a + costOf(i), 0);
  // Une pièce sans estimation est comptée à son coût : jamais de valeur inventée.
  const stockEstimate = inStock.reduce((a, i) => a + (num(i.price) || costOf(i)), 0);
  const count = sold.length;
  return {
    ca,
    shippingIn,
    saleCosts,
    cost,
    marge,
    margePct: ca ? (marge / ca) * 100 : 0,
    count,
    stockValue,
    stockEstimate,
    stockPotential: stockEstimate - stockValue,
    stockCount: inStock.length,
    arrivage: state.items.filter((i) => i.status === "arrivage").length,
    enStock: state.items.filter((i) => i.status === "stock").length,
    engaged: stockValue,
  };
}

export type Dimension = "item" | "brand" | "type" | "size";

export interface DimRow {
  key: string;
  qty: number;
  ca: number;
  marge: number;
}

export function groupBy(items: Item[], dim: Dimension): DimRow[] {
  const keyOf = (i: Item) =>
    dim === "item" ? i.name || "Sans nom"
    : dim === "brand" ? i.brand || "Sans marque"
    : dim === "type" ? i.type || "Sans type"
    : i.size || "Sans taille";
  const map = new Map<string, DimRow>();
  for (const i of items) {
    const k = keyOf(i);
    const row = map.get(k) ?? { key: k, qty: 0, ca: 0, marge: 0 };
    row.qty += 1;
    row.ca += num(i.price);
    row.marge += marginOf(i);
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.ca - a.ca);
}

export function caOfYear(items: Item[], year: number): number {
  return items
    .filter((i) => i.status === "vendu" && i.saleDate.slice(0, 4) === String(year))
    .reduce((a, i) => a + num(i.price), 0);
}

export function monthlySeries(items: Item[], months = 12) {
  const now = new Date();
  const out: { label: string; key: string; ca: number; marge: number }[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      ca: 0,
      marge: 0,
    });
  }
  const index = new Map(out.map((o) => [o.key, o]));
  for (const i of soldItems(items)) {
    const bucket = index.get(i.saleDate.slice(0, 7));
    if (bucket) {
      bucket.ca += num(i.price);
      bucket.marge += marginOf(i);
    }
  }
  return out;
}

/* ============================ CHARGES GÉNÉRALES ============================ */

/** Part mensuelle d'une charge, étalée sur son nombre de mois si besoin. */
export const expenseMonthlyShare = (e: Expense): number => num(e.amount) / Math.max(1, e.amortizeMonths);

const monthKey = (iso: string): string => iso.slice(0, 7);
const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Tous les mois sur lesquels une charge est imputée. */
export function expenseMonths(e: Expense): string[] {
  const start = monthKey(e.date || "1970-01-01");
  const span = Math.max(1, e.amortizeMonths);
  return Array.from({ length: span }, (_, i) => addMonths(start, i));
}

/** Somme des charges déjà imputées (mois écoulés) sur une période donnée. */
export function chargesInRange(expenses: Expense[], r: Range): number {
  const nowMonth = monthKey(new Date().toISOString());
  const fromMonth = monthKey(r.from);
  const toMonth = monthKey(r.to) > nowMonth ? nowMonth : monthKey(r.to);
  return expenses.reduce((sum, e) => {
    const share = expenseMonthlyShare(e);
    const hit = expenseMonths(e).filter((m) => m >= fromMonth && m <= toMonth && m <= nowMonth);
    return sum + hit.length * share;
  }, 0);
}

/** Argent dormant : ce que représentent les ventes payées mais pas encore livrées.
 *  Tant que le colis n'est pas parti, l'opération n'est pas close. */
export function pendingDeliveryValue(items: Item[]): number {
  return items
    .filter((i) => i.status === "vendu" && i.delivery === "commandee")
    .reduce((a, i) => a + revenueOf(i), 0);
}
