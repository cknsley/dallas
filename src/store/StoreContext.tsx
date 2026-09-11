import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
  type ReactNode,
} from "react";
import type { AppState, DocKind, Expense, Item, SalesDoc, Settings, Todo } from "../types";
import { EMPTY_STATE, DEFAULT_SETTINGS } from "./defaults";
import { getSyncInfo, initSync, push, subscribeSyncInfo, type SyncInfo } from "./sync";
import { deletePhoto } from "./photos";
import { reconcileTodos } from "./autoTodos";
import { LEGACY_DELIVERY } from "../lib/constants";

const LS_KEY = "atelier-revente:v1";

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
  | { type: "addExpense"; expense: Expense }
  | { type: "patchExpense"; id: string; patch: Partial<Expense> }
  | { type: "removeExpense"; id: string }
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
    case "addExpense":
      return stamp({ ...state, expenses: [action.expense, ...state.expenses] });
    case "patchExpense":
      return stamp({
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      });
    case "removeExpense":
      return stamp({ ...state, expenses: state.expenses.filter((e) => e.id !== action.id) });
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
  carrier: i.carrier ?? "",
  tracking: i.tracking ?? "",
  expectedDate: i.expectedDate ?? "",
  shipDate: i.shipDate ?? "",
  platform: i.platform ?? "",
  buyer: i.buyer ?? "",
  buyerUrl: i.buyerUrl ?? "",
  saleFees: i.saleFees ?? 0,
  shippingCost: i.shippingCost ?? 0,
  shippingPaid: i.shippingPaid ?? 0,
});

function loadLocal(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        platformFees: { ...DEFAULT_SETTINGS.platformFees, ...(parsed.settings?.platformFees ?? {}) },
      },
      items: (parsed.items ?? []).map(withLogistics),
      todos: parsed.todos ?? [],
      docs: parsed.docs ?? [],
      expenses: parsed.expenses ?? [],
      seq: parsed.seq ?? {},
    };
  } catch {
    return EMPTY_STATE;
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
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadLocal);
  const [sync, setSync] = useState<SyncInfo>(getSyncInfo);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydrating = useRef(false);

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
            },
            items: (remote.items ?? []).map(withLogistics),
            expenses: remote.expenses ?? [],
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
    () => ({ state, dispatch, sync, peekNumber, deleteItem, resolveAutoTodo }),
    [state, sync, peekNumber, deleteItem, resolveAutoTodo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return v;
}
