import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Kpi, Modal, Photo } from "../components/ui";
import InlineField from "../components/InlineField";
import MenuButton from "../components/MenuButton";
import { useStore } from "../store/StoreContext";
import { costOf, filterItemsByDomain, qtyOf, type Domain } from "../lib/calc";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import { useToast } from "../components/Toast";
import type { Item, ProductGender } from "../types";
import TrackingLink from "../components/TrackingLink";
import ItemModal from "../modals/ItemModal";
import ScannerModal from "../components/ScannerModal";
import ExpenseModal from "../modals/ExpenseModal";
import SellModal from "../modals/SellModal";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";
import ImportInvoiceModal from "../modals/ImportInvoiceModal";

type Dispatch = ReturnType<typeof useStore>["dispatch"];

/**
 * Réception d'une ligne d'arrivage. Un lot de N exemplaires éclate en N articles
 * individuels : chacun se vend, se photographie et se price séparément. Le tag du
 * lot garde le lien avec la commande d'origine.
 */
function receivedUnits(item: Item): Item[] {
  const qty = qtyOf(item);
  const received = {
    status: "stock" as const,
    receiveDate: today(),
    lotTag: item.lotTag || item.source || "",
  };
  if (qty <= 1) return [{ ...item, ...received }];
  return Array.from({ length: qty }, (_, n) => ({
    ...item,
    ...received,
    id: uid(),
    quantity: 1,
    createdAt: Date.now() + n,
  }));
}

/** Seule implémentation de la réception : toute l'app passe par ici. Renvoie le nombre d'unités entrées. */
function receiveInto(item: Item, dispatch: Dispatch): number {
  const units = receivedUnits(item);
  if (units.length > 1) dispatch({ type: "removeItem", id: item.id });
  units.forEach((unit) => dispatch({ type: "upsertItem", item: unit }));
  return units.length;
}

type ParcelDraft = {
  id: string; name: string; brand: string; type: string; size: string; gender: ProductGender;
  quantity: string; cost: string; fees: string; price: string; condition: string;
};

