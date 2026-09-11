import type { Item } from "../types";
import { costOf, marginOf, qtyOf, revenueOf } from "./calc";

/** Un fournisseur reconstitué depuis le champ « source » des pièces achetées. */
export interface Supplier {
  key: string;
  name: string;
  items: Item[];
  pieces: number;
  /** Ce que les achats ont coûté, réglés ou non. */
  purchases: number;
  /** Ce qui reste dû au fournisseur. */
  debt: number;
  /** Ce que les pièces de ce fournisseur ont rapporté une fois revendues. */
  sales: number;
  margin: number;
  sold: number;
  inStock: number;
  stockValue: number;
  firstBuy: string;
  lastBuy: string;
}

export function buildSuppliers(items: Item[]): Supplier[] {
  const map = new Map<string, Supplier>();

  for (const i of items) {
    const name = i.source.trim() || "Source non renseignée";
    const key = name.toLowerCase();
    const s = map.get(key) ?? {
      key, name, items: [], pieces: 0, purchases: 0, debt: 0,
      sales: 0, margin: 0, sold: 0, inStock: 0, stockValue: 0,
      firstBuy: i.buyDate, lastBuy: i.buyDate,
    };

    s.items.push(i);
    s.pieces += qtyOf(i);
    s.purchases += costOf(i);
    if (!i.purchasePaid) s.debt += costOf(i);
    if (i.status === "vendu") {
      s.sold += qtyOf(i);
      s.sales += revenueOf(i);
      s.margin += marginOf(i);
    } else {
      s.inStock += qtyOf(i);
      s.stockValue += costOf(i);
    }
    if (i.buyDate && (!s.firstBuy || i.buyDate < s.firstBuy)) s.firstBuy = i.buyDate;
    if (i.buyDate && i.buyDate > s.lastBuy) s.lastBuy = i.buyDate;

    map.set(key, s);
  }

  return [...map.values()]
    .map((s) => ({ ...s, items: s.items.sort((a, b) => b.buyDate.localeCompare(a.buyDate)) }))
    .sort((a, b) => b.purchases - a.purchases);
}
