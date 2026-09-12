import { useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { PLATFORMS } from "../lib/constants";
import { uid } from "../lib/id";
import type { ClientRecord } from "../types";

export const blankClientRecord = (name = ""): ClientRecord => ({
  id: uid(),
  name,
  contact: "",
  email: "",
  phone: "",
  address: "",
  vatNumber: "",
  platform: "Vinted",
  profileUrl: "",
  notes: "",
  createdAt: Date.now(),
});

/** Formulaire pour créer ou éditer une fiche client dans la base de données. */
export default function ClientModal({
  record,
  defaultName = "",
  onClose,
}: {
  record?: ClientRecord | null;
  defaultName?: string;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();

  const [d, setD] = useState<ClientRecord>(record ?? blankClientRecord(defaultName));
  const set = <K extends keyof ClientRecord>(k: K, v: ClientRecord[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!d.name.trim()) {
      toast("Le nom ou pseudo du client est obligatoire");
      return;
    }
    dispatch({ type: "upsertClient", client: { ...d, name: d.name.trim() } });
    toast(record ? "Fiche client mise à jour" : "Nouveau client enregistré");
    onClose();
  };

  return (
    <Modal
      title={record ? `Fiche Client — ${record.name}` : "Créer une fiche client"}
      onClose={onClose}
      footer={
        <>
          {record && (
            <>
              <button
                className="btn danger"
                onClick={() => {
                  dispatch({ type: "removeClient", id: record.id });
                  toast("Fiche client supprimée");
                  onClose();
                }}
              >
                Supprimer le client
              </button>
              <div className="spacer" />
            </>
          )}
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>
            {record ? "Mettre à jour" : "Créer le client"}
          </button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">👤</span>
        <div>
          Les fiches clients permettent de centraliser les coordonnées (email, téléphone, adresse) et l'historique d'achat pour la facturation et les relances.
        </div>
      </div>

      <div className="fgrid">
        <Field label="Nom / Pseudo client *" span>
          <input
            type="text"
            value={d.name}
            placeholder="Ex: Alexandre M., alexandre_vinted, Sophie L."
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Personne contact (si pro)">
          <input
            type="text"
            value={d.contact || ""}
            placeholder="Nom & prénom du contact"
            onChange={(e) => set("contact", e.target.value)}
          />
        </Field>

        <Field label="Canal / Plateforme habituel">
          <select value={d.platform || "Vinted"} onChange={(e) => set("platform", e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>

        <Field label="Adresse E-mail">
          <input
            type="email"
            value={d.email}
            placeholder="client@exemple.com"
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>

        <Field label="Téléphone">
          <input
            type="text"
            value={d.phone}
            placeholder="06 12 34 56 78"
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>

        <Field label="Lien profil / Réseau social" span>
          <input
            type="url"
            value={d.profileUrl || ""}
            placeholder="https://vinted.fr/member/... ou instagram.com/..."
            onChange={(e) => set("profileUrl", e.target.value)}
          />
        </Field>

        <Field label="N° de TVA (si client pro)">
          <input
            type="text"
            value={d.vatNumber || ""}
            placeholder="FR12345678901"
            onChange={(e) => set("vatNumber", e.target.value)}
          />
        </Field>

        <Field label="Adresse de livraison & facturation" span>
          <textarea
            rows={2}
            value={d.address}
            placeholder="12 Rue de la Paix, 75002 Paris..."
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes & Préférences d'achat">
        <textarea
          rows={3}
          value={d.notes}
          placeholder="Tailles recherchées, conditions de livraison, remises accordées..."
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </Modal>
  );
}
