import { useState } from "react";
import { Field, Modal, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { costOf, revenueOf } from "../lib/calc";
import { addDays, num, today } from "../lib/format";
import { uid } from "../lib/id";
import type { Item, ReturnCase, ReturnKind, ReturnResolution, ReturnStatus } from "../types";

export const KIND_LABEL: Record<ReturnKind, string> = {
  client: "Retour client",
  fournisseur: "Retour fournisseur",
};

export const STATUS_LABEL: Record<ReturnStatus, string> = {
  ouvert: "Ouvert",
  expedie: "Expédié",
  recu: "Reçu",
  rembourse: "Remboursé",
  clos: "Clos",
};

export const RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  remis_stock: "Remis en stock",
  perte: "Perte",
  avoir: "Avoir / remboursement",
  garde: "Gardé",
};

type ReturnItemCondition = NonNullable<ReturnCase["itemCondition"]>;

export const CONDITION_LABEL: Record<ReturnItemCondition, { label: string; hint: string }> = {
  scelle: { label: "Scellé", hint: "Non ouvert" },
  ouvert: { label: "Ouvert", hint: "Emballage ouvert" },
  utilise: { label: "Utilisé", hint: "Porté ou essayé" },
  endommage: { label: "Endommagé", hint: "Défaut constaté" },
  incomplet: { label: "Incomplet", hint: "Pièce manquante" },
};

const RETURN_REASONS = [
  "Taille / coupe",
  "Changement d’avis",
  "Article non conforme",
  "Défaut",
  "Article ouvert",
  "Article endommagé",
  "Article incomplet",
  "Colis perdu",
  "Autre",
];

export const emptyReturn = (kind: ReturnKind, item?: Item): ReturnCase => ({
  id: uid(),
  kind,
  status: "ouvert",
  itemId: item?.id,
  itemName: item ? [item.brand, item.name, item.size].filter(Boolean).join(" · ") : "",
  counterparty: kind === "client" ? item?.buyer ?? "" : item?.source ?? "",
  platform: kind === "client" ? item?.platform ?? "" : item?.source ?? "",
  amount: kind === "client" && item ? revenueOf(item) : item ? costOf(item) : 0,
  feesLost: kind === "client" && item ? num(item.saleFees) + num(item.shippingCost) : num(item?.fees),
  openedDate: today(),
  dueDate: addDays(today(), 14),
  closedDate: "",
  carrier: item?.carrier ?? "",
  tracking: item?.tracking ?? "",
  reason: "",
  itemCondition: "scelle",
  resolution: kind === "client" ? "remis_stock" : "avoir",
  notes: "",
  createdAt: Date.now(),
});

