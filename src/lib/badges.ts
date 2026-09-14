import type { AppState, Item, Todo } from "../types";
import { canFileLitige, filterItemsByDomain, filterSourcingByDomain, filterTodosByDomain, type Domain } from "./calc";

/** Compteurs live par route, utilisés par la sidebar et la frontpage (hub). */
export function computeNavBadges(state: AppState): Record<string, number> {
  return computeNavBadgesFromItems(state, state.items, state.todos, state.todos);
}

/** Mêmes compteurs, mais rattachés à un secteur : n'utilise que les articles et sourcing de ce domaine. */
export function computeSectorNavBadges(state: AppState, domain: Domain): Record<string, number> {
  return computeNavBadgesFromItems(
    state,
    filterItemsByDomain(state.items, domain),
    filterTodosByDomain(state.todos, domain, state.items),
    filterSourcingByDomain(state.todos, domain, state.items),
  );
}

function computeNavBadgesFromItems(state: AppState, items: Item[], todos: Todo[], sourcingTodos: Todo[]): Record<string, number> {
  return {
    "/stock": items.filter((i) => i.status === "stock").length,
    "/ventes": items.filter((i) => i.status === "vendu" && (i.delivery !== "livree" || canFileLitige(i))).length,
    "/achats": state.requests.filter((r) => r.status === "en_cours").length,
    "/arrivage": items.filter((i) => i.status === "arrivage").length,
    "/livraison": items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": todos.filter((t) => !t.isSourcing && t.col !== "acheter" && t.col !== "termine").length,
    "/sourcing": sourcingTodos.filter((t) => (t.isSourcing || t.col === "acheter") && t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
    "/sav":
      items.filter((i) => i.litigeState === "en_cours" || i.litigeState === "attente").length +
      state.personalLitiges.filter((l) => l.status !== "resolu").length +
      state.returns.filter((r) => !["rembourse", "clos"].includes(r.status)).length,
  };
}
