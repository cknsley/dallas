import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Field, Kpi, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import { chargesInRange, expenseMonthlyShare, expenseMonths } from "../lib/calc";
import { dfr, eur, eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import type { Expense } from "../types";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** « 2028-08 » → « août 2028 ». */
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

export default function Charges() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState<{ expense: Expense | null } | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);

  const list = useMemo(
    () => [...state.expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [state.expenses],
  );

  const monthShare = state.expenses.reduce((a, e) => {
    const months = expenseMonths(e);
    return a + (months.includes(thisMonth()) ? expenseMonthlyShare(e) : 0);
  }, 0);
  const yearRange = { from: `${new Date().getFullYear()}-01-01`, to: "9999-12-31", label: "" };
  const yearTotal = chargesInRange(state.expenses, yearRange);
  const totalCommitted = state.expenses.reduce((a, e) => a + num(e.amount), 0);
  const ongoing = state.expenses.filter((e) => {
    const months = expenseMonths(e);
    return months[months.length - 1] >= thisMonth();
  }).length;

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setEditing({ expense: null })}>+ Nouvelle charge</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi label="Ce mois-ci" value={eur(monthShare)} meta="Part des charges amorties sur le mois en cours" tone="warn" />
        <Kpi label="Cette année" value={eur(yearTotal)} meta="Charges imputées depuis janvier" />
        <Kpi label="Engagé au total" value={eur(totalCommitted)} meta={`${state.expenses.length} charge${state.expenses.length > 1 ? "s" : ""} enregistrée${state.expenses.length > 1 ? "s" : ""}`} />
        <Kpi label="Encore en service" value={String(ongoing)} meta="Charges qui pèsent encore sur la marge" tone="info" />
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Charges de l'activité</h3>
          <div className="spacer" />
          <span className="hint">Matériel, emballages, abonnements — distincts du coût d'une pièce</span>
        </div>
        {list.length === 0 ? (
          <Empty glyph="◈" title="Aucune charge enregistrée">
            Ajoutez vos achats pour l'activité (balance, housses, étiquettes, abonnement Vinted Pro…).
            Indiquez combien ça a coûté et combien de temps vous allez vous en servir : la dépense se
            répartit sur cette durée et pèse sur la marge au bon rythme.
          </Empty>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Catégorie</th>
                  <th className="r">Montant</th>
                  <th>Depuis</th>
                  <th>Utilisation</th>
                  <th className="r">Coût / mois</th>
                  <th></th>
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
                      <td><span className="pill neutral">{e.category || "Autre"}</span></td>
                      <td className="r num">{eur2(e.amount)}</td>
                      <td className="num" style={{ fontSize: 12 }}>{dfr(e.date)}</td>
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
                      <td className="r">
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
