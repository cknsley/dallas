import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Kpi, RangePicker } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import {
  chargesInRange, expenseKind, expenseMonthlyShare,
  expenseMonths, periodRange, remainingToAmortize,
} from "../lib/calc";
import { useDateRange } from "../lib/useDateRange";
import { dfr, eur, eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import ExpenseModal from "../modals/ExpenseModal";
import type { Expense } from "../types";

const thisMonth = () => new Date().toISOString().slice(0, 7);

const KIND_OPTIONS = [
  { value: "activite", label: "💼 Activité", color: "var(--ok)" },
  { value: "achat", label: "📦 Achat", color: "var(--accent)" },
  { value: "vente", label: "🏷️ Vente", color: "var(--warn)" },
] as const;

type KindVal = "activite" | "achat" | "vente";

const KIND_PILL: Record<KindVal, string> = {
  activite: "ok",
  achat: "info",
  vente: "warn",
};

type QuickRow = {
  label: string;
  amount: string;
  category: string;
  kind: KindVal;
  date: string;
};

const blankQuick = (): QuickRow => ({
  label: "",
  amount: "",
  category: EXPENSE_CATEGORIES[0],
  kind: "activite",
  date: today(),
});

export default function Charges() {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("charges");
  const [kindFilter, setKindFilter] = useState<KindVal | "all">("all");
  const [catFilter, setCatFilter] = useState("");
  const [editing, setEditing] = useState<{ expense: Expense | null } | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);

  // Quick-add inline row
  const [adding, setAdding] = useState(false);
  const [quick, setQuick] = useState<QuickRow>(blankQuick);



  const remaining = useMemo(() => remainingToAmortize(state.expenses), [state.expenses]);

  // Total sur la plage choisie
  const periodTotal = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const periodCount = useMemo(
    () => state.expenses.filter((e) => e.date >= range.from && e.date <= range.to).length,
    [state.expenses, range],
  );
  // Total annuel, repère fixe à côté de la plage
  const yearRange = useMemo(() => periodRange("year"), []);
  const yearTotal = useMemo(() => chargesInRange(state.expenses, yearRange), [state.expenses, yearRange]);

  // Charges actives (étalées en cours)
  const activeAmortized = useMemo(
    () => state.expenses.filter((e) => {
      if (e.amortizeMonths <= 1) return false;
      const months = expenseMonths(e);
      return months[months.length - 1] >= thisMonth();
    }),
    [state.expenses],
  );

  // Filtered list
  const filtered = useMemo(() => {
    return state.expenses
      .filter((e) => e.date >= range.from && e.date <= range.to)
      .filter((e) => kindFilter === "all" || expenseKind(e) === kindFilter)
      .filter((e) => !catFilter || (e.category || "Autre") === catFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.expenses, kindFilter, catFilter, range]);

  const pCategories = useMemo(() => {
    const map = new Map<string, number>();
    state.expenses.forEach((e) => {
      const c = e.category || "Autre";
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [state.expenses]);

  const submitQuick = () => {
    if (!quick.label.trim()) { toast("Donnez un nom à la charge"); return; }
    if (num(quick.amount) <= 0) { toast("Indiquez un montant valide"); return; }
    const expense: Expense = {
      id: uid(),
      label: quick.label.trim(),
      category: quick.category,
      kind: quick.kind,
      amount: num(quick.amount),
      date: quick.date,
      amortizeMonths: 1,
      notes: "",
      createdAt: Date.now(),
    };
    dispatch({ type: "addExpense", expense });
    toast("Charge ajoutée");
    setQuick(blankQuick());
    setAdding(false);
  };

  return (
    <>
      <HeaderActions>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
        <button className="btn primary" onClick={() => setEditing({ expense: null })}>
          + Nouvelle charge
        </button>
      </HeaderActions>

      {/* ── KPIs ── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi
          label="Sur la période"
          value={eur(periodTotal)}
          meta={`${periodCount} charge(s) · ${range.label}`}
          tone={periodTotal > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Cette année"
          value={eur(yearTotal)}
          meta={`${state.expenses.length} charge(s) enregistrée(s)`}
        />
        <Kpi
          label="Reste à amortir"
          value={eur(remaining)}
          meta={
            activeAmortized.length
              ? `${activeAmortized.length} charge(s) en cours d'étalement`
              : "Aucune charge étalée active"
          }
          tone={remaining > 0 ? "info" : "ok"}
        />
      </div>

      {/* ── Main table card ── */}
      <div className="card">
        <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
          <h3>
            Toutes les charges
            {filtered.length !== state.expenses.length && (
              <span className="hint" style={{ fontWeight: 400, marginLeft: 8 }}>
                — {filtered.length} / {state.expenses.length} affichées
              </span>
            )}
          </h3>
          <div className="spacer" />

          {/* Kind filter */}
          <div className="seg" role="group" style={{ fontSize: 12 }}>
            <button type="button" className={kindFilter === "all" ? "on" : ""} onClick={() => setKindFilter("all")}>
              Tout
            </button>
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={kindFilter === k.value ? "on" : ""}
                onClick={() => setKindFilter(kindFilter === k.value ? "all" : k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            value={catFilter}
            style={{ width: "auto", minWidth: 140, fontSize: 12 }}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">Toutes catégories</option>
            {pCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {(kindFilter !== "all" || catFilter) && (
            <button
              className="btn ghost sm"
              onClick={() => { setKindFilter("all"); setCatFilter(""); }}
            >
              Réinitialiser ✕
            </button>
          )}

          <button
            className="btn sm ok"
            onClick={() => { setAdding(true); setQuick(blankQuick()); }}
          >
            ⚡ Saisie rapide
          </button>
        </div>

        {filtered.length === 0 && !adding ? (
          <Empty glyph="◈" title="Aucune charge trouvée">
            {state.expenses.length === 0
              ? "Enregistrez votre première charge avec le bouton ci-dessus."
              : "Modifiez les filtres pour voir d'autres charges."}
          </Empty>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Intitulé</th>
                  <th>Catégorie</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th className="r">Montant</th>
                  <th className="r">Étalement</th>
                  <th className="r">/ mois</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>
                {/* Quick-add inline row */}
                {adding && (
                  <tr style={{ background: "rgba(99,102,241,0.07)", borderBottom: "2px solid var(--accent)" }}>
                    <td>
                      <input
                        type="text"
                        value={quick.label}
                        placeholder="Intitulé de la charge…"
                        autoFocus
                        style={{ width: "100%", minWidth: 160 }}
                        onChange={(e) => setQuick((q) => ({ ...q, label: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitQuick();
                          if (e.key === "Escape") setAdding(false);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={quick.category}
                        style={{ width: "100%" }}
                        onChange={(e) => setQuick((q) => ({ ...q, category: e.target.value }))}
                      >
                        {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={quick.kind}
                        style={{ width: "100%" }}
                        onChange={(e) => setQuick((q) => ({ ...q, kind: e.target.value as KindVal }))}
                      >
                        {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={quick.date}
                        onChange={(e) => setQuick((q) => ({ ...q, date: e.target.value }))}
                      />
                    </td>
                    <td className="r">
                      <input
                        type="number"
                        step="0.01"
                        value={quick.amount}
                        placeholder="0,00"
                        style={{ width: 90, textAlign: "right" }}
                        onChange={(e) => setQuick((q) => ({ ...q, amount: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitQuick();
                          if (e.key === "Escape") setAdding(false);
                        }}
                      />
                    </td>
                    <td className="r" style={{ color: "var(--ink-3)", fontSize: 12 }}>Ponctuelle</td>
                    <td className="r" />
                    <td className="r shrink">
                      <div className="rowact always" style={{ gap: 4 }}>
                        <button className="btn sm primary" onClick={submitQuick}>✓</button>
                        <button
                          className="btn sm ghost"
                          onClick={() => setEditing({ expense: null })}
                          title="Options avancées"
                        >
                          ⚙
                        </button>
                        <button className="iconbtn del" onClick={() => setAdding(false)}>✕</button>
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.map((e) => {
                  const k = expenseKind(e);
                  const isAmortized = e.amortizeMonths > 1;
                  const share = isAmortized ? expenseMonthlyShare(e) : null;
                  const months = isAmortized ? expenseMonths(e) : null;
                  const active = months ? months[months.length - 1] >= thisMonth() : false;
                  const durationLabel = isAmortized
                    ? (e.amortizeMonths >= 12 && e.amortizeMonths % 12 === 0
                        ? `${e.amortizeMonths / 12} an${e.amortizeMonths > 12 ? "s" : ""}`
                        : `${Math.round(e.amortizeMonths)} mois`)
                    : null;

                  return (
                    <tr key={e.id}>
                      <td>
                        <button
                          className="linkish"
                          style={{ fontWeight: 600, textAlign: "left" }}
                          onClick={() => setEditing({ expense: e })}
                        >
                          {e.label || "Sans nom"}
                        </button>
                        {e.notes && (
                          <div className="hint ellipsis" style={{ fontSize: 11, maxWidth: 260 }}>
                            {e.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="pill neutral pill-btn"
                          style={{ fontSize: 11 }}
                          onClick={() => setCatFilter(catFilter === (e.category || "Autre") ? "" : (e.category || "Autre"))}
                        >
                          {e.category || "Autre"}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${KIND_PILL[k]}`} style={{ fontSize: 11 }}>
                          {KIND_OPTIONS.find((o) => o.value === k)?.label ?? k}
                        </span>
                      </td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dfr(e.date)}</td>
                      <td className="r num" style={{ fontWeight: 700 }}>{eur2(e.amount)}</td>
                      <td className="r" style={{ fontSize: 12 }}>
                        {isAmortized ? (
                          <span className={`pill ${active ? "info" : "neutral"}`} style={{ fontSize: 11 }}>
                            {durationLabel} {active ? "· actif" : "· terminé"}
                          </span>
                        ) : (
                          <span className="hint" style={{ fontSize: 11 }}>Ponctuelle</span>
                        )}
                      </td>
                      <td className="r num" style={{ fontSize: 12 }}>
                        {share ? (
                          <span style={{ color: "var(--accent-glow)", fontWeight: 600 }}>
                            {eur2(share)}
                          </span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td className="r shrink">
                        <div className="rowact">
                          <button
                            className="iconbtn"
                            title="Éditer"
                            onClick={() => setEditing({ expense: e })}
                          >
                            ✎
                          </button>
                          <button
                            className="iconbtn del"
                            title="Supprimer"
                            onClick={() => setConfirming(e)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                    <td colSpan={4} style={{ paddingTop: 10, color: "var(--ink-2)", fontSize: 13 }}>
                      Total ({filtered.length} charge{filtered.length > 1 ? "s" : ""})
                    </td>
                    <td className="r num" style={{ paddingTop: 10, color: "var(--warn)", fontSize: 14 }}>
                      {eur2(filtered.reduce((a, e) => a + e.amount, 0))}
                    </td>
                    <td colSpan={2} className="r num" style={{ paddingTop: 10, fontSize: 12, color: "var(--ink-2)" }}>
                      {activeAmortized.length > 0 && (
                        <span title="Coût mensuel des charges étalées actives">
                          {eur2(activeAmortized.reduce((a, e) => a + expenseMonthlyShare(e), 0))} / mois (étalées)
                        </span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExpenseModal
          expense={editing.expense}
          onClose={() => setEditing(null)}
          onDelete={(e) => {
            dispatch({ type: "removeExpense", id: e.id });
            toast("Charge supprimée");
          }}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer cette charge ?"
          body={<>« {confirming.label || "Sans nom"} » sera définitivement retirée.</>}
          onConfirm={() => {
            dispatch({ type: "removeExpense", id: confirming.id });
            toast("Charge supprimée");
            setConfirming(null);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
