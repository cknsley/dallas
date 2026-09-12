import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Segmented, Photo } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { eur, eur2, today } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import { useToast } from "../components/Toast";
import type { Item } from "../types";
import TrackingLink from "../components/TrackingLink";
import ItemModal from "../modals/ItemModal";
import ScannerModal from "../components/ScannerModal";

export default function Arrivage() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"colis" | "express" | "history">("colis");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Formulaire Saisie Express
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

  // Tous les articles en arrivage
  const incomingItems = useMemo(
    () => state.items.filter((i) => i.status === "arrivage"),
    [state.items]
  );

  // Groupement par commande / colis d'origine
  const parcels = useMemo(() => {
    const map = new Map<string, { orderId: string; items: Item[]; supplier?: string; tracking?: string; carrier?: string; expectedDate?: string }>();
    incomingItems.forEach((item) => {
      const key = item.orderId || `solo-${item.id}`;
      if (!map.has(key)) {
        const sup = state.suppliers.find((s) => s.id === item.source || s.name === item.source);
        map.set(key, {
          orderId: key,
          items: [],
          supplier: sup?.name || item.source || "Fournisseur direct",
          tracking: item.tracking,
          carrier: item.carrier,
          expectedDate: item.expectedDate,
        });
      }
      map.get(key)!.items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => (a.expectedDate || "").localeCompare(b.expectedDate || ""));
  }, [incomingItems, state.suppliers]);

  // Capital en cours de transport
  const totalValue = useMemo(
    () => incomingItems.reduce((acc, i) => acc + costOf(i), 0),
    [incomingItems]
  );

  // Articles en stock (Arrivés)
  const stockItems = useMemo(
    () => state.items.filter((i) => i.status === "stock"),
    [state.items]
  );

  const totalStockQty = useMemo(
    () => stockItems.reduce((acc, i) => acc + qtyOf(i), 0),
    [stockItems]
  );

  // Articles récents entrés en stock (les 12 derniers)
  const recentStock = useMemo(
    () => state.items.filter((i) => i.status === "stock").sort((a, b) => b.createdAt - a.createdAt).slice(0, 12),
    [state.items]
  );

  // Action : Déballer tout un colis (Valider l'entrée en stock de tout le colis)
  const receiveParcel = (items: Item[]) => {
    items.forEach((i) => {
      dispatch({
        type: "patchItem",
        id: i.id,
        patch: { status: "stock", receiveDate: today() },
      });
    });
    toast(`📦 ${items.length} article(s) entré(s) en stock avec succès !`);
  };

  // Action : Soumission de la Saisie Express
  const handleExpressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expressBrand.trim() && !expressName.trim()) {
      toast("Veuillez saisir au moins la marque ou le nom de l'article");
      return;
    }
    const cost = parseFloat(expressCost) || 0;
    const fees = parseFloat(expressFees) || 0;
    const newItem: Item = {
      id: uid(),
      name: expressName.trim() || "Sans nom",
      brand: expressBrand.trim(),
      type: expressType.trim() || "Sneakers",
      size: expressSize.trim(),
      source: expressSource.trim() || "Sortie de colis Express",
      quantity: Math.max(1, expressQty),
      cost,
      fees,
      price: 0,
      platform: "",
      buyer: "",
      buyerUrl: "",
      saleFees: 0,
      shippingCost: 0,
      shippingPaid: 0,
      status: "stock",
      buyDate: today(),
      receiveDate: today(),
      saleDate: "",
      delivery: "non_payee",
      notes: "",
      photoId: null,
      createdAt: Date.now(),
      carrier: "",
      tracking: "",
      expectedDate: "",
      shipDate: "",
      shipping: "en_preparation",
      orderId: "",
      purchasePaid: true,
      lotTag: expressLotTag.trim() || `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
      autoReceive: false,
    };

    dispatch({ type: "upsertItem", item: newItem });
    toast(`✓ « ${newItem.brand} ${newItem.name} » ajouté directement au Stock !`);

    setExpressName("");
    setExpressSize("");
    setExpressCost("");
    setExpressFees("");
  };

  return (
    <>
      <HeaderActions>
        <Segmented<"colis" | "express" | "history">
          value={tab}
          onChange={setTab}
          options={[
            { value: "colis", label: `Colis attendus (${incomingItems.length})` },
            { value: "express", label: "⚡ Saisie Express Déballage" },
            { value: "history", label: "Dernières Entrées" },
          ]}
        />
        <button className="btn primary" onClick={() => setShowScanner(true)}>
          📸 Scanner Caméra iPhone & IA
        </button>
        <button className="btn ghost" onClick={() => setTab("express")}>
          ⚡ Saisie Express
        </button>
      </HeaderActions>

      {/* KPI Header Arrivage */}
      <div className="kpi-grid">
        <div className="kpi info">
          <div className="lbl">Colis Arrivés & En Transit</div>
          <div className="val">{parcels.length}</div>
          <div className="meta">{incomingItems.reduce((acc, i) => acc + qtyOf(i), 0)} article(s) attendu(s)</div>
        </div>
        <div className="kpi warn">
          <div className="lbl">Capital en Arrivage (Transit)</div>
          <div className="val">{eur(totalValue)}</div>
          <div className="meta">{incomingItems.length} article(s) en cours d'acheminement</div>
        </div>
        <div className="kpi ok">
          <div className="lbl">Articles en stock physique</div>
          <div className="val">{totalStockQty}</div>
          <div className="meta">Articles physiquement en stock & prêts à la vente</div>
        </div>
      </div>

      {tab === "colis" ? (
        <div className="cols">
          <div className="card">
            <div className="card-h">
              <h3>Réception & Sortie de Colis (Déballage)</h3>
              <div className="spacer" />
              <span className="hint">
                Validez la réception pour faire entrer les articles directement en Stock
              </span>
            </div>

            {parcels.length === 0 ? (
              <Empty glyph="📥" title="Aucun colis en attente de déballage">
                Tous vos achats ont été réceptionnés et sont actifs en Stock.
                <div style={{ marginTop: 12 }}>
                  <button className="btn primary" onClick={() => setTab("express")}>
                    ⚡ Passer en Saisie Express Déballage
                  </button>
                </div>
              </Empty>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 16, padding: 16 }}>
                {parcels.map((p) => (
                  <div
                    key={p.orderId}
                    style={{
                      padding: 16,
                      borderRadius: "var(--r)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>📦 Colis : {p.supplier}</span>
                          <span className="pill info">{p.items.length} article(s)</span>
                        </div>
                        <div className="hint" style={{ marginTop: 2 }}>
                          {p.expectedDate ? (
                            <span>Arrivée prévue : <b>{p.expectedDate}</b> {p.expectedDate < now ? "⚠️ (En retard)" : ""}</span>
                          ) : (
                            "Date d'arrivée non spécifiée"
                          )}{" "}
                          {p.tracking && (
                            <>
                              · Suivi : <TrackingLink carrier={p.carrier || ""} code={p.tracking} />
                            </>
                          )}
                        </div>
                      </div>

                      <button className="btn ok" onClick={() => receiveParcel(p.items)}>
                        ✓ Déballer tout ({eur2(p.items.reduce((a, i) => a + costOf(i), 0))})
                      </button>
                    </div>

                    {/* Liste des articles dans ce colis */}
                    <div className="twrap" style={{ background: "var(--surface)", overflowX: "auto" }}>
                      <table className="table-compact">
                        <thead>
                          <tr>
                            <th>Article</th>
                            <th>Marque</th>
                            <th>Taille</th>
                            <th className="r">Qté</th>
                            <th className="r">Coût</th>
                            <th className="r">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.items.map((i) => (
                            <tr key={i.id}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <Photo id={i.photoId} />
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                    <button
                                      className="linkish ellipsis"
                                      style={{ textAlign: "left", fontWeight: 600 }}
                                      onClick={() => setEditingItem(i)}
                                      title="Cliquer pour éditer l'article (SKU, état...)"
                                    >
                                      {i.name || "Sans nom"}
                                    </button>
                                    <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
                                      {i.sku && <span className="pill ghost" style={{ padding: "0 4px" }}>{i.sku}</span>}
                                      {i.condition && <span style={{ color: "var(--accent)" }}>{i.condition}</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>{i.brand || "—"}</td>
                              <td>{i.size || "—"}</td>
                              <td className="r num">{qtyOf(i)}</td>
                              <td className="r num">{eur2(costOf(i))}</td>
                              <td className="r">
                                <button
                                  className="btn sm ok"
                                  style={{ whiteSpace: "nowrap" }}
                                  onClick={() => {
                                    dispatch({
                                      type: "patchItem",
                                      id: i.id,
                                      patch: { status: "stock", receiveDate: today() },
                                    });
                                    toast(`✓ « ${i.name} » est entré en stock !`);
                                  }}
                                >
                                  ✓ Stock
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === "express" ? (
        <div className="card">
          <div className="card-h">
            <h3>⚡ Saisie Express d'Arrivage & Déballage Massif</h3>
            <div className="spacer" />
            <span className="hint">Pour scaller et faire entrer à la chaîne 20-50 pièces déballées</span>
          </div>

          <form onSubmit={handleExpressSubmit} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              <label className="field">
                <span>Marque *</span>
                <input
                  type="text"
                  placeholder="ex. Nike, Adidas, Jordan..."
                  value={expressBrand}
                  onChange={(e) => setExpressBrand(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Modèle / Nom produit</span>
                <input
                  type="text"
                  placeholder="ex. Dunk Low Panda, Yeezy 350..."
                  value={expressName}
                  onChange={(e) => setExpressName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Taille / Pointure</span>
                <input
                  type="text"
                  placeholder="ex. 42 / M / US 8.5"
                  value={expressSize}
                  onChange={(e) => setExpressSize(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Catégorie</span>
                <input
                  type="text"
                  placeholder="Sneakers, Vêtements, Accessoires..."
                  value={expressType}
                  onChange={(e) => setExpressType(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Coût d'achat unitaire (€)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={expressCost}
                  onChange={(e) => setExpressCost(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Frais d'approche / Port (€)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={expressFees}
                  onChange={(e) => setExpressFees(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Quantité d'exemplaires</span>
                <input
                  type="number"
                  min="1"
                  value={expressQty}
                  onChange={(e) => setExpressQty(parseInt(e.target.value) || 1)}
                />
              </label>

              <label className="field">
                <span>Source / Fournisseur</span>
                <input
                  type="text"
                  placeholder="ex. StockX, Vinted, Grossiste..."
                  value={expressSource}
                  onChange={(e) => setExpressSource(e.target.value)}
                />
              </label>

              <label className="field" style={{ gridColumn: "span 2" }}>
                <span>Tag Lot / Emplacement Étagère</span>
                <input
                  type="text"
                  placeholder="ex. BAC-A1, LOT-COLIS-14"
                  value={expressLotTag}
                  onChange={(e) => setExpressLotTag(e.target.value)}
                />
              </label>

              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                <button type="submit" className="btn primary" style={{ width: "100%", padding: "11px 24px", fontSize: 13.5, fontWeight: 700 }}>
                  ⚡ Valider & Entrer directement en Stock (Entrée rapide)
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Derniers articles réceptionnés</h3>
            <div className="spacer" />
            <Link to={links.stock()} className="hint-link">Voir tout le Stock →</Link>
          </div>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Marque</th>
                  <th>Taille</th>
                  <th className="r">Qté</th>
                  <th className="r">Coût</th>
                  <th>Statut</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentStock.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Photo id={i.photoId} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button
                            className="linkish ellipsis"
                            style={{ textAlign: "left", fontWeight: 600 }}
                            onClick={() => setEditingItem(i)}
                          >
                            {i.name || "Sans nom"}
                          </button>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
                            {i.sku && <span className="pill ghost" style={{ padding: "0 4px" }}>{i.sku}</span>}
                            {i.condition && <span style={{ color: "var(--accent)" }}>{i.condition}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{i.brand || "—"}</td>
                    <td>{i.size || "—"}</td>
                    <td className="r num">{qtyOf(i)}</td>
                    <td className="r num">{eur2(costOf(i))}</td>
                    <td><span className="pill stock">En stock</span></td>
                    <td className="r">
                      <button className="btn sm ghost" onClick={() => setEditingItem(i)}>Éditer ✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingItem && (
        <ItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onDelete={(i) => {
            dispatch({ type: "removeItem", id: i.id });
            toast("Article supprimé");
            setEditingItem(null);
          }}
          onSell={() => {
            setEditingItem(null);
            navigate(links.stock());
          }}
        />
      )}

      {showScanner && (
        <ScannerModal onClose={() => setShowScanner(false)} />
      )}
    </>
  );
}
