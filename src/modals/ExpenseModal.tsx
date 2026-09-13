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
  
  const initialDays = expense ? Math.min(365, Math.max(1, Math.round(expense.amortizeMonths * 30))) : 1;
  const [days, setDays] = useState<number>(initialDays);
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [unit, setUnit] = useState<"jours" | "mois">("jours");

  const months = unit === "mois"
    ? Math.max(0.033, days)
    : Math.max(0.033, Math.round((days / 30) * 100) / 100);
  const totalDays = unit === "mois" ? days * 30 : days;
  const costPerDay = num(amount) / Math.max(1, totalDays);
  const costPerMonth = unit === "mois" ? num(amount) / Math.max(1, days) : costPerDay * 30;

  const handleDaysChange = (valStr: string) => {
    const parsed = parseInt(valStr) || 1;
    if (unit === "jours" && parsed > 365) {
      setDays(365);
      toast("Durée maximale : 365 jours");
    } else if (unit === "mois" && parsed > 120) {
      setDays(120);
      toast("Durée maximale : 120 mois");
    } else {
      setDays(Math.max(1, parsed));
    }
  };

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
      </div>

      <Field label="Durée d'étalement">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              step="1"
              min="1"
              max={unit === "mois" ? 120 : 365}
              value={days}
              style={{ width: 110 }}
              onChange={(e) => handleDaysChange(e.target.value)}
            />
            {/* Toggle jours / mois */}
            <div className="seg" role="group" style={{ fontSize: 12 }}>
              <button
                type="button"
                className={unit === "jours" ? "on" : ""}
                onClick={() => {
                  if (unit === "mois") {
                    // Convert current value from months to days
                    setDays(Math.min(365, Math.round(days * 30)));
                    setUnit("jours");
                  }
                }}
              >
                Jours
              </button>
              <button
                type="button"
                className={unit === "mois" ? "on" : ""}
                onClick={() => {
                  if (unit === "jours") {
                    // Convert current value from days to months
                    setDays(Math.max(1, Math.round(days / 30)));
                    setUnit("mois");
                  }
                }}
              >
                Mois
              </button>
            </div>
            {days === 1 && unit === "jours" && (
              <span className="hint" style={{ fontSize: 11 }}>= charge ponctuelle</span>
            )}
          </div>
          {/* Presets adaptés à l'unité */}
          <div className="duration-presets" style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {unit === "jours"
              ? [
                  { label: "1 j", value: 1 },
                  { label: "7 j", value: 7 },
                  { label: "30 j", value: 30 },
                  { label: "90 j", value: 90 },
                  { label: "180 j", value: 180 },
                  { label: "365 j", value: 365 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`btn sm${days === preset.value ? " primary" : ""}`}
                    onClick={() => setDays(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))
              : [
                  { label: "1 mois", value: 1 },
                  { label: "3 mois", value: 3 },
                  { label: "6 mois", value: 6 },
                  { label: "12 mois", value: 12 },
                  { label: "24 mois", value: 24 },
                  { label: "36 mois", value: 36 },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`btn sm${days === preset.value ? " primary" : ""}`}
                    onClick={() => setDays(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
          </div>
        </div>
      </Field>

      <div className="note info">
        <span className="glyph">◈</span>
        <div>
          {(unit === "jours" ? days : days * 30) > 1 ? (
            <>
              <b className="num">{eur2(num(amount))}</b> étalé sur{" "}
              {unit === "mois"
                ? `${days} mois (≈ ${days * 30} jours)`
                : `${days} jour${days > 1 ? "s" : ""}`}
              , soit <b className="num">{eur2(costPerDay)}</b> par jour
              {months >= 1 && <> · <b className="num">{eur2(costPerMonth)}</b> par mois</>}.
              <br />
              Seuls les jours écoulés pèsent sur la rentabilité.
            </>
          ) : (
            <>
              <b className="num">{eur2(num(amount))}</b> comptés sur 1 jour (charge ponctuelle).
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
