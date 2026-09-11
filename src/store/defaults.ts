import type { AppState, Settings } from "../types";

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
};

export const EMPTY_STATE: AppState = {
  items: [],
  todos: [],
  docs: [],
  expenses: [],
  settings: DEFAULT_SETTINGS,
  seq: {},
  updatedAt: 0,
};
