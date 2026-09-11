import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Field, Kpi, Modal, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import {
  chargesByCategory, chargesInRange, chargesMonthlySeries, expenseMonthlyShare,
  expenseMonths, monthsElapsed, periodRange, remainingToAmortize,
} from "../lib/calc";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { dfr, eur, eur2, num, pct, today } from "../lib/format";
import { uid } from "../lib/id";
import type { Expense, Period } from "../types";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** « 2028-08 » → « août 2028 ». */
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

export default function Charges() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [period, setPeriod] = usePref<Period>("chargePeriod", "month");
  const [category, setCategory] = useQueryState("cat");
  const [editing, setEditing] = useState<{ expense: Expense | null } | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const periodTotal = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const byCategory = useMemo(() => chargesByCategory(state.expenses, range), [state.expenses, range]);
  const series = useMemo(() => chargesMonthlySeries(state.expenses), [state.expenses]);
  const remaining = useMemo(() => remainingToAmortize(state.expenses), [state.expenses]);

  const elapsed = monthsElapsed(range);
  const monthlyAverage = periodTotal / elapsed;
  const top = byCategory[0];
  const recurring = state.expenses.filter((e) => e.amortizeMonths > 1).length;

  const list = useMemo(
    () =>
      [...state.expenses]
        .filter((e) => !category || (e.category || "Autre") === category)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.expenses, category],
  );

  const maxMonth = Math.max(...series.map((s) => s.total), 0);

  return (
    <>
      <HeaderActions>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois" },
            { value: "quarter", label: "Trimestre" },
            { value: "year", label: "Année" },
            { value: "all", label: "Tout" },
          ]}
        />
        <button className="btn primary" onClick={() => setEditing({ expense: null })}>+ Nouvelle charge</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label={`Charges — ${range.label}`}
          value={eur(periodTotal)}
          meta={`Réparties sur ${elapsed} mois écoulé${elapsed > 1 ? "s" : ""}`}
          tone="warn"
        />
        <Kpi
          label="Moyenne par mois"
          value={eur(monthlyAverage)}
          meta="Ce que l'activité coûte chaque mois, hors articles"
        />
        <Kpi
          label="Poste principal"
          value={top ? top.key : "—"}
          meta={top ? `${eur(top.total)} · ${pct((top.total / periodTotal) * 100)} des charges` : "Aucune charge sur la période"}
          tone="info"
        />
        <Kpi
          label="Reste à étaler"
          value={eur(remaining)}
          meta={recurring ? `${recurring} charge${recurring > 1 ? "s" : ""} étalée${recurring > 1 ? "s" : ""} sur plusieurs mois` : "Aucune charge étalée"}
          tone={remaining > 0 ? "info" : "ok"}
        />
      </div>

      <div className="cols two">
        <div className="card">
          <div className="card-h">
            <h3>Par catégorie</h3>
            <div className="spacer" />
            {category ? (
              <button className="btn ghost sm" onClick={() => setCategory("")}>Filtre : {category} ✕</button>
            ) : (
              <span className="hint">{range.label}</span>
            )}
          </div>
          {byCategory.length === 0 ? (
            <Empty glyph="◈" title="Aucune charge sur la période">
              Changez de période ou ajoutez une charge.
            </Empty>
          ) : (
            <div className="card-b">
              <div className="bars">
                {byCategory.map((c) => (
                  <div className="bar-row" key={c.key}>
                    <button
                      className="bl linkish"
                      title={`Filtrer sur ${c.key}`}
                      onClick={() => setCategory(category === c.key ? "" : c.key)}
                    >
                      {c.key}
                    </button>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${Math.max(2, (c.total / byCategory[0].total) * 100)}%` }}
                      />
                    </div>
                    <div className="bv">
                      {eur(c.total)}
                      <span style={{ color: "var(--ink-3)" }}> · {pct((c.total / periodTotal) * 100)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>12 derniers mois</h3>
            <div className="spacer" />
            <span className="hint">Charge imputée chaque mois</span>
          </div>
          {maxMonth === 0 ? (
            <Empty glyph="▁▃▅" title="Rien à afficher">
              Les charges enregistrées se répartiront ici mois par mois.
            </Empty>
          ) : (
            <div className="card-b">
              <div className="month-bars">
                {series.map((s) => (
                  <div className="month-bar" key={s.key} title={`${s.label} — ${eur2(s.total)}`}>
                    <div className="mb-track">
                      <div className="mb-fill" style={{ height: `${Math.max(2, (s.total / maxMonth) * 100)}%` }} />
                    </div>
                    <div className="mb-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>Charges de l'activité</h3>
          <div className="spacer" />
          <span className="hint">
            {list.length} charge{list.length > 1 ? "s" : ""}
            {category ? ` · ${category}` : ""}
          </span>
        </div>
        {list.length === 0 ? (
          <Empty glyph="◈" title="Aucune charge enregistrée">
            Ajoutez vos achats pour l'activité (balance, housses, étiquettes, abonnement Vinted Pro…).
            Indiquez combien ça a coûté et combien de temps vous allez vous en servir : la dépense se
            répartit sur cette durée et pèse sur la marge au bon rythme.
          </Empty>
        ) : (
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Catégorie</th>
                  <th className="r">Montant</th>
                  <th>Depuis</th>
                  <th>Utilisation</th>
                  <th className="r">Coût / mois</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const months = expenseMonths(e);
                  const share = expenseMonthlyShare(e);
                  const active = months[months.length - 1] >= thisMonth();
                  return (
                    <tr key={e.id}>
                      <td>
                        <button className="linkish" onClick={() => setEditing({ expense: e })}>{e.label || "Sans nom"}</button>
                        {e.notes && <div className="hint ellipsis">{e.notes}</div>}
                      </td>
                      <td>
                        <button className="pill neutral pill-btn" onClick={() => setCategory(e.category || "Autre")}>
                          {e.category || "Autre"}
                        </button>
                      </td>
                      <td className="r num">{eur2(e.amount)}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dfr(e.date)}</td>
                      <td>
                        {e.amortizeMonths > 1 ? (
                          <span className={`pill ${active ? "info" : "neutral"}`}>
                            {e.amortizeMonths >= 12 && e.amortizeMonths % 12 === 0
                              ? `${e.amortizeMonths / 12} an${e.amortizeMonths > 12 ? "s" : ""}`
                              : `${e.amortizeMonths} mois`}{" "}
                            {active ? `· jusqu'à ${monthName(months[months.length - 1])}` : "· terminé"}
                          </span>
                        ) : (
                          <span className="pill neutral">Une seule fois</span>
                        )}
                      </td>
                      <td className="r num">{eur2(share)}</td>
                      <td className="r shrink">
                        <div className="rowact">
                          <button className="iconbtn" title="Éditer" onClick={() => setEditing({ expense: e })}>✎</button>
                          <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(e)}>✕</button>
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

      {editing && (
        <ExpenseModal
          expense={editing.expense}
          onClose={() => setEditing(null)}
          onDelete={(e) => { dispatch({ type: "removeExpense", id: e.id }); toast("Charge supprimée"); }}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer cette charge ?"
          body={<>« {confirming.label || "Sans nom"} » sera définitivement retirée.</>}
          onConfirm={() => { dispatch({ type: "removeExpense", id: confirming.id }); toast("Charge supprimée"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}

function ExpenseModal({
  expense, onClose, onDelete,
}: {
  expense: Expense | null;
  onClose: () => void;
  onDelete: (e: Expense) => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const isNew = !expense;
  const [label, setLabel] = useState(expense?.label ?? "");
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(expense?.amount ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date ?? today());
  const initialMonths = expense?.amortizeMonths ?? 1;
  // On saisit en années dès que la durée tombe juste : « 3 ans » parle plus que « 36 mois ».
  const [unit, setUnit] = useState<"mois" | "ans">(initialMonths >= 12 && initialMonths % 12 === 0 ? "ans" : "mois");
  const [duration, setDuration] = useState(String(unit === "ans" ? initialMonths / 12 : initialMonths));
  const [notes, setNotes] = useState(expense?.notes ?? "");

  const months = Math.max(1, Math.round(num(duration) * (unit === "ans" ? 12 : 1)) || 1);
  const share = num(amount) / months;
  const perYear = share * 12;

  const submit = () => {
    if (!label.trim()) { toast("Donnez un nom à la charge"); return; }
    if (num(amount) <= 0) { toast("Indiquez un montant"); return; }
    const next: Expense = {
      id: expense?.id ?? uid(),
      label: label.trim(),
      category,
      amount: num(amount),
      date,
      amortizeMonths: months,
      notes: notes.trim(),
      createdAt: expense?.createdAt ?? Date.now(),
    };
    if (isNew) dispatch({ type: "addExpense", expense: next });
    else dispatch({ type: "patchExpense", id: next.id, patch: next });
    toast(isNew ? "Charge ajoutée" : "Charge mise à jour");
    onClose();
  };

  return (
    <Modal
      title={isNew ? "Nouvelle charge" : "Éditer la charge"}
      onClose={onClose}
      footer={
        <>
          {!isNew && expense && (
            <>
              <button className="btn danger" onClick={() => { onDelete(expense); onClose(); }}>Supprimer</button>
              <div className="spacer" />
            </>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>{isNew ? "Ajouter" : "Enregistrer"}</button>
        </>
      }
    >
      <div className="fgrid">
        <Field label="Intitulé" span>
          <input type="text" value={label} placeholder="Ex. Housses à vêtements x50" onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>
        <Field label="Catégorie">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Montant (€)">
          <input type="number" step="0.01" value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date d'achat">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Durée d'utilisation">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              step="1"
              min="1"
              value={duration}
              style={{ flex: 1 }}
              onChange={(e) => setDuration(e.target.value)}
            />
            <select value={unit} style={{ width: "auto" }} onChange={(e) => setUnit(e.target.value as "mois" | "ans")}>
              <option value="mois">mois</option>
              <option value="ans">ans</option>
            </select>
          </div>
        </Field>
      </div>

      <div className="duration-presets">
        <span className="hint">Combien de temps allez-vous l'utiliser ?</span>
        {([
          ["Une seule fois", 1, "mois"],
          ["6 mois", 6, "mois"],
          ["1 an", 1, "ans"],
          ["2 ans", 2, "ans"],
          ["3 ans", 3, "ans"],
        ] as [string, number, "mois" | "ans"][]).map(([label, v, u]) => (
          <button
            key={label}
            type="button"
            className={`btn sm${months === v * (u === "ans" ? 12 : 1) ? " primary" : ""}`}
            onClick={() => { setUnit(u); setDuration(String(v)); }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="note info">
        <span className="glyph">◈</span>
        <div>
          {months > 1 ? (
            <>
              <b className="num">{eur2(num(amount))}</b> sur {months} mois d'utilisation, soit{" "}
              <b className="num">{eur2(share)}</b> par mois
              {months > 12 && <> (<span className="num">{eur2(perYear)}</span> par an)</>}.
              <br />
              Seuls les mois écoulés pèsent sur la marge : la charge se répartit au fil du temps.
            </>
          ) : (
            <>
              <b className="num">{eur2(num(amount))}</b> comptés en une fois, sur le mois de l'achat.
            </>
          )}
        </div>
      </div>
      <Field label="Notes">
        <textarea rows={2} value={notes} placeholder="Fournisseur, référence…" onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
