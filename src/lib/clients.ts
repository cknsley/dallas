import type { Item } from "../types";
import { costOf, marginOf, qtyOf, revenueOf } from "./calc";

/** Un acheteur reconstitué depuis les ventes : l'app n'a pas de fiche client
 *  séparée, c'est l'historique qui fait le client. */
export interface Client {
  /** Clé stable : pseudo + plateforme, insensible à la casse. */
  key: string;
  name: string;
  platforms: string[];
  /** Lien vers son profil sur la plateforme, s'il a été renseigné une fois. */
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

const keyOf = (i: Item) => `${i.buyer.trim().toLowerCase()}|${i.platform.trim().toLowerCase()}`;

/** Regroupe les ventes par acheteur. Une vente sans acheteur nommé est ignorée. */
export function buildClients(items: Item[]): Client[] {
  const map = new Map<string, Client>();

  for (const i of items) {
    if (i.status !== "vendu" || !i.buyer.trim()) continue;
    const key = keyOf(i);
    const c = map.get(key) ?? {
      key,
      name: i.buyer.trim(),
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
    };

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
    .map((c) => ({ ...c, items: c.items.sort((a, b) => b.saleDate.localeCompare(a.saleDate)) }))
    .sort((a, b) => b.revenue - a.revenue);
}
