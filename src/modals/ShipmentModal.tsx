import { useMemo, useState } from "react";
import { Modal, Photo } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { DELIVERY_LABEL } from "../lib/constants";
import { qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur2 } from "../lib/format";

/**
 * Met des ventes dans la file d'envoi. Une vente n'y entre qu'une fois payée,
 * c'est donc ici qu'on bascule les « Non payée » et qu'on rouvre les « Livrée ».
 */
export default function ShipmentModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.items
      .filter((i) => i.status === "vendu" && i.delivery !== "commandee")
      .filter((i) => !needle || [i.name, i.brand, i.buyer, i.platform].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [state.items, query]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = () => {
    if (picked.size === 0) {
      toast("Choisissez au moins une vente à expédier");
      return;
    }
    picked.forEach((id) =>
      dispatch({
        type: "patchItem",
        id,
        patch: { delivery: "commandee", shipping: "en_preparation" },
      }),
    );
    toast(`${picked.size} envoi${picked.size > 1 ? "s" : ""} ajouté${picked.size > 1 ? "s" : ""} à la file`);
    onClose();
  };

  return (
    <Modal
      title="Nouvelle livraison"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>
            Mettre en préparation{picked.size ? ` (${picked.size})` : ""}
          </button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">⇄</span>
        <div>
          Une vente entre dans la file d'envoi quand elle passe en <b>Commandée</b>. Choisissez ici les ventes
          à préparer — y compris celles encore marquées non payées.
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="empty" style={{ padding: 28 }}>
          <div className="glyph">↗</div>
          <h3>Aucune vente à expédier</h3>
          <div>Toutes les ventes enregistrées sont déjà en préparation ou reçues.</div>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            placeholder="Filtrer par pièce, acheteur ou canal…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker">
            {candidates.map((i) => (
              <div key={i.id} className={`prow${picked.has(i.id) ? " sel" : ""}`} onClick={() => toggle(i.id)}>
                <input type="checkbox" readOnly checked={picked.has(i.id)} tabIndex={-1} style={{ accentColor: "var(--accent)" }} />
                <Photo id={i.photoId} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }} className="ellipsis">
                    {i.name || "Sans nom"}
                    {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                  </div>
                  <div className="hint">
                    {i.buyer || "Acheteur non renseigné"}
                    {i.platform ? ` · ${i.platform}` : ""} · vendue le {dshort(i.saleDate)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 12 }}>{eur2(revenueOf(i))}</div>
                  <span className={`pill ${i.delivery === "non_payee" ? "bad" : "good"}`}>
                    {DELIVERY_LABEL[i.delivery]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
