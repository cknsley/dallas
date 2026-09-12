import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import type {
  AppState, ClientRecord, DocKind, Expense, Item, PersonalLitige, ProductRequest, ReturnCase, SalesDoc, Settings, SupplierRecord, Todo,
} from "../types";
import { EMPTY_STATE, DEFAULT_SETTINGS, DEMO_STATE } from "./defaults";
import { getSyncInfo, initSync, push, subscribeSyncInfo, type SyncInfo } from "./sync";
import { deletePhoto } from "./photos";
import { reconcileTodos } from "./autoTodos";
import { uid } from "../lib/id";
import { LEGACY_DELIVERY } from "../lib/constants";

const LS_KEY = "atelier-revente:v4";

type Action =
  | { type: "replace"; state: AppState }
  | { type: "upsertItem"; item: Item }
  | { type: "removeItem"; id: string }
  | { type: "patchItem"; id: string; patch: Partial<Item> }
  | { type: "addTodo"; todo: Todo }
  | { type: "patchTodo"; id: string; patch: Partial<Todo> }
  | { type: "removeTodo"; id: string }
  | { type: "reorderTodos"; todos: Todo[] }
  | { type: "syncTodos"; todos: Todo[] }
  | { type: "addDoc"; doc: SalesDoc; seqKey: string }
  | { type: "patchDoc"; id: string; patch: Partial<SalesDoc> }
  | { type: "removeDoc"; id: string }
  | { type: "upsertReturn"; returnCase: ReturnCase }
  | { type: "patchReturn"; id: string; patch: Partial<ReturnCase> }
  | { type: "removeReturn"; id: string }
  | { type: "upsertPersonalLitige"; litige: PersonalLitige }
  | { type: "patchPersonalLitige"; id: string; patch: Partial<PersonalLitige> }
  | { type: "removePersonalLitige"; id: string }
  | { type: "addExpense"; expense: Expense }
  | { type: "patchExpense"; id: string; patch: Partial<Expense> }
  | { type: "removeExpense"; id: string }
  | { type: "upsertSupplier"; supplier: SupplierRecord }
  | { type: "removeSupplier"; id: string }
  | { type: "upsertClient"; client: ClientRecord }
  | { type: "removeClient"; id: string }
  | { type: "upsertRequest"; request: ProductRequest }
  | { type: "removeRequest"; id: string }
  | { type: "settings"; patch: Partial<Settings> };

function reducer(state: AppState, action: Action): AppState {
  const stamp = (next: AppState): AppState => ({ ...next, updatedAt: Date.now() });
  switch (action.type) {
    case "replace":
      return action.state;
    case "upsertItem": {
      const exists = state.items.some((i) => i.id === action.item.id);
      return stamp({
        ...state,
        items: exists
          ? state.items.map((i) => (i.id === action.item.id ? action.item : i))
          : [action.item, ...state.items],
      });
    }
    case "patchItem":
      return stamp({
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      });
    case "removeItem":
      return stamp({ ...state, items: state.items.filter((i) => i.id !== action.id) });
    case "addTodo":
      return stamp({ ...state, todos: [...state.todos, action.todo] });
    case "patchTodo":
      return stamp({
        ...state,
        todos: state.todos.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      });
    case "removeTodo":
      return stamp({ ...state, todos: state.todos.filter((t) => t.id !== action.id) });
    case "reorderTodos":
      return stamp({ ...state, todos: action.todos });
    case "syncTodos":
      // Rafraîchissement interne : ne compte pas comme une modification utilisateur.
      return { ...state, todos: action.todos };
    case "addDoc":
      return stamp({
        ...state,
        docs: [action.doc, ...state.docs],
        seq: { ...state.seq, [action.seqKey]: (state.seq[action.seqKey] ?? 0) + 1 },
      });
    case "patchDoc":
      return stamp({
        ...state,
        docs: state.docs.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      });
    case "removeDoc":
      return stamp({ ...state, docs: state.docs.filter((d) => d.id !== action.id) });
    case "upsertReturn": {
      const exists = state.returns.some((r) => r.id === action.returnCase.id);
      return stamp({
        ...state,
        returns: exists
          ? state.returns.map((r) => (r.id === action.returnCase.id ? action.returnCase : r))
          : [action.returnCase, ...state.returns],
      });
    }
    case "patchReturn":
      return stamp({
        ...state,
        returns: state.returns.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      });
    case "removeReturn":
      return stamp({ ...state, returns: state.returns.filter((r) => r.id !== action.id) });
    case "upsertPersonalLitige": {
      const exists = state.personalLitiges.some((l) => l.id === action.litige.id);
      return stamp({
        ...state,
        personalLitiges: exists
          ? state.personalLitiges.map((l) => (l.id === action.litige.id ? action.litige : l))
          : [action.litige, ...state.personalLitiges],
      });
    }
    case "patchPersonalLitige":
      return stamp({
        ...state,
        personalLitiges: state.personalLitiges.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)),
      });
    case "removePersonalLitige":
      return stamp({ ...state, personalLitiges: state.personalLitiges.filter((l) => l.id !== action.id) });
    case "addExpense":
      return stamp({ ...state, expenses: [action.expense, ...state.expenses] });
    case "patchExpense":
      return stamp({
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      });
    case "removeExpense":
      return stamp({ ...state, expenses: state.expenses.filter((e) => e.id !== action.id) });
    case "upsertSupplier": {
      const exists = state.suppliers.some((s) => s.id === action.supplier.id);
      return stamp({
        ...state,
        suppliers: exists
          ? state.suppliers.map((s) => (s.id === action.supplier.id ? action.supplier : s))
          : [...state.suppliers, action.supplier],
      });
    }
    case "removeSupplier":
      return stamp({ ...state, suppliers: state.suppliers.filter((s) => s.id !== action.id) });
    case "upsertClient": {
      const exists = state.clients.some((c) => c.id === action.client.id);
      return stamp({
        ...state,
        clients: exists
          ? state.clients.map((c) => (c.id === action.client.id ? action.client : c))
          : [...state.clients, action.client],
      });
    }
    case "removeClient":
      return stamp({ ...state, clients: state.clients.filter((c) => c.id !== action.id) });
    case "upsertRequest": {
      const exists = state.requests.some((r) => r.id === action.request.id);
      return stamp({
        ...state,
        requests: exists
          ? state.requests.map((r) => (r.id === action.request.id ? action.request : r))
          : [action.request, ...state.requests],
      });
    }
    case "removeRequest":
      return stamp({ ...state, requests: state.requests.filter((r) => r.id !== action.id) });
    case "settings":
      return stamp({ ...state, settings: { ...state.settings, ...action.patch } });
    default:
      return state;
  }
}

