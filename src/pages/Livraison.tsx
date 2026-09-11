import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { costOf, revenueOf } from "../lib/calc";
import { dfr, eur, today } from "../lib/format";
import { SHIPPING_LABEL, SHIPPING_ORDER } from "../lib/constants";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import OrderModal from "../modals/OrderModal";
import ShipmentModal from "../modals/ShipmentModal";
import type { Item, Shipping } from "../types";

type Tab = "faire" | "recevoir";

/** Champ modifiable directement dans la ligne, sans ouvrir la fiche. */
function InlineField({
  value, placeholder, type = "text", onCommit, width = 140,
}: {
  value: string;
  placeholder: string;
  type?: "text" | "date";
  onCommit: (v: string) => void;
  width?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  if (!focused && draft !== value) setDraft(value);
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      style={{ width, padding: "4px 7px", fontSize: 12 }}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

export default function Livraison() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [tabParam, setTab] = useQueryState("tab", "faire");
  const tab = tabParam as Tab;
  const [lateOnly, setLateOnly] = useQueryState("late");
  const [editing, setEditing] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const allIncoming = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "arrivage")
        .sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999")),
    [state.items],
  );
  const outgoing = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "vendu" && i.delivery === "commandee")
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate)),
    [state.items],
  );

  const now = today();
  const late = allIncoming.filter((i) => i.expectedDate && i.expectedDate < now);
  const incoming = lateOnly ? late : allIncoming;
  const toShip = outgoing;
  // Ce que ces colis non partis représentent : l'opération reste ouverte tant qu'ils dorment.
  const sleeping = toShip.reduce((a, i) => a + revenueOf(i), 0);
  const unpaid = state.items.filter((i) => i.status === "vendu" && i.delivery === "non_payee");
  const delivered = state.items.filter((i) => i.status === "vendu" && i.delivery === "livree");
  const engaged = allIncoming.reduce((a, i) => a + costOf(i), 0);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  /** Réceptionne toutes les pièces d'une même commande d'un coup. */
  const receiveOrder = (orderId: string) => {
    const pieces = allIncoming.filter((i) => i.orderId === orderId);
    pieces.forEach((i) => patch(i.id, { status: "stock", receiveDate: today() }));
    toast(`${pieces.length} pièce${pieces.length > 1 ? "s" : ""} passée${pieces.length > 1 ? "s" : ""} en stock`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
  };

  /** Les commandes groupées encore complètes en arrivage. */
  const orderGroups = Array.from(
    incoming.reduce((m, i) => {
      if (!i.orderId) return m;
      m.set(i.orderId, (m.get(i.orderId) ?? 0) + 1);
      return m;
    }, new Map<string, number>()),
  ).filter(([, n]) => n > 1);

  const receive = (i: Item) => {
    patch(i.id, { status: "stock", receiveDate: today() });
    toast(`« ${i.name || "Sans nom"} » est en stock`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
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
    patch(i.id, s === "livree" ? { shipping: "livree", shipDate: i.shipDate || today() } : { shipping: "en_preparation" });
    toast(`Envoi : ${SHIPPING_LABEL[s]}`);
  };

  return (
    <>
      <HeaderActions>
        <Segmented<string>
          value={tab}
          onChange={setTab}
          options={[
            { value: "faire", label: `À faire (${toShip.length})` },
            { value: "recevoir", label: `À recevoir (${allIncoming.length})` },
          ]}
        />
        {tab === "recevoir" ? (
          <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle commande</button>
        ) : (
          <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle livraison</button>
        )}
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="Colis attendus"
          value={String(allIncoming.length)}
          meta={`${eur(engaged)} engagés en achat`}
          tone="info"
          to={links.livraison({ tab: "recevoir" })}
          hint="Voir"
        />
        <Kpi
          label="En retard"
          value={String(late.length)}
          meta={late.length ? "Arrivée prévue dépassée" : "Aucun retard"}
          tone={late.length ? "warn" : "ok"}
          to={late.length ? links.livraison({ tab: "recevoir", late: "1" }) : undefined}
          hint="Filtrer"
        />
        <Kpi
          label="Colis à envoyer"
          value={String(toShip.length)}
          meta={toShip.length ? `${eur(sleeping)} encaissés, colis pas encore parti` : "Rien en attente d'envoi"}
          tone={toShip.length ? "warn" : "ok"}
          to={links.livraison({ tab: "faire" })}
          hint="Voir"
        />
        <Kpi
          label="Ventes bouclées"
          value={String(delivered.length)}
          meta="Colis reçus par l'acheteur"
          to={links.ventes({ delivery: "livree" })}
          hint="Ventes"
        />
      </div>

      {tab === "recevoir" ? (
        <div className="card">
          <div className="card-h">
            <h3>Colis à recevoir</h3>
            <div className="spacer" />
            {lateOnly ? (
              <button className="btn ghost sm" onClick={() => setLateOnly("")}>
                Retards uniquement — tout afficher
              </button>
            ) : (
              <span className="hint">Pièces au statut Arrivage — réceptionnez pour les basculer en stock</span>
            )}
          </div>
          {orderGroups.length > 0 && (
            <div className="card-b" style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 0 }}>
              {orderGroups.map(([orderId, n]) => {
                const first = incoming.find((i) => i.orderId === orderId);
                return (
                  <button key={orderId} className="btn sm" onClick={() => receiveOrder(orderId)}>
                    ⇩ Réceptionner la commande {first?.source ? `« ${first.source} »` : ""} ({n})
                  </button>
                );
              })}
            </div>
          )}
          {incoming.length === 0 ? (
            <Empty glyph="⇩" title={lateOnly ? "Aucun colis en retard" : "Aucun colis en route"}>
              {lateOnly ? (
                <button className="btn sm" onClick={() => setLateOnly("")}>Voir tous les colis attendus</button>
              ) : (
                <>Les pièces créées au statut « Arrivage » apparaissent ici jusqu'à leur réception.</>
              )}
            </Empty>
          ) : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>Pièce</th>
                    <th>Source</th>
                    <th className="r">Coût</th>
                    <th>Transporteur</th>
                    <th>N° de suivi</th>
                    <th>Arrivée prévue</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((i) => {
                    const isLate = !!i.expectedDate && i.expectedDate < now;
                    return (
                      <tr key={i.id}>
                        <td><Photo id={i.photoId} /></td>
                        <td>
                          <button className="linkish" onClick={() => setEditing(i)}>{i.name || "Sans nom"}</button>
                          <div className="hint">{i.brand || "—"}{i.size ? ` · ${i.size}` : ""}</div>
                        </td>
                        <td>{i.source || "—"}</td>
                        <td className="r num">{eur(costOf(i))}</td>
                        <td>
                          <InlineField
                            value={i.carrier}
                            placeholder="Transporteur"
                            onCommit={(v) => patch(i.id, { carrier: v })}
                          />
                        </td>
                        <td>
                          <InlineField
                            value={i.tracking}
                            placeholder="N° de suivi"
                            onCommit={(v) => patch(i.id, { tracking: v })}
                            width={150}
                          />
                        </td>
                        <td>
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <InlineField
                              value={i.expectedDate}
                              type="date"
                              placeholder=""
                              onCommit={(v) => patch(i.id, { expectedDate: v })}
                              width={140}
                            />
                            {isLate && <span className="pill bad">Retard</span>}
                          </span>
                        </td>
                        <td className="r">
                          <div className="rowact always">
                            <button className="btn sm" onClick={() => receive(i)}>Réceptionner</button>
                            <button className="iconbtn" title="Éditer" onClick={() => setEditing(i)}>✎</button>
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
      ) : (
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
                    <th>Pièce</th>
                    <th>Vendue le</th>
                    <th>Transporteur</th>
                    <th>N° de suivi</th>
                    <th>Expédié le</th>
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
                        <InlineField
                          value={i.tracking}
                          placeholder="N° de suivi"
                          onCommit={(v) => patch(i.id, { tracking: v })}
                          width={150}
                        />
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
                      <td className="r">
                        <div className="status-toggle" role="group" aria-label="Avancement de l'envoi">
                          {SHIPPING_ORDER.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`sh-${s}${i.shipping === s ? " on" : ""}`}
                              aria-pressed={i.shipping === s}
                              onClick={() => setShipping(i, s)}
                            >
                              {SHIPPING_LABEL[s]}
                            </button>
                          ))}
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
      )}

      {creating && tab === "recevoir" && (
        <OrderModal onClose={() => setCreating(false)} onCreated={() => setLateOnly("")} />
      )}
      {creating && tab === "faire" && <ShipmentModal onClose={() => setCreating(false)} />}
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
