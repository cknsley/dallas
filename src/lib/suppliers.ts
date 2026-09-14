import type { Item, SupplierRecord } from "../types";
import { costOf, marginOf, qtyOf, revenueOf } from "./calc";
import { num } from "./format";

/** Une commande passée chez un fournisseur, reconstituée depuis les articles. */
export interface SupplierOrder {
  id: string;
  date: string;
  items: Item[];
  pieces: number;
  total: number;
  received: number;
  expectedDate: string;
  late: boolean;
}

export interface Supplier {
  key: string;
  name: string;
  record: SupplierRecord | null;
  items: Item[];
  orders: SupplierOrder[];

  /** Articles commandés, toutes quantités confondues. */
  pieces: number;
  /** Articles déjà réceptionnés. */
  received: number;
  /** Articles encore en route. */
  waiting: number;
  purchases: number;
  debt: number;
  /** Part des achats déjà réglée. */
  paid: number;

  sales: number;
  margin: number;
  soldPieces: number;
  inStockPieces: number;
  stockValue: number;

  /** Part des articles achetés qui sont déjà revendus. */
  sellThrough: number;
  /** Marge moyenne par article revendu. */
  marginPerPiece: number;
  /** Retour sur les sommes engagées chez ce fournisseur. */
  roi: number;
  /** Délai moyen entre l'achat et la réception, en jours. */
  leadTime: number | null;
  /** Nombre d'articles arrivés après la date annoncée. */
  lateCount: number;
  /** Part des livraisons arrivées dans les temps. */
  onTimeRate: number | null;
  /** Panier moyen d'une commande. */
  avgOrder: number;

  firstBuy: string;
  lastBuy: string;
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);

export const supplierKey = (name: string) => name.trim().toLowerCase();

/** Mots qui trahissent un achat au détail plutôt qu'un vrai fournisseur. */
const RETAIL_HINTS = ["outlet", "magasin", "boutique", "store", "vinted", "leboncoin", "vestiaire", "ebay", "depop"];

/** Vrai si cette source ressemble à un achat au détail, à proposer d'écarter. */
export const looksLikeRetail = (name: string) => {
  const n = name.trim().toLowerCase();
  return RETAIL_HINTS.some((h) => n.includes(h));
};

export function buildSuppliers(items: Item[], records: SupplierRecord[] = []): Supplier[] {
  const byKey = new Map<string, Supplier>();
  const recordByKey = new Map(records.map((r) => [supplierKey(r.name), r]));

  for (const i of items) {
    const name = i.source.trim() || "Source non renseignée";
    const key = supplierKey(name);
    const s =
      byKey.get(key) ??
      ({
        key, name, record: recordByKey.get(key) ?? null, items: [], orders: [],
        pieces: 0, received: 0, waiting: 0, purchases: 0, debt: 0, paid: 0,
        sales: 0, margin: 0, soldPieces: 0, inStockPieces: 0, stockValue: 0,
        sellThrough: 0, marginPerPiece: 0, roi: 0,
        leadTime: null, lateCount: 0, onTimeRate: null, avgOrder: 0,
        firstBuy: i.buyDate, lastBuy: i.buyDate,
      } as Supplier);

    s.items.push(i);
    s.pieces += qtyOf(i);
    s.purchases += costOf(i);
    if (i.purchasePaid) s.paid += costOf(i);
    else s.debt += costOf(i);
    if (i.status === "arrivage") s.waiting += qtyOf(i);
    else s.received += qtyOf(i);

    if (i.status === "vendu") {
      s.soldPieces += qtyOf(i);
      s.sales += revenueOf(i);
      s.margin += marginOf(i);
    } else {
      s.inStockPieces += qtyOf(i);
      s.stockValue += costOf(i);
    }

    if (i.buyDate && (!s.firstBuy || i.buyDate < s.firstBuy)) s.firstBuy = i.buyDate;
    if (i.buyDate && i.buyDate > s.lastBuy) s.lastBuy = i.buyDate;

    byKey.set(key, s);
  }

  for (const s of byKey.values()) {
    // Délais et ponctualité, mesurés sur ce qui est effectivement arrivé.
    const delivered = s.items.filter((i) => i.buyDate && i.receiveDate);
    if (delivered.length > 0) {
      s.leadTime = Math.round(
        delivered.reduce((a, i) => a + Math.max(0, daysBetween(i.buyDate, i.receiveDate)), 0) / delivered.length,
      );
    }
    const promised = s.items.filter((i) => i.expectedDate && i.receiveDate);
    s.lateCount = promised.filter((i) => i.receiveDate > i.expectedDate).length;
    if (promised.length > 0) s.onTimeRate = ((promised.length - s.lateCount) / promised.length) * 100;

    s.sellThrough = s.pieces > 0 ? (s.soldPieces / s.pieces) * 100 : 0;
    s.marginPerPiece = s.soldPieces > 0 ? s.margin / s.soldPieces : 0;
    s.roi = s.purchases > 0 ? (s.margin / s.purchases) * 100 : 0;

    // Regroupement par commande : une commande sans identifiant vaut pour elle-même.
    const orders = new Map<string, SupplierOrder>();
    for (const i of s.items) {
      const id = i.orderId || `solo:${i.id}`;
      const o =
        orders.get(id) ??
        ({ id, date: i.buyDate, items: [], pieces: 0, total: 0, received: 0, expectedDate: i.expectedDate, late: false } as SupplierOrder);
      o.items.push(i);
      o.pieces += qtyOf(i);
      o.total += costOf(i);
      if (i.status !== "arrivage") o.received += qtyOf(i);
      if (i.expectedDate && (!o.expectedDate || i.expectedDate < o.expectedDate)) o.expectedDate = i.expectedDate;
      if (i.buyDate && i.buyDate < o.date) o.date = i.buyDate;
      orders.set(id, o);
    }
    const today = new Date().toISOString().slice(0, 10);
    s.orders = [...orders.values()]
      .map((o) => ({ ...o, late: o.received < o.pieces && !!o.expectedDate && o.expectedDate < today }))
      .sort((a, b) => b.date.localeCompare(a.date));
    s.avgOrder = s.orders.length > 0 ? s.purchases / s.orders.length : 0;
    s.items.sort((a, b) => b.buyDate.localeCompare(a.buyDate));
  }

  return [...byKey.values()].sort((a, b) => b.purchases - a.purchases);
}

/** Une fiche vierge, prête à être complétée. */
export const blankSupplierRecord = (name: string, id: string): SupplierRecord => ({
  id,
  name,
  contact: "",
  email: "",
  phone: "",
  url: "",
  address: "",
  zip: "",
  city: "",
  country: "",
  terms: 0,
  rating: 0,
  tags: [],
  notes: "",
  createdAt: Date.now(),
});

/**
 * Note sur 100 : rentabilité, écoulement et ponctualité à parts égales.
 * Renvoie null tant qu'aucun article n'a été revendu — noter un fournisseur
 * dont on n'a encore rien vendu n'aurait aucun sens.
 */
export const scoreOf = (s: Supplier): number | null => {
  if (s.soldPieces === 0) return null;
  const roi = Math.max(0, Math.min(100, s.roi));
  const sell = Math.max(0, Math.min(100, s.sellThrough));
  const punctual = s.onTimeRate ?? 100;
  return num(((roi + sell + punctual) / 3).toFixed(0));
};
