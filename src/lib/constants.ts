import type { Delivery, ItemStatus, Shipping, TodoCol } from "../types";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  arrivage: "Arrivage",
  stock: "En stock",
  vendu: "Vendu",
};

export const STATUS_ORDER: ItemStatus[] = ["arrivage", "stock", "vendu"];

export const DELIVERY_LABEL: Record<Delivery, string> = {
  non_payee: "Non payée",
  commandee: "Commandée",
  livree: "Livrée",
};

export const DELIVERY_ORDER: Delivery[] = ["non_payee", "commandee", "livree"];

export const SHIPPING_LABEL: Record<Shipping, string> = {
  en_preparation: "En préparation",
  livree: "Livrée",
  recu: "Reçu",
};

export const SHIPPING_ORDER: Shipping[] = ["en_preparation", "livree", "recu"];

/** Correspondance des anciens statuts de livraison vers les nouveaux. */
export const LEGACY_DELIVERY: Record<string, Delivery> = {
  a_expedier: "commandee",
  expedie: "commandee",
  livre: "livree",
};

export const TODO_LABEL: Record<TodoCol, string> = {
  acheter: "À acheter",
  faire: "À faire",
  envoyer: "À envoyer",
  termine: "Terminé",
};

export const TODO_ORDER: TodoCol[] = ["acheter", "faire", "envoyer", "termine"];

export const ARTICLE_TYPES = [
  "Sneakers", "Chaussures", "T-shirt", "Sweat / Hoodie", "Veste", "Manteau",
  "Pantalon", "Jean", "Short", "Robe", "Chemise", "Sac", "Ceinture",
  "Casquette", "Bijou", "Lunettes", "Montre", "Accessoire", "Autre",
];

export const PLATFORMS = [
  "Vinted", "Vestiaire Collective", "Depop", "eBay", "Leboncoin",
  "Grailed", "Instagram", "WhatsApp", "Main propre", "Boutique", "Autre",
];

export const CARRIERS = [
  "Mondial Relay", "Colissimo", "Chronopost", "Relais Colis",
  "UPS", "DHL", "DPD", "Remise en main propre", "Autre",
];

export const EXPENSE_CATEGORIES = [
  "Emballage", "Matériel", "Abonnement", "Transport", "Local", "Logiciel", "Marketing", "Autre",
];
