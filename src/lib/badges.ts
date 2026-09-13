import type { AppState } from "../types";

/** Compteurs live par route, utilisés par la sidebar et la frontpage (hub). */
export function computeNavBadges(state: AppState): Record<string, number> {
  return {
    "/stock": state.items.filter((i) => i.status !== "vendu").length,
    "/ventes": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/achats":
      state.requests.filter((r) => r.status === "en_cours").length +
      state.items.filter((i) => i.status === "arrivage").length,
    "/livraison": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": state.todos.filter((t) => !t.isSourcing && t.col !== "acheter" && t.col !== "termine").length,
    "/sourcing": state.todos.filter((t) => (t.isSourcing || t.col === "acheter") && t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
    "/sav":
      state.items.filter((i) => i.litigeState === "en_cours" || i.litigeState === "attente").length +
      state.personalLitiges.filter((l) => l.status !== "resolu").length +
      state.returns.filter((r) => !["rembourse", "clos"].includes(r.status)).length,
  };
}
