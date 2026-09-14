import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Kpi, Photo, RangePicker } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import { useClearQuery, useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { canFileLitige, costOf, marginOf, qtyOf, revenueOf, saleCostsOf, soldItems } from "../lib/calc";
import { useSecteur } from "../lib/useSecteur";
import { fieldLabels, itemAttr } from "../lib/sectorFields";
import { dshort, eur, eur2, pct, today } from "../lib/format";
import { DELIVERY_LABEL, DELIVERY_ORDER } from "../lib/constants";
import { downloadText, itemsToCSV } from "../lib/csv";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import PickItemModal from "../modals/PickItemModal";
import ExpenseModal from "../modals/ExpenseModal";
import type { Delivery, Item } from "../types";

const SALES_SECTIONS: { delivery: Delivery; title: string; empty: string }[] = [
  { delivery: "non_payee", title: "Commandes et réservations", empty: "Aucune commande ou réservation" },
  { delivery: "commandee", title: "En cours · paiement / livraison", empty: "Aucune vente en cours" },
  { delivery: "livree", title: "Ventes terminées · 14 jours", empty: "Aucune vente terminée récemment" },
];

const isDirectOrSocialPlatform = (plat: string | undefined): boolean => {
  if (!plat) return true;
  const p = plat.toLowerCase().trim();
  const directKeywords = ["particulier", "discord", "insta", "instagram", "whatsapp", "leboncoin", "lbc", "main", "direct", "snap", "sms", "tel", "téléphone", "privé", "remise"];
  return directKeywords.some((k) => p.includes(k));
};

export default function Ventes() {
  const { state, dispatch, deleteItem } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("ventes");
  const secteur = useSecteur();
  const labels = fieldLabels(secteur.domain);
  const [platform, setPlatform] = useQueryState("platform");
  const [brand, setBrand] = useQueryState("brand");
  const [type, setType] = useQueryState("type");
  const [size, setSize] = useQueryState("size");
  const clearFilters = useClearQuery(["platform", "brand", "type", "size"]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [reselling, setReselling] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [picking, setPicking] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  const items = secteur.items;
  const filteredSales = useMemo(
    () =>
      soldItems(items, range)
        .filter((i) => !platform || i.platform === platform)
        .filter((i) => !brand || itemAttr(i, "brand") === brand)
        .filter((i) => !type || itemAttr(i, "type") === type)
        .filter((i) => !size || itemAttr(i, "size") === size)
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    [items, range, platform, brand, type, size],
  );

  const operationalSales = filteredSales.filter((i) => i.delivery !== "livree" || canFileLitige(i));
  const list = operationalSales;

  const allSold = useMemo(() => soldItems(items, range), [items, range]);
  const uniq = (k: "platform" | "brand" | "type" | "size") =>
    [...new Set(allSold.map((i) => (k === "platform" ? i.platform : itemAttr(i, k))).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const hasFilters = !!platform || !!brand || !!type || !!size;

  const finalSales = filteredSales.filter((i) => i.delivery === "livree");
  const theoreticalSales = filteredSales.filter((i) => i.delivery !== "livree");
  const paidSales = filteredSales.filter((i) => i.delivery === "commandee");
  const finalCa = finalSales.reduce((a, i) => a + i.price * qtyOf(i), 0);
  const theoreticalCa = theoreticalSales.reduce((a, i) => a + i.price * qtyOf(i), 0);
  const paidPending = paidSales.reduce((a, i) => a + revenueOf(i), 0);
  const finalFees = finalSales.reduce((a, i) => a + saleCostsOf(i), 0);
  const finalBuy = finalSales.reduce((a, i) => a + costOf(i), 0);
  const finalMargin = finalSales.reduce((a, i) => a + marginOf(i), 0);
  const finalEngaged = finalBuy + finalFees;
  const finalRoi = finalEngaged > 0 ? (finalMargin / finalEngaged) * 100 : 0;
  const docFor = (item: Item) => state.docs.find((d) => d.itemIds.includes(item.id));

  const openLitige = (item: Item) => {
    dispatch({
      type: "patchItem",
      id: item.id,
      patch: {
        litigeState: "en_cours",
        litigeCategory: item.litigeCategory || "Vente",
        notes: [item.notes, "Litige signalé depuis Ventes"].filter(Boolean).join("\n"),
      },
    });
    toast("Litige ouvert", { label: "Voir SAV", onClick: () => navigate(links.sav()) });
  };

  const salesTable = (rows: Item[]) => (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Article</th>
                  <th>Canal</th>
                  <th>Vendue</th>
                  <th className="r">Prix</th>
                  <th className="r">Port</th>
                  <th className="r">Frais</th>
                  <th className="r">Marge</th>
                  <th className="r">Statut</th>
                  <th>Doc</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
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
                          {itemAttr(i, "brand") || "—"}{itemAttr(i, "size") ? ` · ${itemAttr(i, "size")}` : ""}
                          {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                        </div>
                      </td>
                      <td>
                        {i.platform ? (
                          <button
                            className="pill neutral pill-btn"
                            onClick={() => setPlatform(i.platform)}
                            style={{ fontSize: 10.5, padding: "2px 7px", height: "auto", fontWeight: 500, display: "inline-block" }}
                          >
                            {i.platform}
                          </button>
                        ) : <span className="hint">—</span>}
                        {i.buyer && isDirectOrSocialPlatform(i.platform) && (
                          <div className="hint nowrap" style={{ fontSize: 11, marginTop: 2 }}>{i.buyer}</div>
                        )}
                      </td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</td>
                      <td className="r num">
                        {eur2(i.price * qtyOf(i))}
                        {qtyOf(i) > 1 && <div className="hint num">{qtyOf(i)} × {eur2(i.price)}</div>}
                      </td>
                      <td className={`r num ${portNet > 0 ? "pos" : portNet < 0 ? "neg" : ""}`}>
                        {portNet === 0 ? "—" : `${portNet > 0 ? "+" : "−"}${eur2(Math.abs(portNet))}`}
                      </td>
                      <td className="r num">
                        {i.extraFees ? `−${eur2(i.extraFees)}` : "—"}
                      </td>
                      <td className={`r num ${m >= 0 ? "pos" : "neg"}`}>{eur2(m)}</td>
                      <td className="r">
                        <select
                          className={`dl-select dl-${i.delivery}`}
                          aria-label="Statut de la vente"
                          value={i.delivery}
                          onChange={(e) => {
                            const d = e.target.value as Delivery;
                            if (i.delivery === d) return;
                            dispatch({
                              type: "patchItem",
                              id: i.id,
                              patch: d === "livree"
                                ? { delivery: d, shipping: "recu", validationDate: today(), shipDate: i.shipDate || today() }
                                : {
                                    delivery: d,
                                    validationDate: undefined,
                                    shipping: i.shipping === "recu" || i.shipping === "livree" ? "en_preparation" : i.shipping,
                                  },
                            });
                            toast(
                              d === "commandee" ? `« ${i.name || "Sans nom"} » est payée et prête à envoyer`
                              : d === "livree" ? `« ${i.name || "Sans nom"} » est livrée — CA validé`
                              : `Vente : ${DELIVERY_LABEL[d]}`,
                              d === "commandee"
                                ? { label: "Voir", onClick: () => navigate(links.livraison()) }
                                : undefined,
                            );
                          }}
                        >
                          {DELIVERY_ORDER.map((d) => (
                            <option key={d} value={d}>{DELIVERY_LABEL[d]}</option>
                          ))}
                        </select>
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
                          {canFileLitige(i) && (
                            <button className="btn sm ghost" onClick={() => openLitige(i)}>Litige</button>
                          )}
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
  );

  return (
    <>
      <HeaderActions>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
        <button className="btn" onClick={() => downloadText(`ventes-${today()}.csv`, itemsToCSV(list))}>
          ↓ Export CSV
        </button>
        <button className="btn primary" onClick={() => setPicking(true)}>+ Nouvelle vente</button>
      </HeaderActions>

      <div className="kpi-grid sales-kpis">
        <Kpi
          label="CA final"
          value={eur(finalCa)}
          meta={`${finalSales.length} vente${finalSales.length > 1 ? "s" : ""} livrée${finalSales.length > 1 ? "s" : ""} · ${range.label}`}
          tone="ok"
        />
        <Kpi
          label="CA théorique"
          value={eur(theoreticalCa)}
          meta={`${theoreticalSales.length} vente${theoreticalSales.length > 1 ? "s" : ""} pas encore livrée${theoreticalSales.length > 1 ? "s" : ""}`}
          tone="info"
        />
        <Kpi
          label="Payé à livrer"
          value={eur(paidPending)}
          meta={`${paidSales.length} vente${paidSales.length > 1 ? "s" : ""} réglée${paidSales.length > 1 ? "s" : ""}`}
          tone={paidSales.length ? "warn" : "ok"}
        />
        <Kpi
          label="Marge finale"
          value={eur(finalMargin)}
          meta={`${eur(finalFees)} de frais · ${eur(finalBuy)} d'achat`}
          tone={finalMargin >= 0 ? "ok" : "warn"}
          to={links.bilan()}
          hint="Bilan"
        />
        <Kpi
          label="ROI final"
          value={pct(finalRoi)}
          meta={finalEngaged ? "Calculé uniquement sur les ventes livrées" : "En attente d'une vente livrée"}
          tone={finalRoi >= 0 ? "ok" : "warn"}
        />
      </div>

      <div className="toolbar">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
          <option value="">Tous les canaux</option>
          {uniq("platform").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "auto", minWidth: 140 }}>
          <option value="">{labels.brandAll}</option>
          {uniq("brand").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">{labels.typeAll}</option>
          {uniq("type").map((v) => <option key={v}>{v}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} style={{ width: "auto", minWidth: 110 }}>
          <option value="">{labels.sizeAll}</option>
          {uniq("size").map((v) => <option key={v}>{v}</option>)}
        </select>
        <div className="spacer" />
        {hasFilters && <button className="btn ghost sm" onClick={clearFilters}>Réinitialiser</button>}
      </div>

      <div className="sales-stage-stack">
        {SALES_SECTIONS.map((section) => {
          const rows = list.filter((i) => i.delivery === section.delivery);
          const sectionBuy = rows.reduce((a, i) => a + costOf(i), 0);
          const sectionFees = rows.reduce((a, i) => a + saleCostsOf(i), 0);
          const sectionMargin = rows.reduce((a, i) => a + marginOf(i), 0);
          return (
            <div className={`card sales-stage sales-stage-${section.delivery}`} key={section.delivery}>
              <div className="card-h">
                <h3>{section.title}</h3>
                <span className="pill neutral">{rows.length}</span>
                <div className="spacer" />
                <span className="hint num">
                  {section.delivery === "livree" ? "CA final · reste visible 14 jours" : "Montants théoriques"}
                  {rows.length > 0 && ` · ${eur(sectionBuy)} d'achat · ${eur(sectionFees)} de frais · ${eur(sectionMargin)} de marge`}
                </span>
              </div>
              {rows.length > 0 ? salesTable(rows) : <div className="sales-stage-empty">{section.empty}</div>}
            </div>
          );
        })}
      </div>

      <div className="note info" style={{ marginTop: 16 }}>
        <span className="glyph">📊</span>
        <div>
          Classements, tops produits et évolution mensuelle sont dans{" "}
          <a href="#/dashboard">Vue générale</a>.
        </div>
      </div>

      {addingExpense && (
        <ExpenseModal
          expense={null}
          defaultKind="vente"
          onClose={() => setAddingExpense(false)}
        />
      )}
      {picking && (
        <PickItemModal
          title="Nouvelle vente"
          emptyHint="Ajoutez d’abord un article depuis le Stock, ou enregistrez une commande."
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
          onDelete={(i) => { deleteItem(i); toast("Article supprimé"); }}
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
