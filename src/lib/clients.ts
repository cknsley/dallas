import type { ClientRecord, Item } from "../types";
import { costOf, marginOf, qtyOf, revenueOf } from "./calc";

export interface Client {
  /** Clé stable : nom/pseudo du client, insensible à la casse. */
  key: string;
  name: string;
  record: ClientRecord | null;
  platforms: string[];
  /** Lien vers son profil sur la plateforme. */
  profileUrl: string;
  items: Item[];
  orders: number;
  pieces: number;
  revenue: number;
  cost: number;
  margin: number;
  firstSale: string;
  lastSale: string;
  pendingDelivery: number;
  unpaid: number;
}

export const clientKey = (name: string) => name.trim().toLowerCase();

/** Regroupe les clients à partir de la base de données fiches clients ET des ventes. */
export function buildClients(items: Item[], records: ClientRecord[] = []): Client[] {
  const map = new Map<string, Client>();
  const recordByKey = new Map(records.map((r) => [clientKey(r.name), r]));

  // 1. Initialiser avec toutes les fiches clients enregistrées en base
  for (const r of records) {
    const key = clientKey(r.name);
    map.set(key, {
      key,
      name: r.name,
      record: r,
      platforms: r.platform ? [r.platform] : [],
      profileUrl: r.profileUrl || "",
      items: [],
      orders: 0,
      pieces: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      firstSale: "",
      lastSale: "",
      pendingDelivery: 0,
      unpaid: 0,
    });
  }

  // 2. Associer l'historique des ventes (par clientId ou par nom d'acheteur)
  for (const i of items) {
    if (i.status !== "vendu" || !i.buyer.trim()) continue;
    const name = i.buyer.trim();
    const key = clientKey(name);

    const c =
      map.get(key) ??
      ({
        key,
        name,
        record: recordByKey.get(key) ?? null,
        platforms: [],
        profileUrl: "",
        items: [],
        orders: 0,
        pieces: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        firstSale: i.saleDate,
        lastSale: i.saleDate,
        pendingDelivery: 0,
        unpaid: 0,
      } as Client);

    c.items.push(i);
    c.orders += 1;
    c.pieces += qtyOf(i);
    c.revenue += revenueOf(i);
    c.cost += costOf(i);
    c.margin += marginOf(i);
    if (i.platform.trim() && !c.platforms.includes(i.platform.trim())) c.platforms.push(i.platform.trim());
    if (!c.profileUrl && i.buyerUrl.trim()) c.profileUrl = i.buyerUrl.trim();
    if (i.saleDate && (!c.firstSale || i.saleDate < c.firstSale)) c.firstSale = i.saleDate;
    if (i.saleDate && i.saleDate > c.lastSale) c.lastSale = i.saleDate;
    if (i.delivery === "commandee") c.pendingDelivery += 1;
    if (i.delivery === "non_payee") c.unpaid += revenueOf(i);

    map.set(key, c);
  }

  return [...map.values()]
    .map((c) => ({ ...c, items: c.items.sort((a, b) => (b.saleDate || "").localeCompare(a.saleDate || "")) }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}
