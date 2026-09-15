import { useMemo, useState } from "react";
import { Modal, Photo } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { eur2, num } from "../lib/format";
import { uid } from "../lib/id";
import { STATUS_LABEL } from "../lib/constants";
import type { Item } from "../types";

/** Clé de regroupement des fiches identiques (même produit) — même logique que Stock.tsx. */
const groupKeyOf = (i: Item): string =>
  i.sku?.trim()
    ? `sku:${i.sku.trim().toLowerCase()}`
    : [i.name, i.brand, i.type, i.size, i.tcgGrade, i.tcgSet, i.condition, i.cost, i.price, i.source, i.lotTag]
        .map((v) => String(v ?? "").toLowerCase())
        .join("|");

interface Group { key: string; rep: Item; items: Item[]; qty: number }

/** Choisit l’article du stock à vendre (et la quantité), puis laisse le formulaire de vente faire le reste. */
export default function PickItemModal({
  title, onPick, onClose, emptyHint,
}: {
  title: string;
  onPick: (item: Item) => void;
  onClose: () => void;
  emptyHint: string;
}) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const held = state.items
      .filter((i) => i.status !== "vendu")
      .filter((i) => !needle || [i.name, i.brand, i.type, i.size].join(" ").toLowerCase().includes(needle));
    const map = new Map<string, Group>();
    for (const i of held) {
      const key = groupKeyOf(i);
      const g = map.get(key);
      if (g) { g.items.push(i); g.qty += qtyOf(i); }
      else map.set(key, { key, rep: i, items: [i], qty: qtyOf(i) });
    }
    return [...map.values()].sort((a, b) => b.rep.createdAt - a.rep.createdAt);
  }, [state.items, query]);

  /** Consolide `n` unités prises sur les fiches les plus anciennes du groupe en une seule fiche vendable. */
  const sell = (g: Group, wanted: number) => {
    const n = Math.max(1, Math.min(Math.round(wanted) || 1, g.qty));
    const sorted = [...g.items].sort((a, b) => a.createdAt - b.createdAt);

    let remaining = n;
    const consumed: Item[] = [];
    let splitItem: Item | null = null;
    let splitSoldQty = 0;
    for (const it of sorted) {
      if (remaining <= 0) break;
      const q = qtyOf(it);
      if (q <= remaining) {
        consumed.push(it);
        remaining -= q;
      } else {
        splitItem = it;
        splitSoldQty = remaining;
        remaining = 0;
      }
    }

    if (consumed.length === 0 && splitItem) {
      // Toute la vente vient d'une seule fiche partiellement entamée.
      const leftoverQty = qtyOf(splitItem) - n;
      if (leftoverQty > 0) {
        dispatch({ type: "upsertItem", item: { ...splitItem, id: uid(), quantity: leftoverQty, createdAt: Date.now() } });
      }
      dispatch({ type: "patchItem", id: splitItem.id, patch: { quantity: n } });
      onPick({ ...splitItem, quantity: n });
      return;
    }

    const primary = consumed[0];
    consumed.slice(1).forEach((it) => dispatch({ type: "removeItem", id: it.id }));
    if (splitItem) {
      const leftoverQty = qtyOf(splitItem) - splitSoldQty;
      dispatch({ type: "patchItem", id: splitItem.id, patch: { quantity: leftoverQty } });
    }
    dispatch({ type: "patchItem", id: primary.id, patch: { quantity: n } });
    onPick({ ...primary, quantity: n });
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Annuler</button>}
    >
      {state.items.filter((i) => i.status !== "vendu").length === 0 ? (
        <div className="empty" style={{ padding: 28 }}>
          <div className="glyph">▦</div>
          <h3>Aucun article en stock</h3>
          <div>{emptyHint}</div>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            placeholder="Filtrer le stock…"
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="picker">
            {groups.length === 0 ? (
              <div className="empty" style={{ padding: 22 }}>Aucun article ne correspond</div>
            ) : (
              groups.map((g) => {
                const i = g.rep;
                const draft = qtyDrafts[g.key] ?? String(g.qty > 1 ? 1 : g.qty);
                return (
                  <div key={g.key} className="prow" style={{ cursor: "default" }}>
                    <Photo id={i.photoId} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }} className="ellipsis">
                        {i.name || "Sans nom"}
                        {g.qty > 1 && <span className="qty-badge">×{g.qty} en stock</span>}
                      </div>
                      <div className="hint">
                        {i.brand || "—"}{i.size ? ` · ${i.size}` : ""} · {STATUS_LABEL[i.status]}
                      </div>
                    </div>
                    <div className="num" style={{ fontSize: 12, textAlign: "right" }}>
                      {i.price ? eur2(i.price) : "—"}
                      <div className="hint num">coût {eur2(costOf(i) / qtyOf(i))}</div>
                    </div>
                    {g.qty > 1 && (
                      <input
                        type="number"
                        min={1}
                        max={g.qty}
                        step={1}
                        value={draft}
                        onChange={(e) => setQtyDrafts((d) => ({ ...d, [g.key]: e.target.value }))}
                        style={{ width: 56, height: 30, fontSize: 12, textAlign: "center" }}
                      />
                    )}
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() => sell(g, num(draft))}
                    >
                      Vendre
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
