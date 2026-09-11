import { useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { blankSupplierRecord } from "../lib/suppliers";
import { num } from "../lib/format";
import { uid } from "../lib/id";
import type { SupplierRecord } from "../types";

/** Fiche contact d'un fournisseur : ce que le stock ne peut pas déduire. */
export default function SupplierModal({
  name, record, onClose,
}: {
  name: string;
  record: SupplierRecord | null;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [d, setD] = useState<SupplierRecord>(record ?? blankSupplierRecord(name, uid()));
  const set = <K extends keyof SupplierRecord>(k: K, v: SupplierRecord[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!d.name.trim()) {
      toast("Le nom du fournisseur est obligatoire");
      return;
    }
    dispatch({ type: "upsertSupplier", supplier: { ...d, name: d.name.trim() } });
    toast("Fiche fournisseur enregistrée");
    onClose();
  };

  return (
    <Modal
      title={record ? `Fiche — ${record.name}` : `Nouvelle fiche — ${name}`}
      onClose={onClose}
      footer={
        <>
          {record && (
            <>
              <button
                className="btn danger"
                onClick={() => { dispatch({ type: "removeSupplier", id: record.id }); toast("Fiche supprimée"); onClose(); }}
              >
                Supprimer la fiche
              </button>
              <div className="spacer" />
            </>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>Enregistrer</button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">⌂</span>
        <div>
          La fiche se rattache au nom saisi dans le champ « Source » des articles. Gardez le même nom pour que
          l'historique d'achat lui reste associé.
        </div>
      </div>

      <div className="fgrid">
        <Field label="Nom du fournisseur" span>
          <input type="text" value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Contact">
          <input type="text" value={d.contact} placeholder="Personne à joindre" onChange={(e) => set("contact", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Téléphone">
          <input type="text" value={d.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Site ou profil">
          <input type="url" value={d.url} placeholder="https://…" onChange={(e) => set("url", e.target.value)} />
        </Field>
        <Field label="Délai de paiement (jours)">
          <input type="number" step="1" min="0" value={d.terms} onChange={(e) => set("terms", num(e.target.value))} />
        </Field>
        <Field label="Adresse" span>
          <textarea rows={2} value={d.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </div>

      <Field label="Appréciation">
        <div className="rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`star${d.rating >= n ? " on" : ""}`}
              aria-label={`${n} sur 5`}
              onClick={() => set("rating", d.rating === n ? 0 : n)}
            >
              ★
            </button>
          ))}
          {d.rating > 0 && <span className="hint">{d.rating} / 5</span>}
        </div>
      </Field>

      <Field label="Notes">
        <textarea rows={3} value={d.notes} placeholder="Conditions négociées, qualité, remarques…" onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}
