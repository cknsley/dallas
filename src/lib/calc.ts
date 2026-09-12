import type { AppState, Expense, Item, Period } from "../types";
import { num } from "./format";

/** Nombre d'exemplaires sur la ligne, au minimum un. */
export const qtyOf = (i: Item): number => Math.max(1, num(i.quantity) || 1);

/** Coût d'acquisition de la ligne : (prix payé + frais d'achat) × quantité. */
export const costOf = (i: Item): number => (num(i.cost) + num(i.fees)) * qtyOf(i);

/** Frais supportés lors de la vente : commission et port valent pour l'envoi entier. */
export const saleCostsOf = (i: Item): number => num(i.saleFees) + num(i.shippingCost);

/** Encaissé pour la ligne : prix de vente × quantité, plus le port refacturé. */
export const revenueOf = (i: Item): number => num(i.price) * qtyOf(i) + num(i.shippingPaid);

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
  /** Faux pour « depuis le début », dont les bornes n'ont aucun sens à l'écran. */
  bounded?: boolean;
}

export function periodRange(period: Period, now = new Date()): Range {
  // Chaque période est fermée : du 1er au dernier jour, jamais ouverte sur l'avenir.
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: toISO(from),
      to: toISO(to),
      label: capitalize(now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })),
      bounded: true,
    };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { from: toISO(from), to: toISO(to), label: `T${q + 1} ${now.getFullYear()}`, bounded: true };
  }
  if (period === "year") {
    return {
      from: `${now.getFullYear()}-01-01`,
      to: `${now.getFullYear()}-12-31`,
      label: `Année ${now.getFullYear()}`,
      bounded: true,
    };
  }
  // Bornes techniques : « bounded » dit qu'elles ne sont pas affichables.
  return { from: "0000-01-01", to: "9999-12-31", label: "Depuis le début", bounded: false };
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
  charges: number;
  marge: number;
  margeNette: number;
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
  const ca = sold.reduce((a, i) => a + num(i.price) * qtyOf(i), 0);
  const shippingIn = sold.reduce((a, i) => a + num(i.shippingPaid), 0);
  const saleCosts = sold.reduce((a, i) => a + saleCostsOf(i), 0);
  const cost = sold.reduce((a, i) => a + costOf(i), 0);
  const marge = ca + shippingIn - cost - saleCosts;
  const charges = chargesInRange(state.expenses, r);
  const margeNette = marge - charges;
  const inStock = state.items.filter((i) => i.status !== "vendu");
  const stockValue = inStock.reduce((a, i) => a + costOf(i), 0);
  // Une pièce sans estimation est comptée à son coût : jamais de valeur inventée.
  const stockEstimate = inStock.reduce((a, i) => a + (num(i.price) ? num(i.price) * qtyOf(i) : costOf(i)), 0);
  const count = sold.length;
  return {
    ca,
    shippingIn,
    saleCosts,
    cost,
    charges,
    marge,
    margeNette,
    margePct: ca ? (margeNette / ca) * 100 : 0,
    count,
    stockValue,
    stockEstimate,
    stockPotential: stockEstimate - stockValue,
    stockCount: inStock.reduce((a, i) => a + qtyOf(i), 0),
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
    row.qty += qtyOf(i);
    row.ca += num(i.price) * qtyOf(i);
    row.marge += marginOf(i);
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.ca - a.ca);
}

