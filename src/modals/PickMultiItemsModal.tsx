import { useMemo, useState } from "react";
import { Modal, Photo } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { eur2 } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";

export default function PickMultiItemsModal({
  title = "Lier des articles à cette tâche",
  initialSelectedIds = [],
  onSave,
  onClose,
}: {
  title?: string;
  initialSelectedIds?: string[];
  onSave: (selectedIds: string[]) => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.items
      .filter((i) => !needle || [i.name, i.brand, i.type, i.size, i.lotTag].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.items, query]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={() => onSave(selectedIds)}>
            Enregistrer ({selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""})
          </button>
        </div>
      }
    >
      {state.items.length === 0 ? (
        <div className="empty" style={{ padding: 28 }}>
          <div className="glyph">▦</div>
          <h3>Aucun article disponible</h3>
          <div>Ajoutez des articles en stock pour pouvoir les lier à vos tâches.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <input
              type="search"
              value={query}
              placeholder="Rechercher un article (marque, nom, taille)..."
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
            {selectedIds.length > 0 && (
              <button className="btn sm ghost" onClick={() => setSelectedIds([])}>
                Réinitialiser ({selectedIds.length})
              </button>
            )}
          </div>
          <div className="picker" style={{ maxHeight: 360, overflowY: "auto" }}>
            {list.length === 0 ? (
              <div className="empty" style={{ padding: 22 }}>Aucun article ne correspond à la recherche</div>
            ) : (
              list.map((i) => {
                const isSelected = selectedIds.includes(i.id);
                return (
                  <div
                    key={i.id}
                    className={`prow ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleSelect(i.id)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "var(--accent-soft)" : undefined,
                      borderColor: isSelected ? "var(--accent)" : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // géré par clic prow
                      style={{ accentColor: "var(--accent)", pointerEvents: "none" }}
                    />
                    <Photo id={i.photoId} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }} className="ellipsis">
                        {i.name || "Sans nom"}
                        {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                      </div>
                      <div className="hint">
                        {i.brand || "—"}{i.size ? ` · ${i.size}` : ""} · <span className={`pill ${i.status}`}>{STATUS_LABEL[i.status]}</span>
                      </div>
                    </div>
                    <div className="num" style={{ fontSize: 12, textAlign: "right" }}>
                      {i.price ? eur2(i.price) : "—"}
                      <div className="hint num">coût {eur2(costOf(i))}</div>
                    </div>
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
