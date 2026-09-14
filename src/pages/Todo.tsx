import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Modal } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useSecteur } from "../lib/useSecteur";
import { filterTodosByDomain, sectorMeta } from "../lib/calc";
import { fieldLabels } from "../lib/sectorFields";
import { TODO_LABEL, TODO_ORDER } from "../lib/constants";
import { uid } from "../lib/id";
import { links } from "../lib/links";
import { eur2, num } from "../lib/format";
import { useToast } from "../components/Toast";
import type { Todo as TodoItem, TodoCol } from "../types";
import PickLinkModal from "../modals/PickLinkModal";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";

function AddSourcingModal({ onClose, onAdd }: { onClose: () => void; onAdd: (sourcing: { name: string; brand: string; size: string; price: number; supplierName: string }) => void }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const isTcg = useSecteur().domain === "tcg";
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
    });
    onClose();
  };

  return (
    <Modal
      title="🛒 Nouveau produit à sourcer / acheter"
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
          <span>Nom du produit / Modèle *</span>
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
          <span>Budget d'achat (€)</span>
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

function AddTodoModal({
  defaultCol = "envoyer",
  onClose,
  onAdd,
}: {
  defaultCol?: TodoCol;
  onClose: () => void;
  onAdd: (col: TodoCol, text: string, dueDate?: string) => void;
}) {
  const [text, setText] = useState("");
  const [col, setCol] = useState<TodoCol>(defaultCol);
  const [dueDate, setDueDate] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(col, text.trim(), dueDate);
    onClose();
  };

  return (
    <Modal
      title="✨ Ajouter une tâche Todo"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>Ajouter la tâche</button>
        </>
      }
    >
      <form onSubmit={submit} className="fgrid">
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Intitulé de la tâche *</span>
          <input
            type="text"
            placeholder="ex. Préparer l'envoi du colis Vinted, Imprimer bordereau Mondial Relay…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Liste / Statut</span>
          <select value={col} onChange={(e) => setCol(e.target.value as TodoCol)}>
            <option value="envoyer">📦 À envoyer</option>
            <option value="faire">📋 À faire</option>
            <option value="acheter">🛒 À acheter / Sourcer</option>
            <option value="termine">✓ Terminé</option>
          </select>
        </label>
        <label className="field">
          <span>Date d'échéance (optionnel)</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

export default function Todo() {
  const { state, dispatch, resolveAutoTodo } = useStore();
  const secteur = useSecteur();
  const labels = fieldLabels(secteur.domain);
  const toast = useToast();
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoCol | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDateTodoId, setEditingDateTodoId] = useState<string | null>(null);
  const [linkingTodo, setLinkingTodo] = useState<TodoItem | null>(null);
  const [orderingTodo, setOrderingTodo] = useState<TodoItem | null>(null);
  const [showAddSourcingModal, setShowAddSourcingModal] = useState(false);
  const [showAddTodoModal, setShowAddTodoModal] = useState(false);
  const [defaultAddCol, setDefaultAddCol] = useState<TodoCol>("envoyer");

  // L'affichage est strictement cloisonné par univers (sauf sur Todo centralisé de l'accueil)
  const visibleTodos = useMemo(
    () => filterTodosByDomain(state.todos, secteur.domain, state.items),
    [state.todos, secteur.domain, state.items],
  );
  const byCol = (c: TodoCol) => visibleTodos.filter((t: TodoItem) => t.col === c).sort((a: TodoItem, b: TodoItem) => {
    if (secteur.domain === "all") {
      const sA = a.sector || (a.isTcg ? "tcg" : "fashion");
      const sB = b.sector || (b.isTcg ? "tcg" : "fashion");
      if (sA !== sB) return sA.localeCompare(sB);
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }
    return a.order - b.order;
  });

  const add = (col: TodoCol, text: string, dueDate?: string) => {
    const clean = text.trim();
    if (!clean) return;
    const order = Math.max(0, ...state.todos.filter((t) => t.col === col).map((t) => t.order)) + 1;
    const isTcgSector = secteur.domain === "tcg";
    const currentSector = secteur.domain !== "all" ? secteur.domain : undefined;
    dispatch({
      type: "addTodo",
      todo: {
        id: uid(),
        text: clean,
        col,
        order,
        createdAt: Date.now(),
        dueDate,
        sector: currentSector,
        isTcg: isTcgSector,
      },
    });
    toast(`Tâche « ${clean} » ajoutée dans ${TODO_LABEL[col]}`);
  };

  const addSourcing = ({ name, brand, size, price, supplierName }: { name: string; brand: string; size: string; price: number; supplierName: string }) => {
    const col: TodoCol = "acheter";
    const order = Math.max(0, ...state.todos.filter((t) => t.col === col).map((t) => t.order)) + 1;
    dispatch({
      type: "addTodo",
      todo: {
        id: uid(),
        text: name,
        col,
        order,
        createdAt: Date.now(),
        isSourcing: true,
        sourcingBrand: brand,
        sourcingSize: size,
        sourcingPrice: price,
        supplierName,
        sector: secteur.domain !== "all" ? secteur.domain : undefined,
        isTcg: secteur.domain === "tcg",
      },
    });
    toast(`Article « ${name} » ajouté aux produits à acheter`);
  };

  const drop = (col: TodoCol, beforeId?: string) => {
    if (!dragId) return;
    const moving = state.todos.find((t) => t.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (!moving) return;
    const target = state.todos.filter((t) => t.col === col && t.id !== dragId).sort((a, b) => a.order - b.order);
    const index = beforeId ? target.findIndex((t) => t.id === beforeId) : target.length;
    const ordered = [...target];
    ordered.splice(index < 0 ? target.length : index, 0, { ...moving, col });
    const renumbered = ordered.map((t, ix) => ({ ...t, col, order: ix }));
    const others = state.todos.filter((t) => t.col !== col && t.id !== dragId);
    dispatch({ type: "reorderTodos", todos: [...others, ...renumbered] });
  };

  const remaining = visibleTodos.filter((t: TodoItem) => t.col !== "termine").length;

  /** Où se règle réellement la tâche. */
  const autoTarget = (t: TodoItem) =>
    t.auto === "ship" ? links.livraison({ tab: "a_partir" })
    : links.facturation({ state: "unpaid" });

  const completeAuto = (t: TodoItem) => {
    const message = resolveAutoTodo(t);
    if (message) toast(message, { label: "Voir", onClick: () => navigate(autoTarget(t)) });
  };

  const openOrderForTodo = (t: TodoItem) => {
    setOrderingTodo(t);
  };

  const orderLinesForTodo = (t: TodoItem): OrderPresetLine[] => [
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

  const card = (t: TodoItem) => {
    const isAuto = !!t.auto;
    const isSourcing = !!t.isSourcing || t.col === "acheter";
    const linkedIds = t.itemIds?.length ? t.itemIds : (t.itemId ? [t.itemId] : []);
    const linkedItems = state.items.filter((i) => linkedIds.includes(i.id));
    const isEditingDate = editingDateTodoId === t.id;

    const dateBadge = () => {
      if (!t.dueDate) return null;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const target = new Date(t.dueDate);
      target.setHours(0, 0, 0, 0);
      const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
      const formatted = target.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      let cls = "kcard-date-btn";
      let label = `📅 ${formatted}`;
      if (diff < 0 && t.col !== "termine") {
        cls += " overdue";
        label = `⚠️ En retard (${formatted})`;
      } else if (diff === 0 && t.col !== "termine") {
        cls += " today";
        label = `📌 Aujourd'hui`;
      }
      return { cls, label };
    };

    const db = dateBadge();

    return (
      <div
        key={t.id}
        className={`kcard${t.col === "termine" ? " done" : ""}${dragId === t.id ? " dragging" : ""}${isAuto ? " auto" : ""}`}
        draggable={!isAuto && editingId !== t.id}
        onDragStart={(e) => {
          if (isAuto) return;
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(t.id);
        }}
        onDragEnd={() => { setDragId(null); setOverCol(null); }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drop(t.col, t.id);
        }}
      >
        <div className="kcard-inner">
          <div className="kcard-row">
            <input
              type="checkbox"
              checked={t.col === "termine"}
              title={isAuto ? "Cocher exécute l’action sur l’article ou le document" : undefined}
              style={{ accentColor: "var(--accent)", marginTop: 2 }}
              onChange={(e) => {
                if (isAuto) {
                  if (e.target.checked) completeAuto(t);
                  return;
                }
                dispatch({ type: "patchTodo", id: t.id, patch: { col: e.target.checked ? "termine" : "faire" } });
              }}
            />
            {editingId === t.id ? (
              <input
                type="text"
                defaultValue={t.text}
                autoFocus
                onBlur={(e) => { dispatch({ type: "patchTodo", id: t.id, patch: { text: e.target.value.trim() || t.text } }); setEditingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{ flex: 1 }}
              />
            ) : isAuto ? (
              <button className="tx linkish" onClick={() => navigate(autoTarget(t))}>{t.text}</button>
            ) : (
              <div className="tx" onDoubleClick={() => setEditingId(t.id)}>{t.text}</div>
            )}
            {secteur.domain === "all" && (
              <span className="pill ghost" style={{ fontSize: 10, padding: "2px 6px", marginRight: 4 }}>
                {sectorMeta(t.sector || (t.isTcg ? "tcg" : "fashion"), state.settings.customSectors ?? []).icon}
              </span>
            )}
            {isAuto ? (
              <span className="auto-tag" title="Tâche automatique générée par l'application">⚡ AUTO</span>
            ) : isSourcing ? (
              <span className="pill info" style={{ fontSize: 10, padding: "2px 6px" }}>Sourcing</span>
            ) : null}
          </div>

          {/* Métadonnées Sourcing : Marque/Licence, Taille/Grade, Budget */}
          {isSourcing && (t.sourcingBrand || t.sourcingSize || (t.sourcingPrice && t.sourcingPrice > 0)) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4, fontSize: 12, opacity: 0.9 }}>
              {t.sourcingBrand && <span className="pill ghost">🏷 {t.sourcingBrand}</span>}
              {t.sourcingSize && <span className="pill ghost">📏 {labels.sizePrefix}{t.sourcingSize}</span>}
              {t.sourcingPrice && t.sourcingPrice > 0 ? (
                <span className="pill good">💰 Budget : {eur2(t.sourcingPrice)}</span>
              ) : null}
            </div>
          )}

          {/* Métadonnées Kanban : Date, Fournisseur, Client et Articles liés */}
          {!isAuto && (
            <div className="kcard-meta">
              {/* Saisie ou affichage de la date */}
              {isEditingDate ? (
                <input
                  type="date"
                  defaultValue={t.dueDate || ""}
                  autoFocus
                  onChange={(e) => {
                    dispatch({ type: "patchTodo", id: t.id, patch: { dueDate: e.target.value } });
                    setEditingDateTodoId(null);
                  }}
                  onBlur={() => setEditingDateTodoId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setEditingDateTodoId(null);
                  }}
                  style={{ fontSize: 11, padding: "1px 5px", height: 24, borderRadius: 6, width: "auto" }}
                />
              ) : (
                <button
                  className={db ? db.cls : "kcard-date-btn"}
                  title="Cliquer pour définir ou modifier la date d'échéance"
                  onClick={() => setEditingDateTodoId(t.id)}
                >
                  {db ? db.label : "+ Date"}
                </button>
              )}

              {/* Fournisseur lié */}
              {t.supplierName && (
                <span
                  className="kcard-item-chip"
                  style={{ borderColor: "var(--accent-soft)", background: "rgba(59, 130, 246, 0.1)" }}
                  title={`Fournisseur : ${t.supplierName}`}
                >
                  <span
                    className="ellipsis"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(links.fournisseurs({ q: t.supplierName }))}
                  >
                    🏢 {t.supplierName}
                  </span>
                  <span
                    className="remove"
                    title="Détacher ce fournisseur"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "patchTodo", id: t.id, patch: { supplierName: "" } });
                    }}
                  >
                    ✕
                  </span>
                </span>
              )}

              {/* Client lié */}
              {t.clientName && (
                <span
                  className="kcard-item-chip"
                  style={{ borderColor: "var(--accent-soft)", background: "rgba(16, 185, 129, 0.1)" }}
                  title={`Client : ${t.clientName}`}
                >
                  <span
                    className="ellipsis"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(links.clients({ q: t.clientName }))}
                  >
                    👤 {t.clientName}
                  </span>
                  <span
                    className="remove"
                    title="Détacher ce client"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "patchTodo", id: t.id, patch: { clientName: "" } });
                    }}
                  >
                    ✕
                  </span>
                </span>
              )}

              {/* Articles liés */}
              {linkedItems.map((item) => (
                <span key={item.id} className="kcard-item-chip" title={`${item.brand || ""} ${item.name} (${item.size || "Taille —"})`}>
                  <span className="ellipsis">📦 {item.brand ? `${item.brand} ` : ""}{item.name}</span>
                  <span
                    className="remove"
                    title="Détacher cet article"
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = linkedIds.filter((id) => id !== item.id);
                      dispatch({ type: "patchTodo", id: t.id, patch: { itemIds: updated, itemId: updated[0] } });
                    }}
                  >
                    ✕
                  </span>
                </span>
              ))}

              {/* Bouton pour ouvrir la modal de liaison universelle */}
              <button
                className="kcard-add-link-btn"
                title="Lier un fournisseur, client ou des articles à cette tâche"
                onClick={() => setLinkingTodo(t)}
              >
                + Lien
              </button>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="kcard-actions">
            {isAuto ? (
              <button
                type="button"
                className="btn sm primary"
                style={{ width: "100%", justifyContent: "center", fontSize: 11 }}
                onClick={() => completeAuto(t)}
              >
                {t.auto === "ship" ? "📦 Expédier & Valider →" : "💳 Voir le règlement →"}
              </button>
            ) : (
              <>
                {(isSourcing || t.col === "acheter") && (
                  t.ordered ? (
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
                      onClick={() => openOrderForTodo(t)}
                    >
                      🛒 Commander un article
                    </button>
                  )
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
                    title="Abandonner / Supprimer"
                    onClick={() => dispatch({ type: "removeTodo", id: t.id })}
                  >
                    ✕ Abandonner
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <HeaderActions>
        <button
          className="btn primary"
          onClick={() => {
            setDefaultAddCol("envoyer");
            setShowAddTodoModal(true);
          }}
        >
          + Nouvelle tâche
        </button>
        <button
          className="btn"
          onClick={() => navigate(links.sourcing({ secteur: secteur.domain !== "all" ? secteur.domain : undefined }))}
        >
          🛒 Espace Sourcing →
        </button>
        <span className="hint">
          {remaining} action{remaining > 1 ? "s" : ""} à suivre
        </span>
      </HeaderActions>

      {secteur.domain !== "all" && (
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
            <span style={{ fontSize: 20 }}>{sectorMeta(secteur.domain, state.settings.customSectors ?? []).icon}</span>
            <div>
              <b style={{ fontSize: 14 }}>Todo · {sectorMeta(secteur.domain, state.settings.customSectors ?? []).label}</b>
              <div className="hint" style={{ fontSize: 12 }}>
                Tâches et actions isolées dans cet univers
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => navigate("/todo")}
          >
            🌐 Voir tout le Todo centralisé (tous univers) →
          </button>
        </div>
      )}

      <div className="kanban">
          {TODO_ORDER.map((col) => (
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
                drop(col);
              }}
            >
              <header className="kcol-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="t">{TODO_LABEL[col]}</span>
                  <span className="c">{byCol(col).length}</span>
                </div>
                <button
                  type="button"
                  className="btn sm ghost"
                  title={`Ajouter une tâche dans ${TODO_LABEL[col]}`}
                  onClick={() => {
                    if (col === "acheter") {
                      setShowAddSourcingModal(true);
                    } else {
                      setDefaultAddCol(col);
                      setShowAddTodoModal(true);
                    }
                  }}
                  style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", height: 24 }}
                >
                  +
                </button>
              </header>
              <div className="kcol-b">
                {byCol(col).map(card)}
                {byCol(col).length === 0 && <div className="hint" style={{ padding: "2px 2px 4px" }}>Déposez une carte ici</div>}
                <input
                  className="kadd-input"
                  type="text"
                  placeholder={col === "acheter" ? "+ Sourcer un article" : "+ Ajouter une tâche"}
                  aria-label={`Ajouter une tâche dans ${TODO_LABEL[col]}`}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const input = e.currentTarget;
                    add(col, input.value);
                    input.value = "";
                  }}
                />
              </div>
            </section>
          ))}
      </div>

      {/* Modal d'ajout de tâche Todo */}
      {showAddTodoModal && (
        <AddTodoModal
          defaultCol={defaultAddCol}
          onClose={() => setShowAddTodoModal(false)}
          onAdd={(col, text, dueDate) => add(col, text, dueDate)}
        />
      )}

      {/* Modal d'ajout de produit à sourcer */}
      {showAddSourcingModal && (
        <AddSourcingModal
          onClose={() => setShowAddSourcingModal(false)}
          onAdd={addSourcing}
        />
      )}

      {/* Modal de commande liée à la Centrale d'achat */}
      {orderingTodo && (
        <OrderModal
          mode="supplier"
          defaultSource={orderingTodo.supplierName || ""}
          initialLines={orderLinesForTodo(orderingTodo)}
          onClose={() => setOrderingTodo(null)}
          onCreated={() => {
            dispatch({
              type: "patchTodo",
              id: orderingTodo.id,
              patch: { ordered: true, col: "termine" },
            });
            toast(`Commande créée pour « ${orderingTodo.text} » — Disponible dans la Centrale d'achat !`, {
              label: "Voir Centrale",
              onClick: () => navigate(links.achats()),
            });
            setOrderingTodo(null);
          }}
        />
      )}

      {/* Modal de liaison (Fournisseur, Client, Articles) */}
      {linkingTodo && (
        <PickLinkModal
          title={`Lier à « ${linkingTodo.text} »`}
          initialSupplier={linkingTodo.supplierName || ""}
          initialClient={linkingTodo.clientName || ""}
          initialSelectedIds={linkingTodo.itemIds?.length ? linkingTodo.itemIds : (linkingTodo.itemId ? [linkingTodo.itemId] : [])}
          onClose={() => setLinkingTodo(null)}
          onSave={({ supplierName, clientName, itemIds }) => {
            dispatch({
              type: "patchTodo",
              id: linkingTodo.id,
              patch: {
                supplierName,
                clientName,
                itemIds,
                itemId: itemIds[0],
              },
            });
            setLinkingTodo(null);
          }}
        />
      )}
    </>
  );
}