export function caOfYear(items: Item[], year: number): number {
  return items
    .filter((i) => i.status === "vendu" && i.saleDate.slice(0, 4) === String(year))
    .reduce((a, i) => a + num(i.price) * qtyOf(i), 0);
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
      bucket.ca += num(i.price) * qtyOf(i);
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
  // On n'impute jamais un mois à venir : la borne haute s'arrête au mois courant.
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

/** Nombre de mois déjà entamés dans la période, pour une moyenne honnête. */
export function monthsElapsed(r: Range): number {
  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const from = r.from.slice(0, 7);
  const to = r.to.slice(0, 7);
  const last = to > nowMonth ? nowMonth : to;
  if (from > last) return 1;
  const [fy, fm] = from.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  return Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
}

/** Macro-catégorie d'une charge : Achat, Vente ou Activité générale. */
export function expenseKind(e: Partial<Expense>): "achat" | "vente" | "activite" {
  if (e.kind === "achat" || e.kind === "vente" || e.kind === "activite") return e.kind;
  const text = `${e.category || ""} ${e.label || ""} ${e.notes || ""}`.toLowerCase();
  if (text.includes("appro") || text.includes("reconditionnement") || text.includes("lot") || text.includes("grossiste") || text.includes("stock") || text.includes("achat")) {
    return "achat";
  }
  if (text.includes("emballage") || text.includes("commission") || text.includes("envoi") || text.includes("port") || text.includes("vinted") || text.includes("vestiaire") || text.includes("vente")) {
    return "vente";
  }
  return "activite";
}

export function chargesByKind(expenses: Expense[], r: Range): Record<"achat" | "vente" | "activite", { total: number; count: number }> {
  const result = {
    achat: { total: 0, count: 0 },
    vente: { total: 0, count: 0 },
    activite: { total: 0, count: 0 },
  };

  for (const e of expenses) {
    const k = expenseKind(e);
    const amount = chargesInRange([e], r);
    result[k].total += amount;
    if (amount > 0) result[k].count += 1;
  }
  return result;
}

/** Répartition des charges imputées sur la période, par catégorie. */
export function chargesByCategory(expenses: Expense[], r: Range): { key: string; total: number; count: number }[] {
  const map = new Map<string, { key: string; total: number; count: number }>();
  for (const e of expenses) {
    const amount = chargesInRange([e], r);
    if (amount <= 0) continue;
    const key = e.category || "Autre";
    const row = map.get(key) ?? { key, total: 0, count: 0 };
    row.total += amount;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Charges imputées mois par mois, sur les N derniers mois. */
export function chargesMonthlySeries(expenses: Expense[], months = 12) {
  const now = new Date();
  const out: { key: string; label: string; total: number }[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""), total: 0 });
  }
  const index = new Map(out.map((o) => [o.key, o]));
  for (const e of expenses) {
    const share = expenseMonthlyShare(e);
    for (const m of expenseMonths(e)) {
      const bucket = index.get(m);
      if (bucket) bucket.total += share;
    }
  }
  return out;
}

/** Ce qui n'a pas encore pesé sur la marge : les mois d'utilisation à venir. */
export function remainingToAmortize(expenses: Expense[]): number {
  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return expenses.reduce((sum, e) => {
    const future = expenseMonths(e).filter((m) => m > nowMonth).length;
    return sum + future * expenseMonthlyShare(e);
  }, 0);
}

export interface CashFlow {
  in: number;
  out: number;
  net: number;
  purchases: number;
  saleFees: number;
  charges: number;
  pending: number;
}

/**
 * Trésorerie de la période : ce qui est réellement rentré et sorti.
 * Une vente non payée ne compte pas comme une entrée ; un achat compte
 * dès sa date d'achat, même si l’article n’est pas encore vendu.
 */
export function cashFlow(state: AppState, r: Range): CashFlow {
  const cashedIn = state.items
    .filter((i) => i.status === "vendu" && i.delivery !== "non_payee" && inRange(i.saleDate, r))
    .reduce((a, i) => a + revenueOf(i), 0);

  const pending = state.items
    .filter((i) => i.status === "vendu" && i.delivery === "non_payee" && inRange(i.saleDate, r))
    .reduce((a, i) => a + revenueOf(i), 0);

  const purchases = state.items
    .filter((i) => inRange(i.buyDate, r))
    .reduce((a, i) => a + costOf(i), 0);

  const saleFees = state.items
    .filter((i) => i.status === "vendu" && i.delivery !== "non_payee" && inRange(i.saleDate, r))
    .reduce((a, i) => a + saleCostsOf(i), 0);

  const charges = chargesInRange(state.expenses, r);
  const out = purchases + saleFees + charges;

  return { in: cashedIn, out, net: cashedIn - out, purchases, saleFees, charges, pending };
}
