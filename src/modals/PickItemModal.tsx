import { useMemo, useState } from "react";
import { Modal, Photo } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { eur2 } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import type { Item } from "../types";

/** Choisit la pièce du stock à vendre, puis laisse le formulaire de vente faire le reste. */
export default function PickItemModal({
  title, onPick, onClose, emptyHint,
}: {
  title: string;
  onPick: (item: Item) => void;
  onClose: () => void;
  emptyHint: string;
}) {
  const { state } = useStore();
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.items
      .filter((i) => i.status !== "vendu")
      .filter((i) => !needle || [i.name, i.brand, i.type, i.size].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.items, query]);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Annuler</button>}
    >
      {state.items.filter((i) => i.status !== "vendu").length === 0 ? (
        <div className="empty" style={{ padding: 28 }}>
          <div className="glyph">▦</div>
          <h3>Aucune pièce en stock</h3>
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
            {list.length === 0 ? (
              <div className="empty" style={{ padding: 22 }}>Aucune pièce ne correspond</div>
            ) : (
              list.map((i) => (
                <div key={i.id} className="prow" onClick={() => onPick(i)}>
                  <Photo id={i.photoId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }} className="ellipsis">
                      {i.name || "Sans nom"}
                      {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                    </div>
                    <div className="hint">
                      {i.brand || "—"}{i.size ? ` · ${i.size}` : ""} · {STATUS_LABEL[i.status]}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 12, textAlign: "right" }}>
                    {i.price ? eur2(i.price) : "—"}
                    <div className="hint num">coût {eur2(costOf(i))}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
