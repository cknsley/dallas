import { useState } from "react";
import { Field, Modal, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { num } from "../lib/format";
import { uid } from "../lib/id";
import type { ProductRequest, RequestFor } from "../types";

export const blankRequest = (): ProductRequest => ({
  id: uid(),
  for: "stock",
  client: "",
  name: "",
  budget: 0,
  notes: "",
  status: "en_cours",
  resolvedAs: "",
  createdAt: Date.now(),
});

/**
 * Un pense-bête, pas une négociation : ce qu'un client a demandé, ou ce
 * qu'on cherche pour le stock. Une fois trouvé, l'article part directement
 * en stock ou en vente depuis la carte de la demande.
 */
export default function RequestModal({
  request, onClose,
}: {
  request: ProductRequest | null;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const isNew = request === null;
  const [d, setD] = useState<ProductRequest>(request ?? blankRequest());
  const set = <K extends keyof ProductRequest>(k: K, v: ProductRequest[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const cleanName = d.name.trim();
    const cleanClient = d.client.trim();
    if (!cleanName) {
      toast("Décrivez ce que vous cherchez");
      return;
    }
    dispatch({ type: "upsertRequest", request: { ...d, name: cleanName, client: cleanClient } });

    if (isNew) {
      const taskText = `Rechercher : ${cleanName}${d.budget > 0 ? ` (Budget max: ${d.budget} €)` : ""}`;
      dispatch({
        type: "addTodo",
        todo: {
          id: uid(),
          text: taskText,
          col: "acheter",
          order: 1,
          createdAt: Date.now(),
          clientName: d.for === "client" ? cleanClient : undefined,
        },
      });
      toast("Demande enregistrée & tâche créée dans « À acheter »");
    } else {
      toast("Demande mise à jour");
    }
    onClose();
  };

  return (
    <Modal
      title={isNew ? "Nouvelle demande" : `Demande — ${d.name || "sans nom"}`}
      onClose={onClose}
      footer={
        <>
          {!isNew && request && (
            <>
              <button
                className="btn danger"
                onClick={() => { dispatch({ type: "removeRequest", id: request.id }); toast("Demande supprimée"); onClose(); }}
              >
                Supprimer
              </button>
              <div className="spacer" />
            </>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>
            {isNew ? "Enregistrer la demande" : "Enregistrer"}
          </button>
        </>
      }
    >
      <Field label="Pour">
        <Segmented<RequestFor>
          value={d.for}
          onChange={(v) => set("for", v)}
          options={[
            { value: "stock", label: "Le stock" },
            { value: "client", label: "Un client" },
          ]}
        />
      </Field>
      {d.for === "client" && (
        <Field label="Client">
          <input
            type="text"
            value={d.client}
            placeholder="Pseudo ou nom"
            onChange={(e) => set("client", e.target.value)}
          />
        </Field>
      )}
      <Field label="Ce que vous cherchez">
        <input
          type="text"
          value={d.name}
          placeholder="Ex. Blouson en cuir vintage, taille M"
          onChange={(e) => set("name", e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Budget">
        <input
          type="number"
          step="0.01"
          value={d.budget || ""}
          placeholder="0,00"
          onChange={(e) => set("budget", num(e.target.value))}
        />
      </Field>
      <Field label="Notes">
        <textarea
          rows={3}
          value={d.notes}
          placeholder="État, taille, délai souhaité…"
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </Modal>
  );
}
