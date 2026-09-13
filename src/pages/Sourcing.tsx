import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Modal, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { uid } from "../lib/id";
import { links } from "../lib/links";
import { eur2, num } from "../lib/format";
import { useToast } from "../components/Toast";
import type { Todo as TodoItem } from "../types";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";

function AddSourcingModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (sourcing: { name: string; brand: string; size: string; price: number; supplierName: string }) => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      brand: brand.trim(),
      size: size.trim(),
      price: num(price),
      supplierName: supplierName.trim(),
    });
    onClose();
  };

  return (
    <Modal
      title="🛒 Nouveau produit à sourcer / trouver"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>Ajouter au Sourcing</button>
        </>
      }
    >
      <form onSubmit={submit} className="fgrid">
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Nom du produit / Modèle recherché *</span>
          <input
            type="text"
            placeholder="ex. Dunk Low Panda, Jordan 4 Military Black…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Marque</span>
          <input type="text" placeholder="ex. Nike, Adidas, Supreme…" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="field">
          <span>Taille / Pointure</span>
          <input type="text" placeholder="ex. 42, M, US 9…" value={size} onChange={(e) => setSize(e.target.value)} />
        </label>
        <label className="field">
          <span>Budget max d'achat (€)</span>
          <input type="number" step="0.01" placeholder="ex. 120,00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Fournisseur / Plateforme visée</span>
          <input type="text" placeholder="ex. StockX, Vinted, Grossiste…" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

type SourcingCol = "recherche" | "negociation" | "commande" | "trouve";

const COL_LABEL: Record<SourcingCol, string> = {
  recherche: "🔎 À rechercher",
  negociation: "💬 En négociation",
  commande: "📦 Passé en commande",
  trouve: "✓ Trouvé / Stock",
};

const COLS: SourcingCol[] = ["recherche", "negociation", "commande", "trouve"];

