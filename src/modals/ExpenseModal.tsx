import { useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import { expenseKind } from "../lib/calc";
import { eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import type { Expense } from "../types";

export default function ExpenseModal({
  expense,
  onClose,
  onDelete,
  defaultKind,
}: {
  expense: Expense | null;
  onClose: () => void;
  onDelete?: (e: Expense) => void;
  defaultKind?: "achat" | "vente" | "activite";
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const isNew = !expense;
  const [label, setLabel] = useState(expense?.label ?? "");
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATEGORIES[0]);
  const [kind, setKind] = useState<"achat" | "vente" | "activite">(
    expense?.kind ?? defaultKind ?? (expense ? expenseKind(expense) : "activite")
  );
  const [amount, setAmount] = useState(expense?.amount ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date ?? today());
  const initialMonths = expense?.amortizeMonths ?? 1;
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
      kind,
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
          {!isNew && expense && onDelete && (
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
          <input type="text" value={label} placeholder="Ex. Cartons d'emballage, Vinted Pro, Frais de port..." onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>
        <Field label="Catégorie de charge">
          <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="activite">💼 Activité (Abonnements, Structure, Matériel)</option>
            <option value="achat">📦 Achat (Approvisionnement, Reconditionnement)</option>
            <option value="vente">🏷️ Vente (Emballage, Port, Commissions)</option>
          </select>
        </Field>
        <Field label="Poste / Sous-catégorie">
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
        ] as [string, number, "mois" | "ans"][]).map(([lbl, v, u]) => (
          <button
            key={lbl}
            type="button"
            className={`btn sm${months === v * (u === "ans" ? 12 : 1) ? " primary" : ""}`}
            onClick={() => { setUnit(u); setDuration(String(v)); }}
          >
            {lbl}
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