/** Complète les fiches enregistrées avant l'ajout du suivi logistique et des frais de vente,
 *  et convertit les anciens statuts de livraison. */
const withLogistics = (i: Item): Item => ({
  ...i,
  delivery: LEGACY_DELIVERY[i.delivery as string] ?? i.delivery ?? "commandee",
  shipping: i.shipping ?? "en_preparation",
  orderId: i.orderId ?? "",
  quantity: i.quantity && i.quantity > 0 ? i.quantity : 1,
  purchasePaid: i.purchasePaid ?? true,
  lotTag: i.lotTag ?? "",
  autoReceive: i.autoReceive ?? false,
  carrier: i.carrier ?? "",
  tracking: i.tracking ?? "",
  expectedDate: i.expectedDate ?? "",
  shipDate: i.shipDate ?? "",
  shippingVideo: i.shippingVideo ?? "",
  shippingVideoName: i.shippingVideoName ?? "",
  platform: i.platform ?? "",
  buyer: i.buyer ?? "",
  buyerUrl: i.buyerUrl ?? "",
  saleFees: i.saleFees ?? 0,
  packagingCost: i.packagingCost ?? 0,
  shippingCost: i.shippingCost ?? 0,
  shippingPaid: i.shippingPaid ?? 0,
});

function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEMO_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const loadedItems = parsed.items ?? [];
    if (loadedItems.length === 0) {
      return DEMO_STATE;
    }
    return {
      ...EMPTY_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        platformFees: { ...DEFAULT_SETTINGS.platformFees, ...(parsed.settings?.platformFees ?? {}) },
        trackingUrls: { ...DEFAULT_SETTINGS.trackingUrls, ...(parsed.settings?.trackingUrls ?? {}) },
        enabledModules: { ...DEFAULT_SETTINGS.enabledModules, ...(parsed.settings?.enabledModules ?? {}) },
        nonSuppliers: parsed.settings?.nonSuppliers ?? [],
      },
      items: loadedItems.map(withLogistics),
      todos: parsed.todos ?? [],
      docs: parsed.docs ?? [],
      returns: parsed.returns ?? [],
      personalLitiges: parsed.personalLitiges ?? [],
      expenses: parsed.expenses ?? [],
      suppliers: parsed.suppliers ?? [],
      clients: parsed.clients ?? DEMO_STATE.clients,
      requests: parsed.requests ?? [],
      seq: parsed.seq ?? {},
    };
  } catch {
    return DEMO_STATE;
  }
}

