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

export default function Todo() {
  const { state, dispatch, resolveAutoTodo } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [view, setView] = usePref<"kanban" | "list">("todoView", "kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoCol | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        <input
          type="checkbox"
          checked={t.col === "termine"}
          title={isAuto ? "Cocher exécute l'action sur la pièce ou le document" : undefined}
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
                .map((t) => (
                  <div className="row" key={t.id}>
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
                      <div style={{ flex: 1, textDecoration: t.col === "termine" ? "line-through" : "none", color: t.col === "termine" ? "var(--ink-3)" : undefined }}>
                        {t.text}
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
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
