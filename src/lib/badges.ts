import type { AppState, Item } from "../types";
import { filterItemsByDomain, type Domain } from "./calc";

/** Compteurs live par route, utilisés par la sidebar et la frontpage (hub). */
export function computeNavBadges(state: AppState): Record<string, number> {
  return computeNavBadgesFromItems(state, state.items);
}

/** Mêmes compteurs, mais rattachés à un secteur : n'utilise que les articles de ce domaine. */
export function computeSectorNavBadges(state: AppState, domain: Domain): Record<string, number> {
  return computeNavBadgesFromItems(state, filterItemsByDomain(state.items, domain));
}

function computeNavBadgesFromItems(state: AppState, items: Item[]): Record<string, number> {
  return {
    "/stock": items.filter((i) => i.status !== "vendu").length,
    "/ventes": items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/achats":
      state.requests.filter((r) => r.status === "en_cours").length +
      items.filter((i) => i.status === "arrivage").length,
    "/livraison": items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": state.todos.filter((t) => !t.isSourcing && t.col !== "acheter" && t.col !== "termine").length,
    "/sourcing": state.todos.filter((t) => (t.isSourcing || t.col === "acheter") && t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
    "/sav":
      items.filter((i) => i.litigeState === "en_cours" || i.litigeState === "attente").length +
      state.personalLitiges.filter((l) => l.status !== "resolu").length +
      state.returns.filter((r) => !["rembourse", "clos"].includes(r.status)).length,
  };
}
