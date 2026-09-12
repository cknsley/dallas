import { useMemo, useState } from "react";
import { Modal, Field, Photo } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { buildSuppliers } from "../lib/suppliers";
import { buildClients } from "../lib/clients";
import { costOf, qtyOf } from "../lib/calc";
import { eur2 } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";

export default function PickLinkModal({
  title = "Lier des éléments à cette tâche",
  initialSupplier = "",
  initialClient = "",
  initialSelectedIds = [],
  onSave,
  onClose,
}: {
  title?: string;
  initialSupplier?: string;
  initialClient?: string;
  initialSelectedIds?: string[];
  onSave: (data: { supplierName: string; clientName: string; itemIds: string[] }) => void;
  onClose: () => void;
}) {
  const { state } = useStore();

  const [supplierName, setSupplierName] = useState(initialSupplier);
  const [clientName, setClientName] = useState(initialClient);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [query, setQuery] = useState("");

  const suppliersList = useMemo(() => {
    const list = buildSuppliers(state.items, state.suppliers);
    return list.map((s) => s.name);
  }, [state.items, state.suppliers]);

  const clientsList = useMemo(() => {
    const list = buildClients(state.items, state.clients);
    return list.map((c) => c.name);
  }, [state.items, state.clients]);

  const itemList = useMemo(() => {
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

  const handleSave = () => {
    onSave({
      supplierName: supplierName.trim(),
      clientName: clientName.trim(),
      itemIds: selectedIds,
    });
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={handleSave}>
            Enregistrer les liens
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Section Fournisseur & Client */}
        <div className="fgrid">
          <Field label="🏢 Fournisseur lié">
            <input
              type="text"
              list="supplier-suggestions"
              value={supplierName}
              placeholder="Ex: StockX Wholesale, Grossiste NL..."
              onChange={(e) => setSupplierName(e.target.value)}
            />
            <datalist id="supplier-suggestions">
              {suppliersList.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>

          <Field label="👤 Client / Acheteur lié">
            <input
              type="text"
              list="client-suggestions"
              value={clientName}
              placeholder="Ex: Alexandre M., Sophie L..."
              onChange={(e) => setClientName(e.target.value)}
            />
            <datalist id="client-suggestions">
              {clientsList.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
        </div>

        {/* Section Articles */}
        <div>
          <label className="flabel" style={{ marginBottom: 6, display: "block" }}>
            📦 Articles en stock ou arrivage ({selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""})
          </label>

          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <input
              type="search"
              value={query}
              placeholder="Rechercher un article..."
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            {selectedIds.length > 0 && (
              <button className="btn sm ghost" onClick={() => setSelectedIds([])}>
                Effacer articles ({selectedIds.length})
              </button>
            )}
          </div>

          <div className="picker" style={{ maxHeight: 220, overflowY: "auto" }}>
            {itemList.length === 0 ? (
              <div className="empty" style={{ padding: 18 }}>Aucun article trouvé</div>
            ) : (
              itemList.map((i) => {
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
                      onChange={() => {}}
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
        </div>
      </div>
    </Modal>
  );
}
