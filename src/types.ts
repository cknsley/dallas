export type ItemStatus = "arrivage" | "stock" | "vendu";
export type Delivery = "non_payee" | "commandee" | "livree";
/** Avancement de l'expédition, suivi dans l'onglet Livraison. */
export type Shipping = "a_emballer" | "a_imprimer" | "a_deposer" | "en_preparation" | "livree" | "recu";
export type TodoCol = "acheter" | "faire" | "envoyer" | "termine";
export type LegalStatus = "rien" | "auto" | "sarl" | "sas" | "sasu";
export type OptionalModule = "clients" | "sav" | "facturation";
export type DocKind = "facture" | "recu";
export type ReturnKind = "client" | "fournisseur";
export type ReturnStatus = "ouvert" | "expedie" | "recu" | "rembourse" | "clos";
export type ReturnResolution = "remis_stock" | "perte" | "avoir" | "garde";
export type ProductGender = "" | "homme" | "femme" | "mixte" | "enfant";
export type LitigeStatus = "en_cours" | "attente" | "resolu";

export type PackagingKind = "tout" | "boite" | "dustbag" | "remplacement" | "rien";

export interface Item {
  id: string;
  sku?: string;          // Référence unique / Code SKU
  condition?: string;    // État de l'article (Neuf avec étiquette, Très bon état...)
  name: string;
  brand: string;
  type: string;
  size: string;
  gender?: ProductGender;
  packaging?: PackagingKind;
  estimatedPrice?: number; // Price d'estimation / revente visé
  source: string;
  supplierId?: string;   // ID de la fiche fournisseur liée
  /** Nombre d'exemplaires identiques sur cette ligne. */
  quantity: number;
  cost: number;          // coût d'entrée, par exemplaire
  fees: number;          // frais d'achat (port entrant, nettoyage, retouche…)
  price: number;         // prix de vente (0 tant que non fixé)
  /* côté vente */
  platform: string;      // plateforme ou canal de vente
  buyer: string;         // acheteur
  clientId?: string;     // ID de la fiche client liée
  buyerUrl: string;      // lien vers son profil sur la plateforme
  saleFees: number;      // commission de la plateforme
  packagingCost?: number; // emballage supporté à la vente
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
  shipDeadline?: string;  // date limite d'expédition si connue
  shippingLabelUrl?: string; // lien vers le bordereau de livraison
  shippingVideo?: string; // vidéo/preuve d'envoi, encodée localement
  shippingVideoName?: string;
  validationDate?: string; // Date de validation SAV (YYYY-MM-DD)
  shipping: Shipping;     // avancement de l'envoi
  /** Regroupe les pièces achetées dans une même commande fournisseur. */
  orderId: string;
  /** Faux tant que le fournisseur n'a pas été réglé : c'est une dette. */
  purchasePaid: boolean;
  /** Étiquette du lot d'origine, conservée après éclatement à l'unité. */
  lotTag: string;
  /** Entre en stock tout seul dès que la date d'arrivée est atteinte. */
  autoReceive: boolean;
  /* TCG & Cartes */
  isTcg?: boolean;
  tcgGame?: string;       // Pokémon, Yu-Gi-Oh!, Magic, One Piece, Lorcana
  tcgGrade?: string;      // PSA 10, BGS 9.5, PCA 10, Raw NM, etc.
  tcgSet?: string;        // 151, Évolution Céleste, OP-05
  tcgCategory?: "raw" | "graded" | "sealed"; // Carte seule, Gradée, Booster/ETB/Display
  /* SAV & Litiges */
  litigeState?: "en_cours" | "attente" | "resolu";
  litigeCategory?: string;
  litigeFile?: string;
  litigeFileName?: string;
  litigeLogs?: { id: string; date: string; category: string; text: string; fileUrl?: string; fileName?: string }[];
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
  itemIds?: string[];
  docId?: string;
  supplierId?: string;   // ID du fournisseur lié
  supplierName?: string; // Nom du fournisseur lié
  clientId?: string;     // ID du client lié
  clientName?: string;   // Nom du client / acheteur lié
  dueDate?: string;      // YYYY-MM-DD
  isSourcing?: boolean;   // Indique s'il s'agit d'un article à sourcer
  sourcingBrand?: string; // Marque de l'article à sourcer
  sourcingSize?: string;  // Taille de l'article à sourcer
  sourcingPrice?: number; // Budget / Prix cible d'achat
  ordered?: boolean;      // Passé en commande dans la centrale d'achat
  orderId?: string;       // ID de la commande rattachée dans la centrale d'achat
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
  clientId?: string;
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

/** Dossier retour / refund, séparé du SAV : suit l'impact logistique et financier. */
export interface ReturnCase {
  id: string;
  kind: ReturnKind;
  status: ReturnStatus;
  itemId?: string;
  itemName: string;
  counterparty: string;
  platform: string;
  amount: number;
  feesLost: number;
  openedDate: string;
  dueDate: string;
  closedDate: string;
  carrier: string;
  tracking: string;
  reason: string;
  /** État constaté au retour, notamment utile pour les produits scellés / TCG. */
  itemCondition?: "scelle" | "ouvert" | "utilise" | "endommage" | "incomplet";
  resolution: ReturnResolution;
  notes: string;
  createdAt: number;
}

export interface PersonalLitige {
  id: string;
  title: string;
  counterparty: string;
  category: string;
  status: LitigeStatus;
  openedDate: string;
  notes: string;
  createdAt: number;
}

export type ChargeKind = "achat" | "vente" | "activite";

/** Une charge générale de l'activité — matériel, emballages, abonnements —
 *  distincte du coût d'une pièce. Peut être étalée sur plusieurs mois. */
export interface Expense {
  id: string;
  label: string;
  category: string;
  kind?: ChargeKind;
  amount: number;
  date: string;          // premier mois d'imputation, YYYY-MM-DD
  amortizeMonths: number; // 1 = comptée en une fois
  notes: string;
  createdAt: number;
}

/** Un pense-bête : ce qu'un client a demandé, ou ce qu'on cherche pour le stock. */
export type RequestStatus = "en_cours" | "trouve";
export type RequestFor = "client" | "stock";

export interface ProductRequest {
  id: string;
  for: RequestFor;
  /** Nom du client, utile seulement quand `for` vaut "client". */
  client: string;
  clientId?: string;
  /** Ce qu'on cherche. */
  name: string;
  brand: string;
  size: string;
  gender: ProductGender;
  quantity: number;
  /** Prix d'achat espéré. */
  budget: number;
  notes: string;
  status: RequestStatus;
  /** Comment la demande a été résolue, une fois trouvée. */
  resolvedAs: "" | "stock" | "vente";
  createdAt: number;
}

/** Fiche fournisseur : base de données fournisseurs. */
export interface SupplierRecord {
  id: string;
  /** Nom tel qu'il est saisi dans le champ « Source » d'un article. */
  name: string;
  contact: string;
  email: string;
  phone: string;
  url: string;
  address: string;
  /** Délai de paiement accordé, en jours. */
  terms: number;
  /** Appréciation de 1 à 5, 0 si non notée — se met à jour à chaque interaction. */
  rating: number;
  /** Spécialités libres (ex. "Sneakers", "Vintage") — filtrables sur la liste. */
  tags: string[];
  notes: string;
  createdAt: number;
}

/** Fiche client : base de données clients / acheteurs. */
export interface ClientRecord {
  id: string;
  name: string;
  contact?: string;
  email: string;
  phone: string;
  address: string;
  vatNumber?: string;
  platform?: string;     // Canal habituel (Vinted, Vestiaire, Instagram...)
  profileUrl?: string;   // Lien vers son profil
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
  /** Modules optionnels visibles dans la navigation. */
  enabledModules: Record<OptionalModule, boolean>;
  /** Commission prélevée par plateforme, en % du prix de vente. */
  platformFees: Record<string, number>;
  /** Adresse de suivi par transporteur, « {code} » remplacé par le numéro. */
  trackingUrls: Record<string, string>;
  /** Sources écartées de l'onglet Fournisseurs : outlet, magasin, achat en direct. */
  nonSuppliers: string[];
  /** Coffre-fort / Trésorerie sécurisée (argent mis de côté). */
  vaultAmount?: number;
}

export interface AppState {
  items: Item[];
  todos: Todo[];
  docs: SalesDoc[];
  returns: ReturnCase[];
  personalLitiges: PersonalLitige[];
  expenses: Expense[];
  suppliers: SupplierRecord[];
  clients: ClientRecord[];
  requests: ProductRequest[];
  settings: Settings;
  seq: Record<string, number>;
  updatedAt: number;
}

export type Period = "month" | "quarter" | "year" | "all";
