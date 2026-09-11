export type ItemStatus = "arrivage" | "stock" | "vendu";
export type Delivery = "non_payee" | "commandee" | "livree";
/** Avancement de l'expédition, suivi dans l'onglet Livraison. */
export type Shipping = "en_preparation" | "livree" | "recu";
export type TodoCol = "acheter" | "faire" | "envoyer" | "termine";
export type LegalStatus = "particulier" | "micro" | "societe";
export type DocKind = "facture" | "recu";

export interface Item {
  id: string;
  name: string;
  brand: string;
  type: string;
  size: string;
  source: string;
  /** Nombre d'exemplaires identiques sur cette ligne. */
  quantity: number;
  cost: number;          // coût d'entrée, par exemplaire
  fees: number;          // frais d'achat (port entrant, nettoyage, retouche…)
  price: number;         // prix de vente (0 tant que non fixé)
  /* côté vente */
  platform: string;      // plateforme ou canal de vente
  buyer: string;         // acheteur
  buyerUrl: string;      // lien vers son profil sur la plateforme
  saleFees: number;      // commission de la plateforme
  shippingCost: number;  // port payé par le vendeur
  shippingPaid: number;  // port refacturé à l'acheteur
  status: ItemStatus;
  buyDate: string;       // YYYY-MM-DD
  receiveDate: string;
  saleDate: string;
  delivery: Delivery;
  notes: string;
  photoId: string | null;
  createdAt: number;
  /* logistique */
  carrier: string;        // transporteur
  tracking: string;       // numéro de suivi
  expectedDate: string;   // arrivée prévue (colis entrant)
  shipDate: string;       // date d'expédition (colis sortant)
  shipping: Shipping;     // avancement de l'envoi
  /** Regroupe les pièces achetées dans une même commande fournisseur. */
  orderId: string;
}

/** Une tâche automatique est déduite de l'état des pièces ou des documents :
 *  elle apparaît toute seule, et la cocher exécute l'action réelle. */
export type AutoKind = "ship" | "receive" | "payment";

export interface Todo {
  id: string;
  text: string;
  col: TodoCol;
  order: number;
  createdAt: number;
  /** Renseigné pour les tâches générées par l'app. */
  auto?: AutoKind;
  itemId?: string;
  docId?: string;
}

export interface DocLine {
  label: string;
  qty: number;
  unitPrice: number;     // TTC
  itemId?: string;
}

export interface SalesDoc {
  id: string;
  kind: DocKind;
  number: string;
  date: string;
  dueDate: string;
  clientName: string;
  clientAddress: string;
  clientVat: string;
  lines: DocLine[];
  itemIds: string[];
  paid: boolean;
  paidDate: string;
  vatSubject: boolean;
  vatRate: number;
  vatScheme: "marge" | "total";
  vatBase: number;       // base retenue au moment de l'émission
  vatAmount: number;
  total: number;         // TTC
  mention: string;
  notes: string;
  createdAt: number;
}

/** Une charge générale de l'activité — matériel, emballages, abonnements —
 *  distincte du coût d'une pièce. Peut être étalée sur plusieurs mois. */
export interface Expense {
  id: string;
  label: string;
  category: string;
  amount: number;
  date: string;          // premier mois d'imputation, YYYY-MM-DD
  amortizeMonths: number; // 1 = comptée en une fois
  notes: string;
  createdAt: number;
}

export interface Settings {
  business: string;
  /** Mode TVA : tant qu'il est éteint, aucune TVA n'est calculée nulle part. */
  vatEnabled: boolean;
  legalStatus: LegalStatus;
  country: string;
  vatNumber: string;
  vatRate: number;
  marginScheme: boolean;   // régime de la marge (biens d'occasion)
  threshold: number;       // seuil de franchise en base
  address: string;
  email: string;
  phone: string;
  iban: string;
  footer: string;
  paymentTerms: number;    // jours
  /** Commission prélevée par plateforme, en % du prix de vente. */
  platformFees: Record<string, number>;
}

export interface AppState {
  items: Item[];
  todos: Todo[];
  docs: SalesDoc[];
  expenses: Expense[];
  settings: Settings;
  seq: Record<string, number>;
  updatedAt: number;
}

export type Period = "month" | "quarter" | "year" | "all";
