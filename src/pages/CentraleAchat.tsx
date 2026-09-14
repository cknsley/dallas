import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Kpi, RangePicker } from "../components/ui";
import MenuButton from "../components/MenuButton";
import { useStore } from "../store/StoreContext";
import { costOf, filterTodosByDomain, qtyOf } from "../lib/calc";
import { useDateRange } from "../lib/useDateRange";
import { useSecteur } from "../lib/useSecteur";
import { dshort, eur, num, today } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import { useToast } from "../components/Toast";
import { DELIVERY_LABEL, SHIPPING_LABEL } from "../lib/constants";
import { fieldLabels, sectorStamp } from "../lib/sectorFields";
import type { Todo } from "../types";
import type { Item } from "../types";
import ItemModal from "../modals/ItemModal";
import ExpenseModal from "../modals/ExpenseModal";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";
import ImportInvoiceModal from "../modals/ImportInvoiceModal";

/** Ordre d'avancement d'un envoi, du plus tôt au plus abouti — sert à trier la colonne Livraison. */
const SHIP_RANK: Record<string, number> = {
  a_emballer: 0, a_imprimer: 1, en_preparation: 2, a_deposer: 3, livree: 4, recu: 5,
};

type Tab = "colis" | "express";

/**
 * Centrale d'achat : le cockpit du jour. Actions rapides pour faire entrer du stock,
 * et un aperçu "cette semaine" (Todo, Ventes, Livraison) pour ne rien laisser filer.
 * La réception des colis vit désormais sur la page Arrivage.
 */
