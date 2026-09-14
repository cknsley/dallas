import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Modal, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { uid } from "../lib/id";
import { links } from "../lib/links";
import { eur2, num } from "../lib/format";
import { useToast } from "../components/Toast";
import { useSecteur } from "../lib/useSecteur";
import { filterSourcingByDomain, isTcgTodo, sectorMeta, todoDomain } from "../lib/calc";
import { fieldLabels } from "../lib/sectorFields";
import type { CustomSector, Todo as TodoItem } from "../types";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";

function AddSourcingModal({
  onClose,
  onAdd,
  currentDomain,
  customSectors,
}: {
  onClose: () => void;
  onAdd: (sourcing: {
    name: string;
    brand: string;
    size: string;
    price: number;
    supplierName: string;
    lead: string;
    sector: string;
    isTcg: boolean;
  }) => void;
  currentDomain: string;
  customSectors: CustomSector[];
}) {
  const [targetDomain, setTargetDomain] = useState(() => (currentDomain === "all" ? "fashion" : currentDomain));
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [lead, setLead] = useState("");

  const isTcg = targetDomain === "tcg";
  const labels = fieldLabels(isTcg ? "tcg" : "fashion");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      brand: brand.trim(),
      size: size.trim(),
      price: num(price),
      supplierName: supplierName.trim(),
      lead: lead.trim(),
      sector: targetDomain,
      isTcg,
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
        {currentDomain === "all" && (
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>Univers / Secteur de destination *</span>
            <select
              value={targetDomain}
              onChange={(e) => setTargetDomain(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="fashion">👕 Vêtements &amp; Fashion</option>
              <option value="tcg">🃏 TCG &amp; Cartes</option>
              {customSectors.map((cs) => (
                <option key={cs.id} value={cs.id}>{cs.icon} {cs.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Nom du produit / Modèle recherché *</span>
          <input
            type="text"
            placeholder={isTcg ? labels.namePlaceholder : "ex. Dunk Low Panda, Jordan 4 Military Black…"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>{labels.brand}</span>
          <input type="text" placeholder={labels.brandPlaceholder} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="field">
          <span>{isTcg ? labels.size : "Taille / Pointure"}</span>
          <input type="text" placeholder={labels.sizePlaceholder} value={size} onChange={(e) => setSize(e.target.value)} />
        </label>
        <label className="field">
          <span>Budget max d'achat (€)</span>
          <input type="number" step="0.01" placeholder="ex. 120,00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>Fournisseur / Plateforme visée</span>
          <input type="text" placeholder="ex. StockX, Vinted, Grossiste…" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </label>
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Lead</span>
          <input type="text" placeholder="ex. @vendeur, contact boutique, piste à relancer…" value={lead} onChange={(e) => setLead(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

type SourcingCol = "recherche" | "negociation" | "trouve";

const COL_LABEL: Record<SourcingCol, string> = {
  recherche: "🔎 À rechercher",
  negociation: "💬 En négociation",
  trouve: "✓ Trouvé",
};

const COLS: SourcingCol[] = ["recherche", "negociation", "trouve"];

export default function Sourcing() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const secteur = useSecteur();
  const currentDomain = secteur.domain;
  const customSectors = state.settings.customSectors ?? [];
  const currentMeta = sectorMeta(currentDomain, customSectors);
  const labels = fieldLabels(currentDomain);

  const [view, setView] = usePref<"kanban" | "list">("sourcingView", "kanban");
  const [showAddModal, setShowAddModal] = useState(false);
  const [orderingTodo, setOrderingTodo] = useState<TodoItem | null>(null);
  const [selectedFilterSector, setSelectedFilterSector] = useState<string>("all");

  // Tous les articles en sourcing = tous les todos marqués isSourcing ou col === "acheter"
  const allSourcingItems = useMemo(
    () => state.todos.filter((t) => t.isSourcing || t.col === "acheter"),
    [state.todos],
  );

  // Articles en sourcing selon le contexte (dans un univers vs accueil centralisé)
  const sourcingItems = useMemo(() => {
    if (currentDomain !== "all") {
      return filterSourcingByDomain(allSourcingItems, currentDomain, state.items);
    }
    // Dans l'accueil centralisé : filtre interne optionnel
    if (selectedFilterSector !== "all") {
      return filterSourcingByDomain(allSourcingItems, selectedFilterSector, state.items);
    }
    return allSourcingItems;
  }, [allSourcingItems, currentDomain, selectedFilterSector, state.items]);

  const getCol = (t: TodoItem): SourcingCol => {
    if (t.ordered || t.col === "termine") return "trouve";
    if (t.dueDate) return "negociation";
    return "recherche";
  };

  const byCol = (col: SourcingCol) => sourcingItems.filter((t) => getCol(t) === col);

  const addSourcing = ({
    name,
    brand,
    size,
    price,
    supplierName,
    lead,
    sector,
    isTcg,
  }: {
    name: string;
    brand: string;
    size: string;
    price: number;
    supplierName: string;
    lead: string;
    sector: string;
    isTcg: boolean;
  }) => {
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
        sourcingLead: lead,
        supplierName,
        sector,
        isTcg,
      },
    });
    toast(`Article « ${name} » ajouté au Sourcing`);
  };

  const openOrder = (t: TodoItem) => {
    setOrderingTodo(t);
  };

  const markTracked = (t: TodoItem) => {
    if (getCol(t) === "negociation") return;
    dispatch({
      type: "patchTodo",
      id: t.id,
      patch: { col: "acheter", ordered: false, dueDate: new Date().toISOString().slice(0, 10) },
    });
    toast(`« ${t.text} » passe en négociation`);
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
  const negoCount = sourcingItems.filter((t) => getCol(t) === "negociation").length;
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
    const itemDomain = todoDomain(t);
    const itemMeta = sectorMeta(itemDomain, customSectors);

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
            <span className="pill info" style={{ fontSize: 11, fontWeight: 600 }}>
              {itemMeta.icon} {itemMeta.label}
            </span>
            {t.sourcingBrand && <span className="pill ghost">🏷 {t.sourcingBrand}</span>}
            {t.sourcingSize && <span className="pill ghost">📏 {labels.sizePrefix}{t.sourcingSize}</span>}
            {t.sourcingPrice && t.sourcingPrice > 0 ? (
              <span className="pill good">💰 Budget: {eur2(t.sourcingPrice)}</span>
            ) : null}
            {t.supplierName && <span className="pill info">🏢 {t.supplierName}</span>}
          </div>
          {t.sourcingLead && <div className="sourcing-lead">Lead : {t.sourcingLead}</div>}

          {/* Action Toolbar à la fin de la carte : Commander un article, Modifier, Abandonner */}
          <div className="kcard-actions">
            {t.ordered ? (
              <span
                className="pill good"
                style={{ cursor: "pointer", fontSize: 11, textAlign: "center", justifyContent: "center", width: "100%", padding: "6px 8px" }}
                onClick={() => navigate(links.achats({ secteur: itemDomain }))}
              >
                ✓ Commandé (Centrale) →
              </span>
            ) : (
              <div className="kcard-actions-row">
                {getCol(t) === "recherche" && (
                  <button className="btn sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => markTracked(t)}>
                    → Pisté
                  </button>
                )}
                <button className="btn sm ok" style={{ flex: 1, justifyContent: "center" }} onClick={() => openOrder(t)}>
                  ✓ Trouvé
                </button>
              </div>
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
        {currentDomain !== "all" && (
          <Link to="/sourcing" className="btn sm ghost" title="Voir tout le Sourcing centralisé de l'accueil">
            🌐 Tout centralisé
          </Link>
        )}
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

      {/* ── BANNIÈRE CONTEXTE : ACCUEIL CENTRALISÉ OU SECTEUR DÉDIÉ ── */}
      {currentDomain === "all" ? (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(6, 182, 212, 0.05) 100%)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🌐</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <b style={{ fontSize: 14 }}>Sourcing Centralisé — Tous univers</b>
                <span className="pill info" style={{ fontSize: 11, padding: "2px 8px" }}>Centralisé Accueil</span>
              </div>
              <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>
                Toutes vos opportunités et recherches d'achat réunies · Filtrage instantané par univers
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`btn sm ${selectedFilterSector === "all" ? "primary" : "ghost"}`}
              onClick={() => setSelectedFilterSector("all")}
            >
              Tous ({allSourcingItems.length})
            </button>
            <button
              type="button"
              className={`btn sm ${selectedFilterSector === "fashion" ? "primary" : "ghost"}`}
              onClick={() => setSelectedFilterSector("fashion")}
            >
              👕 Vêtements ({filterSourcingByDomain(allSourcingItems, "fashion", state.items).length})
            </button>
            <button
              type="button"
              className={`btn sm ${selectedFilterSector === "tcg" ? "primary" : "ghost"}`}
              onClick={() => setSelectedFilterSector("tcg")}
            >
              🃏 TCG ({filterSourcingByDomain(allSourcingItems, "tcg", state.items).length})
            </button>
            {customSectors.map((cs) => (
              <button
                key={cs.id}
                type="button"
                className={`btn sm ${selectedFilterSector === cs.id ? "primary" : "ghost"}`}
                onClick={() => setSelectedFilterSector(cs.id)}
              >
                {cs.icon} {cs.label} ({filterSourcingByDomain(allSourcingItems, cs.id, state.items).length})
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 12,
            padding: "10px 14px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--line)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{currentMeta.icon}</span>
            <div>
              <b style={{ fontSize: 14 }}>Sourcing · {currentMeta.label}</b>
              <div className="hint" style={{ fontSize: 12 }}>
                Recherches et opportunités isolées dans cet univers
              </div>
            </div>
          </div>
          <Link to="/sourcing" className="btn sm ghost" style={{ textDecoration: "none" }}>
            🌐 Voir tout le Sourcing centralisé (tous univers) →
          </Link>
        </div>
      )}

      <div className="kpi-grid">
        <Kpi label="Articles à sourcer" value={String(pendingCount)} meta="Recherches actives" tone={pendingCount ? "warn" : "ok"} />
        <Kpi label="En négociation" value={String(negoCount)} meta="Discussions en cours avec un vendeur" tone={negoCount ? "info" : "ok"} />
        <Kpi
          label="Commandés / Trouvés"
          value={String(orderedCount)}
          meta="Passés en Centrale d'achat"
          tone="ok"
          to={links.achats({ secteur: currentDomain !== "all" ? currentDomain : undefined })}
          hint="Centrale"
        />
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
                    <th>Univers</th>
                    <th>{labels.brand}</th>
                    <th>{labels.size}</th>
                    <th>Budget Max</th>
                    <th>Source / Fournisseur</th>
                    <th>Lead</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcingItems.map((t) => {
                    const itemDomain = todoDomain(t);
                    const itemMeta = sectorMeta(itemDomain, customSectors);
                    return (
                      <tr key={t.id}>
                        <td><b>{t.text}</b></td>
                        <td>
                          <span className="pill info" style={{ fontSize: 11, fontWeight: 600 }}>
                            {itemMeta.icon} {itemMeta.label}
                          </span>
                        </td>
                        <td>{t.sourcingBrand || "—"}</td>
                        <td>{t.sourcingSize || "—"}</td>
                        <td className="num">{t.sourcingPrice ? eur2(t.sourcingPrice) : "—"}</td>
                        <td>{t.supplierName || "—"}</td>
                        <td>{t.sourcingLead || "—"}</td>
                        <td className="r">
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                            {t.ordered ? (
                              <span
                                className="pill good"
                                style={{ cursor: "pointer" }}
                                onClick={() => navigate(links.achats({ secteur: itemDomain }))}
                              >
                                ✓ Commandé →
                              </span>
                            ) : (
                              <>
                                {getCol(t) === "recherche" && (
                                  <button className="btn sm" onClick={() => markTracked(t)}>→ Pisté</button>
                                )}
                                <button className="btn sm ok" onClick={() => openOrder(t)}>
                                  ✓ Trouvé
                                </button>
                              </>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddSourcingModal
          currentDomain={currentDomain}
          customSectors={customSectors}
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
            const targetSector = orderingTodo.sector || (isTcgTodo(orderingTodo) ? "tcg" : undefined);
            toast(`Commande créée pour « ${orderingTodo.text} » dans la Centrale d'achat !`, {
              label: "Voir Centrale",
              onClick: () => navigate(links.achats({ secteur: targetSector })),
            });
            setOrderingTodo(null);
          }}
        />
      )}
    </>
  );
}