export default function ReturnModal({
  initial,
  candidates,
  isEditing,
  onClose,
}: {
  initial: ReturnCase;
  candidates: Item[];
  isEditing: boolean;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<ReturnCase>({ ...initial, itemCondition: initial.itemCondition ?? "scelle" });
  const patch = <K extends keyof ReturnCase>(k: K, v: ReturnCase[K]) => setDraft((r) => ({ ...r, [k]: v }));
  const selectedItem = candidates.find((i) => i.id === draft.itemId);

  const pickItem = (itemId: string) => {
    const item = candidates.find((i) => i.id === itemId);
    if (!item) {
      patch("itemId", "");
      return;
    }
    setDraft((r) => ({
      ...r,
      itemId: item.id,
      itemName: [item.brand, item.name, item.size].filter(Boolean).join(" · "),
      counterparty: r.kind === "client" ? item.buyer : item.source,
      platform: r.kind === "client" ? item.platform : item.source,
      amount: r.kind === "client" ? revenueOf(item) : costOf(item),
      feesLost: r.kind === "client" ? num(item.saleFees) + num(item.shippingCost) : num(item.fees),
      carrier: item.carrier,
      tracking: item.tracking,
    }));
  };

  const save = () => {
    if (!draft.itemName.trim()) {
      toast("Ajoutez au moins un article ou un libellé");
      return;
    }
    dispatch({ type: "upsertReturn", returnCase: { ...draft, amount: num(draft.amount), feesLost: num(draft.feesLost) } });
    toast("Dossier retour enregistré");
    onClose();
  };

  return (
    <Modal
      title={isEditing ? `Retour — ${draft.itemName || "article"}` : "Nouveau retour"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save}>{isEditing ? "Mettre à jour" : "Ouvrir le dossier"}</button>
        </>
      }
    >
      <div className="return-modal-flow">
        <div className="return-modal-topline">
          <Segmented<ReturnKind>
            value={draft.kind}
            onChange={(kind) => setDraft(emptyReturn(kind))}
            options={[
              { value: "client", label: "↩ Retour client" },
              { value: "fournisseur", label: "↗ Retour fournisseur" },
            ]}
          />
          <span className={`pill ${draft.status === "clos" ? "stock" : "warn"}`}>
            {STATUS_LABEL[draft.status]}
          </span>
        </div>

        <section className="return-section">
          <div className="return-section-title">1. Article concerné</div>
          <Field label="Choisir dans l’inventaire">
            <select value={draft.itemId ?? ""} onChange={(e) => pickItem(e.target.value)}>
              <option value="">Saisie libre</option>
              {candidates.map((i) => (
                <option key={i.id} value={i.id}>
                  {[i.brand, i.name, i.size].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </Field>
          {selectedItem ? (
            <div className="return-item-preview">
              <div>
                <strong>{selectedItem.name || "Sans nom"}</strong>
                <span>{[selectedItem.brand, selectedItem.type, selectedItem.size].filter(Boolean).join(" · ")}</span>
              </div>
              <div>
                <span>{draft.kind === "client" ? "Acheteur" : "Fournisseur"}</span>
                <strong>{draft.counterparty || "Non renseigné"}</strong>
              </div>
              <div>
                <span>{draft.kind === "client" ? "Canal" : "Source"}</span>
                <strong>{draft.platform || "Non renseigné"}</strong>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <Field label="Article" span>
                <input value={draft.itemName} onChange={(e) => patch("itemName", e.target.value)} placeholder="Nom précis de l’article" />
              </Field>
              <Field label={draft.kind === "client" ? "Nom du client" : "Fournisseur"}>
                <input value={draft.counterparty} onChange={(e) => patch("counterparty", e.target.value)} />
              </Field>
              <Field label={draft.kind === "client" ? "Plateforme" : "Source"}>
                <input value={draft.platform} onChange={(e) => patch("platform", e.target.value)} />
              </Field>
            </div>
          )}
        </section>

        <section className="return-section">
          <div className="return-section-title">2. État au retour</div>
          <div className="return-condition-grid">
            {Object.entries(CONDITION_LABEL).map(([value, copy]) => (
              <button
                type="button"
                key={value}
                className={draft.itemCondition === value ? "active" : ""}
                onClick={() => patch("itemCondition", value as ReturnItemCondition)}
              >
                <strong>{copy.label}</strong>
                <span>{copy.hint}</span>
              </button>
            ))}
          </div>
          <div className="form-grid">
            <Field label="Motif précis">
              <select value={draft.reason} onChange={(e) => patch("reason", e.target.value)}>
                <option value="">Choisir un motif</option>
                {RETURN_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </Field>
            <Field label="Décision prévue">
              <select value={draft.resolution} onChange={(e) => patch("resolution", e.target.value as ReturnResolution)}>
                {Object.entries(RESOLUTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Détails / preuves" span>
              <textarea rows={3} value={draft.notes} onChange={(e) => patch("notes", e.target.value)} placeholder="Décrivez l’état, les éléments manquants ou les preuves disponibles…" />
            </Field>
          </div>
        </section>

        <section className="return-section">
          <div className="return-section-title">3. Impact financier</div>
          <div className="form-grid">
            <Field label="Montant remboursé">
              <input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => patch("amount", num(e.target.value))} />
            </Field>
            <Field label="Frais perdus">
              <input type="number" min="0" step="0.01" value={draft.feesLost} onChange={(e) => patch("feesLost", num(e.target.value))} />
            </Field>
          </div>
        </section>

        <details className="return-details" open={isEditing}>
          <summary>Suivi du dossier, dates et transport</summary>
          <div className="form-grid">
            <Field label="Statut">
              <select value={draft.status} onChange={(e) => patch("status", e.target.value as ReturnStatus)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Ouvert le">
              <input type="date" value={draft.openedDate} onChange={(e) => patch("openedDate", e.target.value)} />
            </Field>
            <Field label="Échéance">
              <input type="date" value={draft.dueDate} onChange={(e) => patch("dueDate", e.target.value)} />
            </Field>
            <Field label="Date de clôture">
              <input type="date" value={draft.closedDate} onChange={(e) => patch("closedDate", e.target.value)} />
            </Field>
            <Field label="Transporteur">
              <input value={draft.carrier} onChange={(e) => patch("carrier", e.target.value)} />
            </Field>
            <Field label="Lien de suivi">
              <input value={draft.tracking} onChange={(e) => patch("tracking", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </details>
      </div>
    </Modal>
  );
}