export default function Sourcing() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [view, setView] = usePref<"kanban" | "list">("sourcingView", "kanban");
  const [showAddModal, setShowAddModal] = useState(false);
  const [orderingTodo, setOrderingTodo] = useState<TodoItem | null>(null);

  // Articles en sourcing = tous les todos marqués isSourcing ou col === "acheter"
  const sourcingItems = state.todos.filter((t) => t.isSourcing || t.col === "acheter");

  const getCol = (t: TodoItem): SourcingCol => {
    if (t.ordered || t.col === "termine") return "trouve";
    if (t.dueDate) return "negociation";
    return "recherche";
  };

  const byCol = (col: SourcingCol) => sourcingItems.filter((t) => getCol(t) === col);

  const addSourcing = ({ name, brand, size, price, supplierName }: { name: string; brand: string; size: string; price: number; supplierName: string }) => {
    dispatch({
      type: "addTodo",
      todo: {
        id: uid(),
        text: name,
        col: "acheter",
        order: Math.max(0, ...state.todos.map((t) => t.order)) + 1,
        createdAt: Date.now(),
        isSourcing: true,
        sourcingBrand: brand,
        sourcingSize: size,
        sourcingPrice: price,
        supplierName,
      },
    });
    toast(`Article « ${name} » ajouté au Sourcing`);
  };

  const openOrder = (t: TodoItem) => {
    setOrderingTodo(t);
  };

  const orderLines = (t: TodoItem): OrderPresetLine[] => [
    {
      name: t.text,
      brand: t.sourcingBrand || "",
      size: t.sourcingSize || "",
      cost: t.sourcingPrice ? String(t.sourcingPrice) : "",
      fees: "0",
      estimate: "",
      quantity: "1",
    },
  ];

  const pendingCount = sourcingItems.filter((t) => !t.ordered && t.col !== "termine").length;
  const totalBudget = sourcingItems.filter((t) => !t.ordered && t.col !== "termine").reduce((a, t) => a + (t.sourcingPrice || 0), 0);
  const orderedCount = sourcingItems.filter((t) => t.ordered || t.col === "termine").length;

  const [editingId, setEditingId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<SourcingCol | null>(null);

  const dropSourcing = (targetCol: SourcingCol) => {
    if (!dragId) return;
    const item = state.todos.find((t) => t.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (!item) return;

    const patch: Partial<TodoItem> = {};
    if (targetCol === "recherche") {
      patch.col = "acheter";
      patch.ordered = false;
      patch.dueDate = undefined;
    } else if (targetCol === "negociation") {
      patch.col = "acheter";
      patch.ordered = false;
      if (!item.dueDate) {
        patch.dueDate = new Date().toISOString().slice(0, 10);
      }
    } else if (targetCol === "trouve") {
      patch.col = "termine";
      patch.ordered = true;
    }

    dispatch({ type: "patchTodo", id: dragId, patch });
    toast(`Article déplacé vers « ${COL_LABEL[targetCol]} »`);
  };

  const card = (t: TodoItem) => {
    return (
      <div
        key={t.id}
        className={`kcard${t.ordered || t.col === "termine" ? " done" : ""}${dragId === t.id ? " dragging" : ""}`}
        draggable={editingId !== t.id}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(t.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverCol(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dropSourcing(getCol(t));
        }}
      >
        <div className="kcard-inner">
          <div className="kcard-row">
            <span style={{ fontSize: 16 }}>🛒</span>
            {editingId === t.id ? (
              <input
                type="text"
                defaultValue={t.text}
                autoFocus
                onBlur={(e) => {
                  dispatch({ type: "patchTodo", id: t.id, patch: { text: e.target.value.trim() || t.text } });
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <div className="tx" style={{ fontWeight: 600 }} onDoubleClick={() => setEditingId(t.id)}>
                {t.text}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 12 }}>
            {t.sourcingBrand && <span className="pill ghost">🏷 {t.sourcingBrand}</span>}
            {t.sourcingSize && <span className="pill ghost">📏 T. {t.sourcingSize}</span>}
            {t.sourcingPrice && t.sourcingPrice > 0 ? (
              <span className="pill good">💰 Budget: {eur2(t.sourcingPrice)}</span>
            ) : null}
            {t.supplierName && <span className="pill info">🏢 {t.supplierName}</span>}
          </div>

          {/* Action Toolbar à la fin de la carte : Commander un article, Modifier, Abandonner */}
          <div className="kcard-actions">
            {t.ordered ? (
              <span
                className="pill good"
                style={{ cursor: "pointer", fontSize: 11, textAlign: "center", justifyContent: "center", width: "100%", padding: "6px 8px" }}
                onClick={() => navigate(links.achats())}
              >
                ✓ Commandé (Centrale) →
              </span>
            ) : (
              <button
                className="btn sm ok"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => openOrder(t)}
              >
                🛒 Commander un article
              </button>
            )}
            <div className="kcard-actions-row">
              <button
                className="btn sm ghost"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setEditingId(t.id)}
              >
                ✎ Modifier
              </button>
              <button
                className="btn sm ghost"
                style={{ flex: 1, justifyContent: "center", color: "var(--bad)" }}
                title="Abandonner"
                onClick={() => dispatch({ type: "removeTodo", id: t.id })}
              >
                ✕ Abandonner
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setShowAddModal(true)}>
          🛒 + Produit à sourcer
        </button>
        <Segmented<"kanban" | "list">
          value={view}
          onChange={setView}
          options={[
            { value: "kanban", label: "Kanban" },
            { value: "list", label: "Liste" },
          ]}
        />
        <span className="hint">{pendingCount} article{pendingCount > 1 ? "s" : ""} à rechercher</span>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi label="Articles à sourcer" value={String(pendingCount)} meta="Recherches actives" tone={pendingCount ? "warn" : "ok"} />
        <Kpi label="Budget engagé visé" value={eur2(totalBudget)} meta="Capital requis pour le sourcing" tone="info" />
        <Kpi label="Commandés / Trouvés" value={String(orderedCount)} meta="Passés en Centrale d'achat" tone="ok" to={links.achats()} hint="Centrale" />
      </div>

      {view === "kanban" ? (
        <div className="kanban">
          {COLS.map((col) => (
            <section
              key={col}
              className={`kcol${overCol === col ? " over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overCol !== col) setOverCol(col);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverCol((c) => (c === col ? null : c));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropSourcing(col);
              }}
            >
              <header className="kcol-h">
                <span className="t">{COL_LABEL[col]}</span>
                <span className="c">{byCol(col).length}</span>
              </header>
              <div className="kcol-b">
                {byCol(col).map(card)}
                {byCol(col).length === 0 && <div className="hint" style={{ padding: "4px" }}>Aucun article</div>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Sourcing &amp; Recherche d'articles</h3>
            <div className="spacer" />
            <button className="btn sm primary" onClick={() => setShowAddModal(true)}>
              🛒 + Article à sourcer
            </button>
          </div>

          {sourcingItems.length === 0 ? (
            <Empty glyph="🛒" title="Aucun article en sourcing">
              Ajoutez les pièces recherchées pour lancer votre sourcing.
              <div style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={() => setShowAddModal(true)}>
                  🛒 + Ajouter un produit à sourcer
                </button>
              </div>
            </Empty>
          ) : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Marque</th>
                    <th>Taille</th>
                    <th>Budget Max</th>
                    <th>Source / Fournisseur</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcingItems.map((t) => (
                    <tr key={t.id}>
                      <td><b>{t.text}</b></td>
                      <td>{t.sourcingBrand || "—"}</td>
                      <td>{t.sourcingSize || "—"}</td>
                      <td className="num">{t.sourcingPrice ? eur2(t.sourcingPrice) : "—"}</td>
                      <td>{t.supplierName || "—"}</td>
                      <td className="r">
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {t.ordered ? (
                            <span className="pill good" style={{ cursor: "pointer" }} onClick={() => navigate(links.achats())}>
                              ✓ Commandé →
                            </span>
                          ) : (
                            <button className="btn sm ok" onClick={() => openOrder(t)}>
                              🛒 Commander un article
                            </button>
                          )}
                          <button className="btn sm ghost" onClick={() => setEditingId(t.id)}>
                            ✎ Modifier
                          </button>
                          <button
                            className="btn sm ghost"
                            style={{ color: "var(--bad)" }}
                            title="Abandonner"
                            onClick={() => dispatch({ type: "removeTodo", id: t.id })}
                          >
                            ✕ Abandonner
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddSourcingModal
          onClose={() => setShowAddModal(false)}
          onAdd={addSourcing}
        />
      )}

      {orderingTodo && (
        <OrderModal
          mode="supplier"
          defaultSource={orderingTodo.supplierName || ""}
          initialLines={orderLines(orderingTodo)}
          onClose={() => setOrderingTodo(null)}
          onCreated={() => {
            dispatch({
              type: "patchTodo",
              id: orderingTodo.id,
              patch: { ordered: true, col: "termine" },
            });
            toast(`Commande créée pour « ${orderingTodo.text} » dans la Centrale d'achat !`, {
              label: "Voir Centrale",
              onClick: () => navigate(links.achats()),
            });
            setOrderingTodo(null);
          }}
        />
      )}
    </>
  );
}
