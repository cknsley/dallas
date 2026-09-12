import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { TODO_LABEL, TODO_ORDER } from "../lib/constants";
import { uid } from "../lib/id";
import { links } from "../lib/links";
import { useToast } from "../components/Toast";
import type { Todo as TodoItem, TodoCol } from "../types";
import PickLinkModal from "../modals/PickLinkModal";

export default function Todo() {
  const { state, dispatch, resolveAutoTodo } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [view, setView] = usePref<"kanban" | "list">("todoView", "kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoCol | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDateTodoId, setEditingDateTodoId] = useState<string | null>(null);
  const [linkingTodo, setLinkingTodo] = useState<TodoItem | null>(null);

  const byCol = (c: TodoCol) => state.todos.filter((t) => t.col === c).sort((a, b) => a.order - b.order);

  const add = (col: TodoCol, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const order = Math.max(0, ...state.todos.filter((t) => t.col === col).map((t) => t.order)) + 1;
    dispatch({ type: "addTodo", todo: { id: uid(), text: clean, col, order, createdAt: Date.now() } });
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

  const remaining = state.todos.filter((t) => t.col !== "termine").length;
  const autoCount = state.todos.filter((t) => t.auto).length;

  /** Où se règle réellement la tâche. */
  const autoTarget = (t: TodoItem) =>
    t.auto === "ship" ? links.livraison({ tab: "faire" })
    : t.auto === "receive" ? links.livraison({ tab: "recevoir" })
    : links.facturation({ state: "unpaid" });

  const completeAuto = (t: TodoItem) => {
    const message = resolveAutoTodo(t);
    if (message) toast(message, { label: "Voir", onClick: () => navigate(autoTarget(t)) });
  };

  const card = (t: TodoItem) => {
    const isAuto = !!t.auto;
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
        onDragStart={() => !isAuto && setDragId(t.id)}
        onDragEnd={() => { setDragId(null); setOverCol(null); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.stopPropagation(); drop(t.col, t.id); }}
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
            {isAuto ? (
              <span className="auto-tag" title="Tâche déduite de l'état de l'app">auto</span>
            ) : (
              <button className="iconbtn del" title="Supprimer" onClick={() => dispatch({ type: "removeTodo", id: t.id })}>✕</button>
            )}
          </div>

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
        </div>
      </div>
    );
  };

  return (
    <>
      <HeaderActions>
        <Segmented<"kanban" | "list">
          value={view}
          onChange={setView}
          options={[
            { value: "kanban", label: "Kanban" },
            { value: "list", label: "Liste" },
          ]}
        />
        <span className="hint">
          {remaining} tâche{remaining > 1 ? "s" : ""} en cours
          {autoCount > 0 && ` · ${autoCount} automatique${autoCount > 1 ? "s" : ""}`}
        </span>
      </HeaderActions>

      {view === "kanban" ? (
        <div className="kanban">
          {TODO_ORDER.map((col) => (
            <section
              key={col}
              className={`kcol${overCol === col ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => drop(col)}
            >
              <header className="kcol-h">
                <span className="t">{TODO_LABEL[col]}</span>
                <span className="c">{byCol(col).length}</span>
              </header>
              <div className="kcol-b">
                {byCol(col).map(card)}
                {byCol(col).length === 0 && <div className="hint" style={{ padding: "2px 2px 4px" }}>Déposez une carte ici</div>}
                <input
                  className="kadd-input"
                  type="text"
                  placeholder="+ Ajouter une tâche"
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
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Toutes les tâches</h3>
            <div className="spacer" />
            <input
              type="text"
              placeholder="Ajouter une tâche à « À faire » puis Entrée"
              style={{ width: 300 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  add("faire", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
          {state.todos.length === 0 ? (
            <Empty glyph="☑" title="Rien à faire pour l'instant">Ajoutez une tâche pour démarrer.</Empty>
          ) : (
            <div className="tlist">
              {[...state.todos]
                .sort((a, b) => TODO_ORDER.indexOf(a.col) - TODO_ORDER.indexOf(b.col) || a.order - b.order)
                .map((t) => {
                  const linkedIds = t.itemIds?.length ? t.itemIds : (t.itemId ? [t.itemId] : []);
                  const linkedItems = state.items.filter((i) => linkedIds.includes(i.id));
                  return (
                    <div className="row" key={t.id} style={{ flexWrap: "wrap", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={t.col === "termine"}
                        style={{ accentColor: "var(--accent)" }}
                        onChange={(e) => {
                          if (t.auto) {
                            if (e.target.checked) completeAuto(t);
                            return;
                          }
                          dispatch({ type: "patchTodo", id: t.id, patch: { col: e.target.checked ? "termine" : "faire" } });
                        }}
                      />
                      {t.auto ? (
                        <button className="linkish" style={{ flex: 1 }} onClick={() => navigate(autoTarget(t))}>
                          {t.text}
                        </button>
                      ) : (
                        <div style={{ flex: 1, minWidth: 200, textDecoration: t.col === "termine" ? "line-through" : "none", color: t.col === "termine" ? "var(--ink-3)" : undefined }}>
                          {t.text}
                        </div>
                      )}

                      {!t.auto && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            type="date"
                            value={t.dueDate || ""}
                            onChange={(e) => dispatch({ type: "patchTodo", id: t.id, patch: { dueDate: e.target.value } })}
                            style={{ fontSize: 11, padding: "2px 4px", height: 24 }}
                          />

                          {t.supplierName && (
                            <span className="kcard-item-chip" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                              🏢 {t.supplierName}
                            </span>
                          )}

                          {t.clientName && (
                            <span className="kcard-item-chip" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                              👤 {t.clientName}
                            </span>
                          )}

                          {linkedItems.map((item) => (
                            <span key={item.id} className="kcard-item-chip">
                              📦 {item.name}
                            </span>
                          ))}
                          <button className="btn sm ghost" onClick={() => setLinkingTodo(t)}>
                            + Lien
                          </button>
                        </div>
                      )}

                      {t.auto ? (
                        <span className="auto-tag">auto</span>
                      ) : (
                        <>
                          <select
                            value={t.col}
                            style={{ width: "auto", padding: "3px 6px", fontSize: 12 }}
                            onChange={(e) => dispatch({ type: "patchTodo", id: t.id, patch: { col: e.target.value as TodoCol } })}
                          >
                            {TODO_ORDER.map((c) => (
                              <option key={c} value={c}>{TODO_LABEL[c]}</option>
                            ))}
                          </select>
                          <button className="iconbtn del" title="Supprimer" onClick={() => dispatch({ type: "removeTodo", id: t.id })}>✕</button>
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
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