interface StoreValue {
  state: AppState;
  dispatch: (a: Action) => void;
  sync: SyncInfo;
  /** Exécute l'action réelle derrière une tâche automatique. */
  resolveAutoTodo: (todo: Todo) => string;
  /** Numéro séquentiel suivant pour un type de document, sans le consommer. */
  peekNumber: (kind: DocKind, date: string) => { number: string; seqKey: string };
  deleteItem: (item: Item) => void;
  resetDemoData: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadLocal);
  const [sync, setSync] = useState<SyncInfo>(getSyncInfo);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydrating = useRef(false);

  const resetDemoData = useCallback(() => {
    dispatch({ type: "replace", state: DEMO_STATE });
  }, []);

  useEffect(() => subscribeSyncInfo(setSync), []);

  useEffect(() => {
    const stop = initSync(
      (remote) => {
        hydrating.current = true;
        dispatch({
          type: "replace",
          state: {
            ...EMPTY_STATE,
            ...remote,
            settings: {
              ...DEFAULT_SETTINGS,
              ...remote.settings,
              platformFees: { ...DEFAULT_SETTINGS.platformFees, ...(remote.settings?.platformFees ?? {}) },
              trackingUrls: { ...DEFAULT_SETTINGS.trackingUrls, ...(remote.settings?.trackingUrls ?? {}) },
              enabledModules: { ...DEFAULT_SETTINGS.enabledModules, ...(remote.settings?.enabledModules ?? {}) },
              nonSuppliers: remote.settings?.nonSuppliers ?? [],
            },
            items: (remote.items ?? []).map(withLogistics),
            returns: remote.returns ?? [],
            personalLitiges: remote.personalLitiges ?? [],
            expenses: remote.expenses ?? [],
            suppliers: remote.suppliers ?? [],
            requests: remote.requests ?? [],
          },
        });
      },
      () => stateRef.current,
    );
    return stop;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* quota dépassé : les photos vivent dans IndexedDB, l'état reste petit */
    }
    if (hydrating.current) {
      hydrating.current = false;
      return;
    }
    if (state.updatedAt === 0) return;
    const t = window.setTimeout(() => void push(state), 500);
    return () => window.clearTimeout(t);
  }, [state]);

  /**
   * Réception automatique : une commande marquée ainsi entre seule en stock
   * dès que sa date d'arrivée est atteinte. Les lignes de plusieurs exemplaires
   * éclatent à l'unité, comme à la réception manuelle.
   */
  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    const due = state.items.filter(
      (i) => i.status === "arrivage" && i.autoReceive && i.expectedDate && i.expectedDate <= day,
    );
    if (due.length === 0) return;
    for (const i of due) {
      const qty = Math.max(1, i.quantity || 1);
      const tag = i.lotTag || i.source || "";
      if (qty <= 1) {
        dispatch({ type: "patchItem", id: i.id, patch: { status: "stock", receiveDate: day, lotTag: tag } });
        continue;
      }
      dispatch({ type: "removeItem", id: i.id });
      for (let n = 0; n < qty; n++) {
        dispatch({
          type: "upsertItem",
          item: { ...i, id: uid(), quantity: 1, status: "stock", receiveDate: day, lotTag: tag, createdAt: Date.now() + n },
        });
      }
    }
  }, [state.items]);

  // Les tâches automatiques suivent l'état des pièces et des documents.
  useEffect(() => {
    const next = reconcileTodos(state);
    if (next) dispatch({ type: "syncTodos", todos: next });
  }, [state]);

  const peekNumber = useCallback(
    (kind: DocKind, date: string) => {
      const year = (date || "").slice(0, 4) || String(new Date().getFullYear());
      const prefix = kind === "facture" ? "FA" : "RE";
      const seqKey = `${prefix}-${year}`;
      const next = (stateRef.current.seq[seqKey] ?? 0) + 1;
      return { number: `${seqKey}-${String(next).padStart(4, "0")}`, seqKey };
    },
    [],
  );

  const resolveAutoTodo = useCallback((todo: Todo): string => {
    const day = new Date().toISOString().slice(0, 10);
    if (todo.auto === "ship" && todo.itemId) {
      dispatch({ type: "patchItem", id: todo.itemId, patch: { shipping: "livree", shipDate: day } });
      return "Envoi marqué livré";
    }
    if (todo.auto === "receive" && todo.itemId) {
      dispatch({ type: "patchItem", id: todo.itemId, patch: { status: "stock", receiveDate: day } });
      return "Colis réceptionné — article en stock";
    }
    if (todo.auto === "payment" && todo.docId) {
      dispatch({ type: "patchDoc", id: todo.docId, patch: { paid: true, paidDate: day } });
      return "Document marqué payé";
    }
    return "";
  }, []);

  const deleteItem = useCallback((item: Item) => {
    if (item.photoId) void deletePhoto(item.photoId);
    dispatch({ type: "removeItem", id: item.id });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, sync, peekNumber, deleteItem, resolveAutoTodo, resetDemoData }),
    [state, sync, peekNumber, deleteItem, resolveAutoTodo, resetDemoData],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return v;
}
