import type { AppState, Todo } from "../types";
import { today } from "../lib/format";
import { isTcgItem } from "../lib/calc";

/**
 * Tâches déduites de l'état de l'app : une vente pas encore expédiée ou une
 * facture échue. Elles n'ont pas à être saisies —
 * elles apparaissent, et les cocher exécute l'action réelle sur l'objet lié.
 */
export function deriveAutoTodos(state: AppState): Todo[] {
  const now = today();
  const out: Todo[] = [];

  state.items.forEach((i, ix) => {
    if (i.status === "vendu" && i.delivery !== "livree" && i.shipping !== "livree" && i.shipping !== "recu") {
      out.push({
        id: `auto:ship:${i.id}`,
        text: `Faire l'envoi de ${i.name || "article sans nom"}`,
        col: "faire",
        order: 3000 + ix,
        createdAt: i.createdAt,
        auto: "ship",
        itemId: i.id,
        dueDate: i.shipDeadline || undefined,
        sector: i.sector,
        isTcg: isTcgItem(i),
      });
    }
  });

  state.docs.forEach((d, ix) => {
    if (!d.paid && d.dueDate && d.dueDate < now) {
      out.push({
        id: `auto:payment:${d.id}`,
        text: `Relancer le paiement de ${d.number} — ${d.clientName}`,
        col: "faire",
        order: 1000 + ix,
        createdAt: d.createdAt,
        auto: "payment",
        docId: d.id,
      });
    }
  });

  return out;
}

/** Fusionne les tâches manuelles conservées telles quelles et les tâches déduites. */
export function reconcileTodos(state: AppState): Todo[] | null {
  const manual = state.todos.filter((t) => !t.auto);
  const derived = deriveAutoTodos(state);
  const current = state.todos.filter((t) => t.auto);

  const sameSet =
    current.length === derived.length &&
    derived.every((d) => {
      const existing = current.find((c) => c.id === d.id);
      return existing && existing.text === d.text && existing.col === d.col;
    });
  if (sameSet) return null;

  return [...manual, ...derived];
}
