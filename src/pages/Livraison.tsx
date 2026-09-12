import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo } from "../components/ui";
import InlineField from "../components/InlineField";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { links } from "../lib/links";
import { revenueOf } from "../lib/calc";
import { dfr, eur, today } from "../lib/format";
import { SHIPPING_LABEL } from "../lib/constants";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import ShipmentModal from "../modals/ShipmentModal";
import type { Item, Shipping } from "../types";

const OUTGOING_SHIPPING: Shipping[] = ["en_preparation", "a_deposer", "livree", "recu"];

/** Livraison : uniquement le sortant. Les colis qu'on attend se réceptionnent dans Arrivage. */
export default function Livraison() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const outgoing = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "vendu" && i.delivery === "commandee")
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate)),
    [state.items],
  );

  const toShip = outgoing;
  // Ce que ces colis non partis représentent : l'opération reste ouverte tant qu'ils dorment.
  const sleeping = toShip.reduce((a, i) => a + revenueOf(i), 0);
  const unpaid = state.items.filter((i) => i.status === "vendu" && i.delivery === "non_payee");
  const delivered = state.items.filter((i) => i.status === "vendu" && i.delivery === "livree");

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  const openLitige = (item: Item) => {
    patch(item.id, {
      litigeState: "en_cours",
      litigeCategory: item.litigeCategory || "Livraison",
      notes: [item.notes, "Litige signalé pendant la livraison"].filter(Boolean).join("\n"),
    });
    toast("Litige ouvert", { label: "Voir SAV", onClick: () => navigate(links.sav()) });
  };

  const attachShippingVideo = (item: Item, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      patch(item.id, {
        shippingVideo: reader.result as string,
        shippingVideoName: file.name,
      });
      toast("Vidéo d'envoi ajoutée");
    };
    reader.readAsDataURL(file);
  };

  /** Faire avancer l'envoi ; « Reçu » clôt la vente et la sort de cette liste. */
  const setShipping = (i: Item, s: Shipping) => {
    if (i.shipping === s) return;
    if (s === "recu") {
      patch(i.id, { shipping: "recu", delivery: "livree", shipDate: i.shipDate || today() });
      toast(`Vente bouclée pour « ${i.name || "Sans nom"} »`, {
        label: "Voir la vente",
        onClick: () => navigate(links.ventes()),
      });
      return;
    }
    patch(i.id, s === "livree" ? { shipping: "livree", shipDate: i.shipDate || today() } : { shipping: s });
    toast(`Envoi : ${SHIPPING_LABEL[s]}`);
  };

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle livraison</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="Colis à envoyer"
          value={String(toShip.length)}
          meta={toShip.length ? `${eur(sleeping)} encaissés, colis pas encore parti` : "Rien en attente d'envoi"}
          tone={toShip.length ? "warn" : "ok"}
        />
        <Kpi
          label="Ventes non payées"
          value={String(unpaid.length)}
          meta={unpaid.length ? "En attente de règlement" : "Tout est réglé"}
          tone={unpaid.length ? "warn" : "ok"}
          to={links.ventes({ delivery: "non_payee" })}
          hint="Ventes"
        />
        <Kpi
          label="Ventes bouclées"
          value={String(delivered.length)}
          meta="Colis reçus par l'acheteur"
          to={links.ventes({ delivery: "livree" })}
          hint="Ventes"
        />
      </div>

      <div className="card">
          <div className="card-h">
            <h3>Livraisons à faire</h3>
            <div className="spacer" />
            <span className="hint">Commandes payées, jusqu'à la livraison confirmée</span>
          </div>
          {outgoing.length === 0 ? (
            <Empty glyph="↗" title="Rien à livrer">
              {unpaid.length
                ? `${unpaid.length} vente${unpaid.length > 1 ? "s" : ""} encore non payée${unpaid.length > 1 ? "s" : ""} — elle${unpaid.length > 1 ? "s" : ""} arrivera${unpaid.length > 1 ? "ont" : ""} ici une fois passée${unpaid.length > 1 ? "s" : ""} en « Commandée ».`
                : "Toutes les commandes payées sont livrées."}{" "}
              <a href={`#${links.ventes()}`}>Voir l'historique</a>
            </Empty>
          ) : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>Article</th>
                    <th>Vendue le</th>
                    <th>Transporteur</th>
                    <th>Suivi</th>
                    <th>Expédié le</th>
                    <th>Vidéo</th>
                    <th className="r">Envoi</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((i) => (
                    <tr key={i.id}>
                      <td><Photo id={i.photoId} /></td>
                      <td>
                        <button className="linkish" onClick={() => setEditing(i)}>{i.name || "Sans nom"}</button>
                        <div className="hint">{i.brand || "—"}{i.size ? ` · ${i.size}` : ""}</div>
                      </td>
                      <td className="num" style={{ fontSize: 12 }}>{dfr(i.saleDate)}</td>
                      <td>
                        <InlineField
                          value={i.carrier}
                          placeholder="Transporteur"
                          onCommit={(v) => patch(i.id, { carrier: v })}
                        />
                      </td>
                      <td>
                        {i.tracking ? (
                          <TrackingLink carrier={i.carrier} code={i.tracking} />
                        ) : (
                          <button className="btn sm ghost" onClick={() => setEditing(i)}>+ Lien</button>
                        )}
                      </td>
                      <td>
                        <InlineField
                          value={i.shipDate}
                          type="date"
                          placeholder=""
                          onCommit={(v) => patch(i.id, { shipDate: v })}
                          width={140}
                        />
                      </td>
                      <td>
                        <div className="rowact always">
                          {i.shippingVideo ? (
                            <a className="btn sm ghost" href={i.shippingVideo} target="_blank" rel="noreferrer">
                              Voir vidéo
                            </a>
                          ) : null}
                          <label className="btn sm">
                            {i.shippingVideo ? "Remplacer" : "+ Vidéo"}
                            <input
                              type="file"
                              accept="video/*"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                attachShippingVideo(i, e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </td>
                      <td className="r">
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <select
                            value={i.shipping}
                            onChange={(e) => setShipping(i, e.target.value as Shipping)}
                            style={{ width: "auto", minWidth: 150 }}
                          >
                            {OUTGOING_SHIPPING.map((s) => (
                              <option key={s} value={s}>{SHIPPING_LABEL[s]}</option>
                            ))}
                          </select>
                          <button className="btn sm ghost" onClick={() => openLitige(i)}>Litige</button>
                        </div>
                      </td>
                      <td className="r">
                        <div className="rowact">
                          <button className="iconbtn" title="Éditer" onClick={() => setEditing(i)}>✎</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {creating && <ShipmentModal onClose={() => setCreating(false)} />}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} onSell={(i) => setSelling(i)} />}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => setSelling(null)}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
          onSold={(i) =>
            toast(`Vente enregistrée pour « ${i.name} »`, {
              label: "Voir les ventes",
              onClick: () => navigate(links.ventes()),
            })
          }
        />
      )}
    </>
  );
}
