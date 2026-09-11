import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useClearQuery, useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { LABEL } from "../lib/lexicon";
import { costOf, marginOf, monthlySeries, periodRange, qtyOf, revenueOf, saleCostsOf, soldItems } from "../lib/calc";
import { dshort, eur, eur2, pct, today } from "../lib/format";
import { DELIVERY_LABEL, DELIVERY_ORDER } from "../lib/constants";
import { downloadText, itemsToCSV } from "../lib/csv";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import PickItemModal from "../modals/PickItemModal";
import type { Delivery, Item, Period } from "../types";

export default function Ventes() {
  const { state, dispatch, deleteItem } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [deliveryParam, setDelivery] = useQueryState("delivery", "all");
  const [platform, setPlatform] = useQueryState("platform");
  const [brand, setBrand] = useQueryState("brand");
  const [type, setType] = useQueryState("type");
  const [size, setSize] = useQueryState("size");
  const clearFilters = useClearQuery(["delivery", "platform", "brand", "type", "size"]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [reselling, setReselling] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [picking, setPicking] = useState(false);

  const range = useMemo(() => periodRange(period), [period]);
  const list = useMemo(
    () =>
      soldItems(state.items, range)
        .filter((i) => deliveryParam === "all" || i.delivery === deliveryParam)
        .filter((i) => !platform || i.platform === platform)
        .filter((i) => !brand || i.brand === brand)
        .filter((i) => !type || i.type === type)
        .filter((i) => !size || i.size === size)
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    [state.items, range, deliveryParam, platform, brand, type, size],
  );

  const allSold = useMemo(() => soldItems(state.items, range), [state.items, range]);
  const uniq = (k: "platform" | "brand" | "type" | "size") =>
    [...new Set(allSold.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const hasFilters = deliveryParam !== "all" || !!platform || !!brand || !!type || !!size;

  // CA = prix de vente seuls ; l'encaissé ajoute le port et exclut les impayés.
  const ca = list.reduce((a, i) => a + i.price * qtyOf(i), 0);
  const cashIn = list.filter((i) => i.delivery !== "non_payee").reduce((a, i) => a + revenueOf(i), 0);
  const awaiting = list.filter((i) => i.delivery === "non_payee").reduce((a, i) => a + revenueOf(i), 0);
  const awaitingCount = list.filter((i) => i.delivery === "non_payee").length;
  const fees = list.reduce((a, i) => a + saleCostsOf(i), 0);
  const buy = list.reduce((a, i) => a + costOf(i), 0);
  const marge = list.reduce((a, i) => a + marginOf(i), 0);
  const engaged = buy + fees;
  const roi = engaged > 0 ? (marge / engaged) * 100 : 0;

  // Progression sur 12 mois, toutes ventes confondues.
  const months = useMemo(() => monthlySeries(state.items), [state.items]);
  const maxMonth = Math.max(...months.map((m) => m.ca), 0);

  const docFor = (item: Item) => state.docs.find((d) => d.itemIds.includes(item.id));

  return (
    <>
      <HeaderActions>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois en cours" },
            { value: "year", label: "Année en cours" },
            { value: "all", label: "Depuis le début" },
          ]}
        />
        <button className="btn" onClick={() => downloadText(`ventes-${today()}.csv`, itemsToCSV(list))}>
          ↓ Export CSV
        </button>
        <button className="btn primary" onClick={() => setPicking(true)}>+ Nouvelle vente</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="CA total"
          value={eur(ca)}
          meta={`${list.length} vente${list.length > 1 ? "s" : ""} · ${range.label}`}
        />
        <Kpi
          label="Encaissé"
          value={eur(cashIn)}
          meta={`${LABEL.price} + ${LABEL.shippingPaid.toLowerCase()}, impayés exclus`}
          tone="ok"
        />
        <Kpi
          label="En attente"
          value={eur(awaiting)}
          meta={awaitingCount ? `${awaitingCount} vente${awaitingCount > 1 ? "s" : ""} non payée${awaitingCount > 1 ? "s" : ""}` : "Tout est payé"}
          tone={awaitingCount ? "warn" : "ok"}
          to={awaitingCount ? links.ventes({ delivery: "non_payee" }) : undefined}
          hint="Filtrer"
        />
        <Kpi
          label="Marge nette"
          value={eur(marge)}
          meta={`${eur(fees)} de frais · ${eur(buy)} d'achat`}
          tone={marge >= 0 ? "ok" : "warn"}
          to={links.bilan()}
          hint="Bilan"
        />
        <Kpi
          label="ROI"
          value={pct(roi)}
          meta="Marge rapportée à ce qui a été engagé"
          tone={roi >= 0 ? "ok" : "warn"}
        />
      </div>

      <div className="toolbar">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
          <option value="">Tous les canaux</option>
          {uniq("platform").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
          <option value="">Toutes marques</option>
          {uniq("brand").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">Tous types</option>
          {uniq("type").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} style={{ width: "auto", minWidth: 110 }}>
          <option value="">Toutes tailles</option>
          {uniq("size").map((v) => <option key={v}>{v}</option>)}
        </select>
        {deliveryParam !== "all" && (
          <button className="btn ghost sm" onClick={() => setDelivery("all")}>
            {DELIVERY_LABEL[deliveryParam as Delivery]} ✕
          </button>
        )}
        <div className="spacer" />
        {hasFilters && <button className="btn ghost sm" onClick={clearFilters}>Réinitialiser</button>}
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty glyph="↗" title="Aucune vente sur la période">
            Marquez une pièce comme vendue depuis le stock : le formulaire de vente recueille la plateforme,
            l'acheteur, les frais et le suivi, et tout se retrouve ici.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Historique des ventes</h3>
            <div className="spacer" />
            <span className="hint num">
              {eur(buy)} d'achat · {eur(fees)} de frais · {eur(marge)} de marge
            </span>
          </div>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Pièce</th>
                  <th>Canal</th>
                  <th>Vendue</th>
                  <th className="r">Prix</th>
                  <th className="r">Port</th>
                  <th className="r">Marge</th>
                  <th className="r">Livraison</th>
                  <th>Doc</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const m = marginOf(i);
                  const doc = docFor(i);
                  // Port net : positif si l'acheteur a payé plus que ce que l'envoi m'a coûté.
                  const portNet = i.shippingPaid - i.shippingCost;
                  return (
                    <tr key={i.id}>
                      <td><Photo id={i.photoId} /></td>
                      <td>
                        <button className="linkish ellipsis" title={i.name} onClick={() => setEditing(i)}>
                          {i.name || "Sans nom"}
                        </button>
                        <div className="hint nowrap">
                          {i.brand || "—"}{i.size ? ` · ${i.size}` : ""}
                          {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                        </div>
                      </td>
                      <td>
                        {i.platform ? (
                          <button className="pill neutral pill-btn" onClick={() => setPlatform(i.platform)}>
                            {i.platform}
                          </button>
                        ) : <span className="hint">—</span>}
                        {i.buyer && <div className="hint nowrap">{i.buyer}</div>}
                      </td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</td>
                      <td className="r num">
                        {eur2(i.price * qtyOf(i))}
                        {qtyOf(i) > 1 && <div className="hint num">{qtyOf(i)} × {eur2(i.price)}</div>}
                      </td>
                      <td className={`r num ${portNet > 0 ? "pos" : portNet < 0 ? "neg" : ""}`}>
                        {portNet === 0 ? "—" : `${portNet > 0 ? "+" : "−"}${eur2(Math.abs(portNet))}`}
                      </td>
                      <td className={`r num ${m >= 0 ? "pos" : "neg"}`}>{eur2(m)}</td>
                      <td className="r">
                        <div className="status-toggle" role="group" aria-label="Livraison">
                          {DELIVERY_ORDER.map((d) => (
                            <button
                              key={d}
                              type="button"
                              className={`dl-${d}${i.delivery === d ? " on" : ""}`}
                              aria-pressed={i.delivery === d}
                              onClick={() => {
                                if (i.delivery === d) return;
                                dispatch({ type: "patchItem", id: i.id, patch: { delivery: d } });
                                toast(
                                  d === "commandee"
                                    ? `« ${i.name || "Sans nom"} » passe en livraison`
                                    : `Livraison : ${DELIVERY_LABEL[d]}`,
                                  d === "commandee"
                                    ? { label: "Voir", onClick: () => navigate(links.livraison({ tab: "faire" })) }
                                    : undefined,
                                );
                              }}
                            >
                              {DELIVERY_LABEL[d]}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        {doc ? (
                          <a
                            href={`#${links.doc(doc.id)}`}
                            className={`pill ${doc.paid ? "good" : "bad"}`}
                            onClick={(e) => { e.preventDefault(); navigate(links.doc(doc.id)); }}
                          >
                            {doc.number}
                          </a>
                        ) : (
                          <button className="btn ghost sm" onClick={() => navigate(links.newDoc(i.id))}>
                            Générer
                          </button>
                        )}
                      </td>
                      <td className="r">
                        <div className="rowact">
                          <button className="iconbtn" title="Modifier la vente" onClick={() => setReselling(i)}>€</button>
                          <button className="iconbtn" title="Éditer la fiche" onClick={() => setEditing(i)}>✎</button>
                          <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(i)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {maxMonth > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h3>Progression mensuelle</h3>
            <div className="spacer" />
            <span className="hint">CA et marge des 12 derniers mois</span>
          </div>
          <div className="card-b">
            <div className="month-bars tall">
              {months.map((m) => (
                <div className="month-bar" key={m.key} title={`${m.label} — ${eur(m.ca)} de CA, ${eur(m.marge)} de marge`}>
                  <div className="mb-track">
                    <div className="mb-fill" style={{ height: `${Math.max(2, (m.ca / maxMonth) * 100)}%` }} />
                    <div className="mb-fill marge" style={{ height: `${Math.max(0, (Math.max(0, m.marge) / maxMonth) * 100)}%` }} />
                  </div>
                  <div className="mb-label">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="mb-legend">
              <span><i className="dot-ca" /> Chiffre d'affaires</span>
              <span><i className="dot-marge" /> Marge</span>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <PickItemModal
          title="Nouvelle vente"
          emptyHint="Ajoutez d'abord une pièce depuis le Stock, ou enregistrez une commande."
          onClose={() => setPicking(false)}
          onPick={(i) => { setPicking(false); setReselling(i); }}
        />
      )}
      {reselling && (
        <SellModal
          item={reselling}
          onClose={() => setReselling(null)}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
          onSold={() => toast("Vente mise à jour")}
        />
      )}
      {editing && (
        <ItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onDelete={(i) => { deleteItem(i); toast("Pièce supprimée"); }}
          onSell={(i) => setReselling(i)}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer cette vente ?"
          body={<>« {confirming.name || "Sans nom"} » disparaîtra de l'historique et des statistiques.</>}
          onConfirm={() => { deleteItem(confirming); toast("Vente supprimée"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