export default function CentraleAchat() {
  const { state, dispatch, resolveAutoTodo } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const secteur = useSecteur();
  const isTcg = secteur.domain === "tcg";
  const labels = fieldLabels(secteur.domain);
  const { from: dateFrom, to: dateTo, setRange } = useDateRange("centrale");
  const [tab, setTab] = useState<Tab>("colis");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState<{ mode: "lot" | "supplier"; defaultSource?: string; initialLines?: OrderPresetLine[] } | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [newItem, setNewItem] = useState(false);

  const [expressBrand, setExpressBrand] = useState("");
  const [expressName, setExpressName] = useState("");
  const [expressType, setExpressType] = useState(isTcg ? "" : "Sneakers");
  const [expressSize, setExpressSize] = useState("");
  const [expressQty, setExpressQty] = useState(1);
  const [expressCost, setExpressCost] = useState("");
  const [expressFees, setExpressFees] = useState("");
  const [expressSource, setExpressSource] = useState("");
  const [expressLotTag, setExpressLotTag] = useState("");

  const now = today();

  const stockItems = useMemo(() => secteur.items.filter((i) => i.status === "stock"), [secteur.items]);
  const stockValue = useMemo(() => stockItems.reduce((a, i) => a + costOf(i), 0), [stockItems]);

  /** Todo actifs, triés par échéance la plus proche (sans date en dernier). */
  const activeTodos = useMemo(
    () => filterTodosByDomain(
      state.todos.filter((t: Todo) => t.col !== "termine"),
      secteur.domain,
      state.items
    ).sort((a: Todo, b: Todo) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
    [state.todos, secteur.domain, state.items],
  );

  /** Ventes qui attendent un règlement ou une expédition. */
  const ventesATraiter = useMemo(
    () => secteur.items.filter((i) => i.status === "vendu" && i.delivery !== "livree").sort((a, b) => (b.saleDate || "").localeCompare(a.saleDate || "")),
    [secteur.items],
  );

  /** Colis vendus pas encore reçus par l'acheteur. */
  const enLivraison = useMemo(
    () => secteur.items.filter((i) => i.status === "vendu" && i.shipping !== "recu").sort((a, b) => (SHIP_RANK[a.shipping] ?? 9) - (SHIP_RANK[b.shipping] ?? 9)),
    [secteur.items],
  );

  const completeTodo = (t: (typeof state.todos)[number]) => {
    if (t.auto) {
      const message = resolveAutoTodo(t);
      if (message) toast(message);
      return;
    }
    dispatch({ type: "patchTodo", id: t.id, patch: { col: "termine" } });
    toast("Tâche marquée comme faite");
  };

  const handleExpressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expressBrand.trim() && !expressName.trim()) {
      toast(`Veuillez saisir au moins la ${labels.brand.toLowerCase()} ou le nom de l'article`);
      return;
    }
    const newI: Item = {
      id: uid(), name: expressName.trim() || "Sans nom", brand: expressBrand.trim(),
      type: isTcg ? "Carte TCG" : expressType.trim() || "Sneakers", size: expressSize.trim(),
      source: expressSource.trim() || "Sortie de colis Express", quantity: Math.max(1, expressQty),
      cost: num(expressCost), fees: num(expressFees), price: 0, platform: "", buyer: "", buyerUrl: "",
      saleFees: 0, shippingCost: 0, shippingPaid: 0, status: "stock", buyDate: today(), receiveDate: today(),
      saleDate: "", delivery: "non_payee", notes: "", photoId: null, createdAt: Date.now(), carrier: "",
      tracking: "", expectedDate: "", shipDate: "", shipping: "en_preparation", orderId: "", purchasePaid: true,
      lotTag: expressLotTag.trim() || `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
      autoReceive: false,
      ...sectorStamp(secteur.domain, { brand: expressBrand.trim(), size: expressSize.trim(), set: expressType.trim() }),
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
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi
          label="Tâches actives"
          value={String(activeTodos.length)}
          meta={activeTodos.length ? "À traiter dans le Todo" : "Rien en attente"}
          tone={activeTodos.length ? "info" : "ok"}
          to={links.todo({ secteur: secteur.domain !== "all" ? secteur.domain : undefined })}
          hint="Voir"
        />
        <Kpi label="Ventes à traiter" value={String(ventesATraiter.length)} meta={ventesATraiter.length ? "Règlement ou envoi en attente" : "Tout est réglé"} tone={ventesATraiter.length ? "warn" : "ok"} to={links.ventes()} hint="Voir" />
        <Kpi label="Colis en livraison" value={String(enLivraison.length)} meta={enLivraison.length ? "Pas encore reçus par l'acheteur" : "Aucune livraison en cours"} tone={enLivraison.length ? "info" : "ok"} to={links.livraison()} hint="Voir" />
        <Kpi label="Stock actuel" value={eur(stockValue)} meta={`${stockItems.reduce((a, i) => a + qtyOf(i), 0)} article(s) disponibles`} tone="ok" to={links.stock({ status: "stock" })} hint="Voir" />
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

                <button type="button" className="action-grid-card" onClick={() => setImportingInvoice(true)}>
                  <span className="icon">📄</span>
                  <span className="title">Importer une facture</span>
                  <span className="desc">Extrayez automatiquement les pièces d'un PDF</span>
                </button>

                <button type="button" className="action-grid-card" onClick={() => navigate(links.sourcing({ secteur: secteur.domain !== "all" ? secteur.domain : undefined }))}>
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

          {/* ── CETTE SEMAINE : TODO / VENTES / LIVRAISON ── */}
          <div className="home-section" style={{ marginTop: 0 }}>
            <div className="home-section-title">
              <h2>🗓️ Cette semaine</h2>
              <span className="hint">Ce qui demande une action côté tâches, ventes et livraisons (J-7)</span>
            </div>

            <div className="kanban">
              <div className="kcol">
                <div className="kcol-h"><span className="t">📋 Todo</span><span className="c">{activeTodos.length}</span></div>
                <div className="kcol-b">
                  {activeTodos.length === 0 ? (
                    <div className="hint" style={{ padding: 8 }}>Rien à faire 🎉</div>
                  ) : (
                    activeTodos.slice(0, 6).map((t: Todo) => (
                      <div className="kcard" key={t.id}>
                        <div className="kcard-inner">
                          <div className="kcard-row"><span className="tx">{t.text}</span></div>
                          <div className="kcard-meta">
                            {t.dueDate && <span className={`pill ${t.dueDate < now ? "bad" : "neutral"}`}>{dshort(t.dueDate)}</span>}
                            <button className="btn sm ok" onClick={() => completeTodo(t)}>✓ Fait</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <Link to={links.todo({ secteur: secteur.domain !== "all" ? secteur.domain : undefined })} className="hint-link">Voir tout le Todo →</Link>
                </div>
              </div>

              <div className="kcol">
                <div className="kcol-h"><span className="t">🛒 Ventes</span><span className="c">{ventesATraiter.length}</span></div>
                <div className="kcol-b">
                  {ventesATraiter.length === 0 ? (
                    <div className="hint" style={{ padding: 8 }}>Aucune vente en attente</div>
                  ) : (
                    ventesATraiter.slice(0, 6).map((i) => (
                      <div className="kcard" key={i.id}>
                        <div className="kcard-inner">
                          <div className="kcard-row">
                            <button className="tx linkish" onClick={() => setEditingItem(i)}>{i.brand} {i.name || "Sans nom"}</button>
                          </div>
                          <div className="kcard-meta">
                            <span className="pill ghost">{i.platform || "Direct"}</span>
                            <span className={`pill ${i.delivery === "non_payee" ? "bad" : "warn"}`}>{DELIVERY_LABEL[i.delivery]}</span>
                            {i.delivery === "non_payee" ? (
                              <button className="btn sm ok" onClick={() => dispatch({ type: "patchItem", id: i.id, patch: { delivery: "commandee" } })}>💶 Marquer réglée</button>
                            ) : (
                              <button className="btn sm" onClick={() => navigate(links.livraison({ tab: "a_partir" }))}>🚚 Expédier</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <Link to={links.ventes()} className="hint-link">Voir toutes les ventes →</Link>
                </div>
              </div>

              <div className="kcol">
                <div className="kcol-h"><span className="t">🚚 Livraison</span><span className="c">{enLivraison.length}</span></div>
                <div className="kcol-b">
                  {enLivraison.length === 0 ? (
                    <div className="hint" style={{ padding: 8 }}>Aucune livraison en cours</div>
                  ) : (
                    enLivraison.slice(0, 6).map((i) => (
                      <div className="kcard" key={i.id}>
                        <div className="kcard-inner">
                          <div className="kcard-row">
                            <button className="tx linkish" onClick={() => setEditingItem(i)}>{i.brand} {i.name || "Sans nom"}</button>
                          </div>
                          <div className="kcard-meta">
                            <span className="pill info">{SHIPPING_LABEL[i.shipping]}</span>
                            <button className="btn sm" onClick={() => navigate(links.livraison())}>→ Livraison</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <Link to={links.livraison()} className="hint-link">Voir toutes les livraisons →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "express" && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
            <h3>🤝 Achat in hand</h3>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setTab("colis")}>← Retour</button>
          </div>
          <form onSubmit={handleExpressSubmit} className="card-b express-form">
            <div className="fgrid">
              <label className="field"><span>{labels.brand} *</span><input type="text" placeholder={isTcg ? labels.brandPlaceholder : "ex. Nike, Adidas, Jordan…"} value={expressBrand} onChange={(e) => setExpressBrand(e.target.value)} autoFocus /></label>
              <label className="field"><span>{labels.name}</span><input type="text" placeholder={labels.namePlaceholder} value={expressName} onChange={(e) => setExpressName(e.target.value)} /></label>
              <label className="field"><span>{isTcg ? labels.size : "Taille / pointure"}</span><input type="text" placeholder={isTcg ? labels.sizePlaceholder : "ex. 42 / M / US 8.5"} value={expressSize} onChange={(e) => setExpressSize(e.target.value)} /></label>
              <label className="field"><span>{isTcg ? labels.type : "Catégorie"}</span><input type="text" placeholder={labels.typePlaceholder} value={expressType} onChange={(e) => setExpressType(e.target.value)} /></label>
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
