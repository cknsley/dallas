import type { Item } from "../types";
import { costOf, marginOf, qtyOf, revenueOf, roiOf, saleCostsOf } from "./calc";
import { today } from "./format";
import { STATUS_LABEL, DELIVERY_LABEL } from "./constants";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function itemsToCSV(items: Item[]): string {
  const header = [
    "Nom", "Quantite", "Marque", "Type", "Taille", "Source", "Statut",
    "Cout achat", "Frais achat", "Cout total",
    "Prix vente", "Port encaisse", "Total encaisse",
    "Commission", "Port a ma charge", "Total frais vente",
    "Marge nette", "ROI %",
    "Plateforme", "Acheteur",
    "Date achat", "Date reception", "Date vente", "Date expedition",
    "Livraison", "Transporteur", "Suivi", "Arrivee prevue", "Notes",
  ];
  const rows = items.map((i) => [
    i.name, String(qtyOf(i)), i.brand, i.type, i.size, i.source, STATUS_LABEL[i.status],
    i.cost.toFixed(2), i.fees.toFixed(2), costOf(i).toFixed(2),
    i.price ? i.price.toFixed(2) : "",
    i.shippingPaid ? i.shippingPaid.toFixed(2) : "",
    i.price ? revenueOf(i).toFixed(2) : "",
    i.saleFees ? i.saleFees.toFixed(2) : "",
    i.shippingCost ? i.shippingCost.toFixed(2) : "",
    saleCostsOf(i) ? saleCostsOf(i).toFixed(2) : "",
    i.price ? marginOf(i).toFixed(2) : "",
    i.price ? roiOf(i).toFixed(1) : "",
    i.platform, i.buyer,
    i.buyDate, i.receiveDate, i.saleDate, i.shipDate,
    i.status === "vendu" ? DELIVERY_LABEL[i.delivery] : "",
    i.carrier, i.tracking, i.expectedDate, i.notes,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export const stockFilename = () => `stock-${today()}.csv`;