function ReceiveParcelModal({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ParcelDraft[]>(() =>
    items.map((i) => ({
      id: i.id, name: i.name, brand: i.brand, type: i.type, size: i.size, gender: i.gender || "",
      quantity: String(qtyOf(i)), cost: i.cost ? String(i.cost) : "", fees: i.fees ? String(i.fees) : "",
      price: i.price ? String(i.price) : "", condition: i.condition || "Neuf avec étiquette",
    })),
  );

  const patch = <K extends keyof ParcelDraft>(id: string, key: K, value: ParcelDraft[K]) =>
    setDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const saveAll = () => {
    let total = 0;
    for (const d of drafts) {
      const original = items.find((i) => i.id === d.id);
      if (!original) continue;
      total += receiveInto(
        {
          ...original,
          name: d.name.trim() || original.name,
          brand: d.brand.trim(),
          type: d.type.trim(),
          size: d.size.trim(),
          gender: d.gender,
          quantity: Math.max(1, Math.round(num(d.quantity)) || 1),
          cost: num(d.cost),
          fees: num(d.fees),
          price: num(d.price),
          estimatedPrice: num(d.price) || original.estimatedPrice,
          condition: d.condition.trim() || original.condition || "Neuf avec étiquette",
        },
        dispatch,
      );
    }
    toast(`${total} article${total > 1 ? "s" : ""} réceptionné${total > 1 ? "s" : ""} en stock`, {
      label: "Voir Stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
    onClose();
  };

  return (
    <Modal
      title="Déballage du colis"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={saveAll}>Réceptionner tout</button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 12 }}>
        Corrigez ce que le colis contient réellement, puis validez : une ligne de plusieurs
        exemplaires entre en stock à l'unité.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {drafts.map((d) => (
          <div className="calc-line" key={d.id}>
            <div className="calc-line-grid">
              <label><span>Article</span><input value={d.name} onChange={(e) => patch(d.id, "name", e.target.value)} /></label>
              <label><span>Marque</span><input value={d.brand} onChange={(e) => patch(d.id, "brand", e.target.value)} /></label>
              <label><span>Type</span><input value={d.type} onChange={(e) => patch(d.id, "type", e.target.value)} /></label>
              <label><span>Taille</span><input value={d.size} onChange={(e) => patch(d.id, "size", e.target.value)} /></label>
              <label>
                <span>Sexe</span>
                <select value={d.gender} onChange={(e) => patch(d.id, "gender", e.target.value as ProductGender)}>
                  <option value="">Non précisé</option>
                  <option value="homme">Homme</option>
                  <option value="femme">Femme</option>
                  <option value="mixte">Mixte</option>
                  <option value="enfant">Enfant</option>
                </select>
              </label>
              <label><span>Quantité</span><input type="number" min="1" step="1" value={d.quantity} onChange={(e) => patch(d.id, "quantity", e.target.value)} /></label>
              <label><span>Coût</span><input type="number" step="0.01" value={d.cost} onChange={(e) => patch(d.id, "cost", e.target.value)} /></label>
              <label><span>Frais</span><input type="number" step="0.01" value={d.fees} onChange={(e) => patch(d.id, "fees", e.target.value)} /></label>
              <label><span>Prix estimé</span><input type="number" step="0.01" value={d.price} onChange={(e) => patch(d.id, "price", e.target.value)} /></label>
              <label>
                <span>État</span>
                <select value={d.condition} onChange={(e) => patch(d.id, "condition", e.target.value)}>
                  <option value="Neuf avec étiquette">✨ Neuf avec étiquette</option>
                  <option value="Neuf sans étiquette">🏷️ Neuf sans étiquette</option>
                  <option value="Très bon état">⭐ Très bon état</option>
                  <option value="Bon état">👍 Bon état</option>
                  <option value="Satisfaisant">👌 Satisfaisant</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

type Tab = "colis" | "express";

/**
 * Centrale d'achat : tout ce qui entre — commandes, réception, demandes produit,
 * et l'import de facture pour créer une commande sans tout ressaisir.
 */
export default function CentraleAchat() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const secteurRaw = searchParams.get("secteur");
  const domain: Domain = secteurRaw === "tcg" || secteurRaw === "fashion" ? secteurRaw : "all";
  const [tab, setTab] = useState<Tab>("colis");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [receivingParcel, setReceivingParcel] = useState<Item[] | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState<{ mode: "lot" | "supplier"; defaultSource?: string; initialLines?: OrderPresetLine[] } | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newItem, setNewItem] = useState(false);
  const [selling, setSelling] = useState<Item | null>(null);

  const [expressBrand, setExpressBrand] = useState("");
  const [expressName, setExpressName] = useState("");
  const [expressType, setExpressType] = useState("Sneakers");
  const [expressSize, setExpressSize] = useState("");
  const [expressQty, setExpressQty] = useState(1);
  const [expressCost, setExpressCost] = useState("");
  const [expressFees, setExpressFees] = useState("");
  const [expressSource, setExpressSource] = useState("");
  const [expressLotTag, setExpressLotTag] = useState("");

  const now = today();

  const incomingItems = useMemo(
    () => filterItemsByDomain(state.items.filter((i) => i.status === "arrivage"), domain),
    [state.items, domain],
  );

  /** Un colis = une commande. Les lignes isolées forment leur propre colis. */
  const parcels = useMemo(() => {
    const map = new Map<string, {
      orderId: string; items: Item[]; supplier: string; tracking: string; carrier: string;
      expectedDate: string; buyDate: string; purchasePaid: boolean; qty: number; total: number;
    }>();
    incomingItems.forEach((item) => {
      const key = item.orderId || `solo-${item.id}`;
      if (!map.has(key)) {
        const sup = state.suppliers.find((s) => s.id === item.source || s.name === item.source);
        map.set(key, {
          orderId: key, items: [], supplier: sup?.name || item.source || "Fournisseur direct",
          tracking: item.tracking, carrier: item.carrier, expectedDate: item.expectedDate,
          buyDate: item.buyDate, purchasePaid: true, qty: 0, total: 0,
        });
      }
      const parcel = map.get(key)!;
      parcel.items.push(item);
      parcel.qty += qtyOf(item);
      parcel.total += costOf(item);
      if (!item.purchasePaid) parcel.purchasePaid = false;
      if (item.expectedDate && (!parcel.expectedDate || item.expectedDate < parcel.expectedDate)) {
        parcel.expectedDate = item.expectedDate;
      }
      if (!parcel.tracking && item.tracking) parcel.tracking = item.tracking;
      if (!parcel.carrier && item.carrier) parcel.carrier = item.carrier;
    });
    return [...map.values()].sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999"));
  }, [incomingItems, state.suppliers]);

  const totalValue = useMemo(() => incomingItems.reduce((a, i) => a + costOf(i), 0), [incomingItems]);
  const lateParcels = parcels.filter((p) => p.expectedDate && p.expectedDate < now);

  const patchParcel = (items: Item[], patch: Partial<Item>) =>
    items.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch }));

  const receive = (item: Item) => {
    const units = receiveInto(item, dispatch);
    toast(
      units > 1 ? `${units} exemplaires de « ${item.name || "Sans nom"} » entrés à l'unité` : `« ${item.name || "Sans nom"} » est en stock`,
      { label: "Voir le stock", onClick: () => navigate(links.stock({ status: "stock" })) },
    );
  };

  const openLitige = (item: Item) => {
    dispatch({
      type: "patchItem", id: item.id,
      patch: {
        litigeState: "en_cours",
        litigeCategory: item.litigeCategory || "Arrivage",
        notes: [item.notes, "Litige signalé à l'arrivage"].filter(Boolean).join("\n"),
      },
    });
    toast("Litige ouvert sur cette ligne", { label: "Voir SAV", onClick: () => navigate(links.sav()) });
  };

  const handleExpressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expressBrand.trim() && !expressName.trim()) {
      toast("Veuillez saisir au moins la marque ou le nom de l'article");
      return;
    }
    const newI: Item = {
      id: uid(), name: expressName.trim() || "Sans nom", brand: expressBrand.trim(),
      type: expressType.trim() || "Sneakers", size: expressSize.trim(),
      source: expressSource.trim() || "Sortie de colis Express", quantity: Math.max(1, expressQty),
      cost: num(expressCost), fees: num(expressFees), price: 0, platform: "", buyer: "", buyerUrl: "",
      saleFees: 0, shippingCost: 0, shippingPaid: 0, status: "stock", buyDate: today(), receiveDate: today(),
      saleDate: "", delivery: "non_payee", notes: "", photoId: null, createdAt: Date.now(), carrier: "",
      tracking: "", expectedDate: "", shipDate: "", shipping: "en_preparation", orderId: "", purchasePaid: true,
      lotTag: expressLotTag.trim() || `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
      autoReceive: false,
    };
    dispatch({ type: "upsertItem", item: newI });
    toast(`« ${newI.brand} ${newI.name} » ajouté au stock`, {
      label: "Voir le stock", onClick: () => navigate(links.stock({ status: "stock" })),
    });
    setExpressName(""); setExpressSize(""); setExpressCost(""); setExpressFees("");
  };

  return (
    <>
      <HeaderActions>
        <MenuButton
          label="+ Nouveau"
          options={[
            { value: "item", label: "Article seul", note: "Une pièce achetée à l'unité, pour le stock" },
            { value: "lot", label: "Lot", note: "Plusieurs articles, port réparti" },
            { value: "supplier", label: "Commande fournisseur", note: "Rattachée à un fournisseur suivi" },
            { value: "import", label: "Importer une facture", note: "Extrayez automatiquement les pièces d'un PDF" },
            { value: "express", label: "Achat in hand", note: "Saisie rapide d'un article déjà en main" },
            { value: "charge", label: "Charge d'activité", note: "Matériel, emballages, abonnement — pas du stock" },
          ]}
          onSelect={(v) => {
            if (v === "item") setNewItem(true);
            else if (v === "import") setImportingInvoice(true);
            else if (v === "express") setTab("express");
            else if (v === "charge") setAddingExpense(true);
            else setCreatingOrder({ mode: v as "lot" | "supplier" });
          }}
        />
      </HeaderActions>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Colis attendus" value={String(parcels.length)} meta={`${incomingItems.reduce((a, i) => a + qtyOf(i), 0)} article(s) en chemin`} tone="info" />
        <Kpi label="Capital en transit" value={eur(totalValue)} meta="Engagé, pas encore en stock" tone="warn" to={links.bilan()} hint="Bilan" />
        <Kpi label="En retard" value={String(lateParcels.length)} meta={lateParcels.length ? "Arrivée prévue dépassée" : "Aucun retard"} tone={lateParcels.length ? "warn" : "ok"} />
      </div>

      {tab === "colis" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ── 6 BOUTONS D'ACTIONS PERMANENTS EN CENTRALE ── */}
          <div className="card">
            <div className="card-h">
              <h3>⚡ Actions Rapides Centrale</h3>
            </div>
            <div className="card-b" style={{ padding: 16 }}>
              <div className="action-grid-3x3">
                <button type="button" className="action-grid-card" onClick={() => setNewItem(true)}>
                  <span className="icon">🛍️</span>
                  <span className="title">Article seul / In hand</span>
                  <span className="desc">Pièce achetée à l'unité ou en main propre, dispo immédiate</span>
                </button>

                <button type="button" className="action-grid-card" onClick={() => setCreatingOrder({ mode: "lot" })}>
                  <span className="icon">📦</span>
                  <span className="title">Lot d'articles</span>
                  <span className="desc">Plusieurs pièces avec port/douane répartis</span>
                </button>

                <button type="button" className="action-grid-card" onClick={() => setCreatingOrder({ mode: "supplier" })}>
                  <span className="icon">🏢</span>
                  <span className="title">Commande fournisseur</span>
                  <span className="desc">Rattachée à un fournisseur suivi</span>
                </button>

                <button type="button" className="action-grid-card glass-highlight" onClick={() => setImportingInvoice(true)}>
                  <span className="icon">📄</span>
                  <span className="title">Importer une facture</span>
                  <span className="desc">Extrayez automatiquement les pièces d'un PDF</span>
                </button>

                <button type="button" className="action-grid-card" onClick={() => navigate(links.sourcing())}>
                  <span className="icon">🛒</span>
                  <span className="title">Sourcer un produit</span>
                  <span className="desc">Ajouter à la recherche et négociation sourcing</span>
                </button>

                <button type="button" className="action-grid-card" onClick={() => setAddingExpense(true)}>
                  <span className="icon">🏷️</span>
                  <span className="title">Charge d'activité</span>
                  <span className="desc">Matériel, emballages ou abonnements</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── SECTION RÉCEPTION & DÉBALLAGE ── */}
          <div className="card">
            <div className="card-h">
              <h3>📦 Réception &amp; déballage ({parcels.length})</h3>
              <div className="spacer" />
              <Link to={links.stock({ status: "stock" })} className="hint-link">Voir le stock →</Link>
            </div>

            {parcels.length === 0 ? (
              <div className="card-b" style={{ padding: 24, textAlign: "center" }}>
                <h4 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: "var(--ink)" }}>📥 Aucun colis en attente</h4>
                <p className="hint" style={{ margin: 0 }}>Tous vos colis ont été déballés et réceptionnés en stock.</p>
              </div>
            ) : (
              <div className="parcel-grid" style={{ padding: 16 }}>
                {parcels.map((p) => {
                  const isLate = !!p.expectedDate && p.expectedDate < now;
                  return (
                    <article className={`parcel-card${isLate ? " late" : ""}`} key={p.orderId}>
                      <header className="parcel-head">
                        <div className="parcel-id">
                          <b>📦 {p.supplier}</b>
                          <span className="pill info">{p.qty} article{p.qty > 1 ? "s" : ""}</span>
                          <span className={`pill ${p.purchasePaid ? "good" : "bad"}`}>{p.purchasePaid ? "Réglé" : "À régler"}</span>
                          {isLate && <span className="pill bad">Retard</span>}
                        </div>
                        <button className="btn ok" onClick={() => setReceivingParcel(p.items)}>✓ Déballer tout ({eur2(p.total)})</button>
                      </header>

                      <div className="parcel-meta">
                        <InlineField value={p.carrier} placeholder="Transporteur" onCommit={(v) => patchParcel(p.items, { carrier: v })} width={130} />
                        {p.tracking ? (
                          <TrackingLink carrier={p.carrier} code={p.tracking} />
                        ) : (
                          <InlineField value={p.tracking} placeholder="Code de suivi" onCommit={(v) => patchParcel(p.items, { tracking: v })} width={140} />
                        )}
                        <InlineField value={p.expectedDate} type="date" placeholder="" onCommit={(v) => patchParcel(p.items, { expectedDate: v })} width={132} />
                        <span className="hint">
                          {p.expectedDate ? `Arrivée ${dshort(p.expectedDate)}` : "Date inconnue"}
                          {p.buyDate ? ` · commandé le ${dshort(p.buyDate)}` : ""}
                        </span>
                      </div>

                      <div className="twrap">
                        <table className="table-compact">
                          <thead>
                            <tr><th>Article</th><th>Marque</th><th>Taille</th><th className="r">Qté</th><th className="r">Coût</th><th className="r">Action</th></tr>
                          </thead>
                          <tbody>
                            {p.items.map((i) => (
                              <tr key={i.id}>
                                <td>
                                  <div className="cell-item">
                                    <Photo id={i.photoId} />
                                    <div className="cell-item-text">
                                      <button className="linkish ellipsis" onClick={() => setEditingItem(i)}>{i.name || "Sans nom"}</button>
                                      {(i.sku || i.condition) && (
                                        <div className="cell-item-tags">
                                          {i.sku && <span className="pill ghost">{i.sku}</span>}
                                          {i.condition && <span className="accent">{i.condition}</span>}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>{i.brand || "—"}</td>
                                <td>{i.size || "—"}</td>
                                <td className="r num">{qtyOf(i)}</td>
                                <td className="r num">{eur2(costOf(i))}</td>
                                <td className="r">
                                  <div className="rowact always">
                                    <button className="btn sm ok" onClick={() => receive(i)}>⇩ Stock</button>
                                    <button className="btn sm ghost" onClick={() => openLitige(i)}>Litige</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "express" && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
            <h3>🤝 Achat in hand</h3>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setTab("colis")}>← Retour aux colis</button>
          </div>
          <form onSubmit={handleExpressSubmit} className="card-b express-form">
            <div className="fgrid">
              <label className="field"><span>Marque *</span><input type="text" placeholder="ex. Nike, Adidas, Jordan…" value={expressBrand} onChange={(e) => setExpressBrand(e.target.value)} autoFocus /></label>
              <label className="field"><span>Modèle / nom produit</span><input type="text" placeholder="ex. Dunk Low Panda" value={expressName} onChange={(e) => setExpressName(e.target.value)} /></label>
              <label className="field"><span>Taille / pointure</span><input type="text" placeholder="ex. 42 / M / US 8.5" value={expressSize} onChange={(e) => setExpressSize(e.target.value)} /></label>
              <label className="field"><span>Catégorie</span><input type="text" placeholder="Sneakers, Vêtements…" value={expressType} onChange={(e) => setExpressType(e.target.value)} /></label>
              <label className="field"><span>Coût d'achat unitaire (€)</span><input type="number" step="0.01" placeholder="0.00" value={expressCost} onChange={(e) => setExpressCost(e.target.value)} /></label>
              <label className="field"><span>Frais d'approche / port (€)</span><input type="number" step="0.01" placeholder="0.00" value={expressFees} onChange={(e) => setExpressFees(e.target.value)} /></label>
              <label className="field"><span>Quantité</span><input type="number" min="1" value={expressQty} onChange={(e) => setExpressQty(parseInt(e.target.value) || 1)} /></label>
              <label className="field"><span>Source / fournisseur</span><input type="text" placeholder="ex. StockX, Vinted, grossiste…" value={expressSource} onChange={(e) => setExpressSource(e.target.value)} /></label>
              <label className="field">
                <span>Fait partie d'un lot ?</span>
                <select value={expressLotTag} onChange={(e) => setExpressLotTag(e.target.value)}>
                  <option value="">Non (Article solo)</option>
                  {[...new Set(state.items.map((i) => i.lotTag).filter(Boolean))].map((lot) => (
                    <option key={lot} value={lot}>{lot}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="btn primary express-submit">⚡ Valider et entrer en stock</button>
          </form>
        </div>
      )}

      {editingItem && (
        <ItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onDelete={(i) => { dispatch({ type: "removeItem", id: i.id }); toast("Article supprimé"); setEditingItem(null); }}
          onSell={() => { setEditingItem(null); navigate(links.stock()); }}
        />
      )}
      {receivingParcel && <ReceiveParcelModal items={receivingParcel} onClose={() => setReceivingParcel(null)} />}
      {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}
      {creatingOrder && (
        <OrderModal
          mode={creatingOrder.mode}
          defaultSource={creatingOrder.defaultSource}
          initialLines={creatingOrder.initialLines}
          onClose={() => setCreatingOrder(null)}
        />
      )}
      {addingExpense && <ExpenseModal expense={null} onClose={() => setAddingExpense(false)} />}
      {newItem && <ItemModal item={null} onClose={() => setNewItem(false)} />}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => setSelling(null)}
          onSold={(i) => {
            toast(`« ${i.name} » est passée en Ventes`);
            navigate(links.ventes({ platform: i.platform || undefined }));
          }}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
        />
      )}
      {importingInvoice && (
        <ImportInvoiceModal
          onClose={() => setImportingInvoice(false)}
          onConfirm={(source, lines) => {
            setImportingInvoice(false);
            setCreatingOrder({ mode: "supplier", defaultSource: source, initialLines: lines });
          }}
        />
      )}
    </>
  );
}
