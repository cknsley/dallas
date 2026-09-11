import type { Item } from "../types";
import { costOf, marginOf, qtyOf } from "./calc";
import { num } from "./format";

/**
 * Le catalogue est construit depuis l'historique : chaque modèle déjà manipulé
 * devient une référence, avec ses tailles, son coût habituel et ce qu'il rapporte.
 * Aucune base externe n'est nécessaire — c'est votre propre fonds qui sert de
 * catalogue.
 */
export interface CatalogEntry {
  key: string;
  name: string;
  brand: string;
  type: string;

  /** Exemplaires encore en stock, toutes tailles confondues. */
  inStock: number;
  /** Exemplaires déjà vendus. */
  sold: number;
  /** Tailles détenues, avec la quantité pour chacune. */
  sizes: { size: string; qty: number }[];

  stockValue: number;
  avgCost: number;
  /** Prix de vente moyen constaté, sinon l'estimation moyenne. */
  avgPrice: number;
  /** Marge moyenne par exemplaire revendu. */
  avgMargin: number;
  totalMargin: number;

  lastBuy: string;
  photoId: string | null;
  items: Item[];
}

export const modelKey = (i: Item) => `${i.brand.trim().toLowerCase()}|${i.name.trim().toLowerCase()}`;

export function buildCatalog(items: Item[]): CatalogEntry[] {
  const map = new Map<string, CatalogEntry>();

  for (const i of items) {
    const key = modelKey(i);
    const e =
      map.get(key) ??
      ({
        key, name: i.name || "Sans nom", brand: i.brand, type: i.type,
        inStock: 0, sold: 0, sizes: [],
        stockValue: 0, avgCost: 0, avgPrice: 0, avgMargin: 0, totalMargin: 0,
        lastBuy: i.buyDate, photoId: null, items: [],
      } as CatalogEntry);

    e.items.push(i);
    if (!e.photoId && i.photoId) e.photoId = i.photoId;
    if (!e.type && i.type) e.type = i.type;
    if (i.buyDate > e.lastBuy) e.lastBuy = i.buyDate;

    if (i.status === "vendu") {
      e.sold += qtyOf(i);
      e.totalMargin += marginOf(i);
    } else {
      e.inStock += qtyOf(i);
      e.stockValue += costOf(i);
      const size = i.size.trim() || "—";
      const row = e.sizes.find((s) => s.size === size);
      if (row) row.qty += qtyOf(i);
      else e.sizes.push({ size, qty: qtyOf(i) });
    }

    map.set(key, e);
  }

  for (const e of map.values()) {
    const units = e.items.reduce((a, i) => a + qtyOf(i), 0);
    e.avgCost = units > 0 ? e.items.reduce((a, i) => a + costOf(i), 0) / units : 0;

    // Le prix constaté prime sur l'estimation : c'est le marché, pas un espoir.
    const soldItems = e.items.filter((i) => i.status === "vendu" && num(i.price) > 0);
    const source = soldItems.length > 0 ? soldItems : e.items.filter((i) => num(i.price) > 0);
    const sourceUnits = source.reduce((a, i) => a + qtyOf(i), 0);
    e.avgPrice = sourceUnits > 0 ? source.reduce((a, i) => a + num(i.price) * qtyOf(i), 0) / sourceUnits : 0;

    e.avgMargin = e.sold > 0 ? e.totalMargin / e.sold : 0;
    e.sizes.sort((a, b) => a.size.localeCompare(b.size, "fr", { numeric: true }));
    e.items.sort((a, b) => b.buyDate.localeCompare(a.buyDate));
  }

  return [...map.values()];
}

/** Référence la plus récente portant ce nom : sert à pré-remplir une nouvelle fiche. */
export function findReference(items: Item[], name: string): Item | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const matches = items
    .filter((i) => i.name.trim().toLowerCase() === needle)
    .sort((a, b) => b.createdAt - a.createdAt);
  return matches[0] ?? null;
}
