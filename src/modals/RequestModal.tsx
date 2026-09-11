import { useMemo, useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { ARTICLE_TYPES, REQUEST_LABEL, REQUEST_ORDER } from "../lib/constants";
import { eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import { LABEL } from "../lib/lexicon";
import type { ProductRequest, RequestLine, RequestStatus } from "../types";

const newLine = (): RequestLine => ({
  key: uid(), name: "", brand: "", type: "", size: "", quantity: 1, targetPrice: 0,
});

export const blankRequest = (): ProductRequest => ({
  id: uid(),
  supplier: "",
  date: today(),
  status: "brouillon",
  lines: [newLine()],
  notes: "",
  orderId: "",
  createdAt: Date.now(),
});

/**
 * Demande produit : ce qu'on cherche chez un fournisseur, avant de commander.
 * Une fois acceptée, elle se transforme en commande et ses articles entrent
 * en arrivage.
 */
export default function RequestModal({
  request, onClose,
}: {
  request: ProductRequest | null;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const isNew = request === null;
  const [d, setD] = useState<ProductRequest>(request ?? blankRequest());
  const set = <K extends keyof ProductRequest>(k: K, v: ProductRequest[K]) => setD((x) => ({ ...x, [k]: v }));
  const patchLine = (key: string, p: Partial<RequestLine>) =>
    setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));

  const suggestions = useMemo(() => {
    const uniq = (k: "brand" | "type" | "size" | "source") =>
      [...new Set(state.items.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    return {
      supplier: [...new Set([...state.suppliers.map((s) => s.name), ...uniq("source")])],
      brand: uniq("brand"),
      type: [...new Set([...ARTICLE_TYPES, ...uniq("type")])],
      size: uniq("size"),
    };
  }, [state.items, state.suppliers]);

  const filled = d.lines.filter((l) => l.name.trim() || num(l.targetPrice) > 0);
  const pieces = filled.reduce((a, l) => a + Math.max(1, l.quantity), 0);
  const budget = filled.reduce((a, l) => a + num(l.targetPrice) * Math.max(1, l.quantity), 0);

  const submit = () => {
    if (!d.supplier.trim()) {
      toast("Indiquez à quel fournisseur s'adresse la demande");
      return;
    }
    if (filled.length === 0) {
      toast("Ajoutez au moins un article à la demande");
      return;
    }
    dispatch({ type: "upsertRequest", request: { ...d, supplier: d.supplier.trim(), lines: filled } });
    toast(isNew ? "Demande enregistrée" : "Demande mise à jour");
    onClose();
  };

  return (
    <Modal
      title={isNew ? "Nouvelle demande produit" : `Demande — ${d.supplier || "sans fournisseur"}`}
      wide
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
      <div className="note info">
        <span className="glyph">≡</span>
        <div>
          Une demande décrit ce que vous cherchez et à quel prix. Quand le fournisseur l'accepte, convertissez-la
          en commande : ses articles entreront en arrivage puis en stock.
        </div>
      </div>

      <div className="fgrid">
        <Field label="Fournisseur">
          <input
            type="text"
            list="dl-req-supplier"
            value={d.supplier}
            placeholder="Grossiste, friperie, dépôt…"
            onChange={(e) => set("supplier", e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Date de la demande">
          <input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Statut">
          <select value={d.status} onChange={(e) => set("status", e.target.value as RequestStatus)}>
            {REQUEST_ORDER.map((s) => (
              <option key={s} value={s}>{REQUEST_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      </div>
      <datalist id="dl-req-supplier">{suggestions.supplier.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-req-brand">{suggestions.brand.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-req-type">{suggestions.type.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-req-size">{suggestions.size.map((v) => <option key={v} value={v} />)}</datalist>

      <hr className="sep" />
      <div className="field"><span>Articles demandés</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {d.lines.map((l) => (
          <div className="calc-line" key={l.key}>
            <div className="calc-line-h">
              <input
                type="text"
                value={l.name}
                placeholder="Ce que vous cherchez"
                onChange={(e) => patchLine(l.key, { name: e.target.value })}
              />
              {d.lines.length > 1 && (
                <button
                  className="iconbtn del"
                  title="Retirer"
                  onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="calc-line-grid">
              <label><span>Marque</span><input type="text" list="dl-req-brand" value={l.brand} onChange={(e) => patchLine(l.key, { brand: e.target.value })} /></label>
              <label><span>Type</span><input type="text" list="dl-req-type" value={l.type} onChange={(e) => patchLine(l.key, { type: e.target.value })} /></label>
              <label><span>Taille</span><input type="text" list="dl-req-size" value={l.size} onChange={(e) => patchLine(l.key, { size: e.target.value })} /></label>
              <label><span>Quantité</span><input type="number" step="1" min="1" value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: Math.max(1, Math.round(num(e.target.value)) || 1) })} /></label>
              <label><span>{LABEL.cost} visé</span><input type="number" step="0.01" value={l.targetPrice || ""} placeholder="0,00" onChange={(e) => patchLine(l.key, { targetPrice: num(e.target.value) })} /></label>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn ghost sm"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setD((x) => ({ ...x, lines: [...x.lines, newLine()] }))}
      >
        + Ajouter un article
      </button>

      <Field label="Message au fournisseur">
        <textarea
          rows={3}
          value={d.notes}
          placeholder="Ce que vous recherchez, contraintes d'état, délai souhaité…"
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>

      <div>
        <div className="totrow"><span>{pieces} article{pieces > 1 ? "s" : ""} demandé{pieces > 1 ? "s" : ""}</span><b className="num">{filled.length} ligne{filled.length > 1 ? "s" : ""}</b></div>
        <div className="totrow big"><span>Budget visé</span><b className="num">{eur2(budget)}</b></div>
      </div>
    </Modal>
  );
}
