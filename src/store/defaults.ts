import type { AppState, Settings } from "../types";
import { DEFAULT_TRACKING_URLS } from "../lib/carriers";

export const DEFAULT_SETTINGS: Settings = {
  business: "",
  vatEnabled: false,
  legalStatus: "particulier",
  country: "FR",
  vatNumber: "",
  vatRate: 20,
  marginScheme: true,
  threshold: 85000,
  address: "",
  email: "",
  phone: "",
  iban: "",
  footer: "",
  paymentTerms: 14,
  // Ordres de grandeur usuels ; chaque taux reste modifiable dans Facturation.
  platformFees: {
    Vinted: 0,
    "Vestiaire Collective": 15,
    Depop: 10,
    eBay: 12.8,
    Leboncoin: 0,
    Grailed: 9,
    Instagram: 0,
    WhatsApp: 0,
    "Main propre": 0,
    Boutique: 0,
    Autre: 0,
  },
  trackingUrls: { ...DEFAULT_TRACKING_URLS },
};

export const EMPTY_STATE: AppState = {
  items: [],
  todos: [],
  docs: [],
  expenses: [],
  suppliers: [],
  requests: [],
  settings: DEFAULT_SETTINGS,
  seq: {},
  updatedAt: 0,
};
