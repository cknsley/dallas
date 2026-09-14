import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  Plus,
  Search,
} from "lucide-react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Modal, Photo, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { costOf, marginOf, purchaseFeesUnitOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import { useToast } from "../components/Toast";
import type { Item } from "../types";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import GradeRevealModal from "../modals/GradeRevealModal";

const TCG_GAMES = [
  { id: "all", label: "🔥 Tous les jeux" },
  { id: "pokemon", label: "⚡ Pokémon" },
  { id: "onepiece", label: "🏴‍☠️ One Piece" },
  { id: "yugioh", label: "👁️ Yu-Gi-Oh!" },
  { id: "magic", label: "🔮 Magic: The Gathering" },
  { id: "lorcana", label: "✨ Lorcana" },
  { id: "dragonball", label: "🐉 Dragon Ball" },
];

const TCG_GRADES = [
  "Raw (Near Mint)",
  "Raw (Excellent)",
  "PSA 10 Gem Mint",
  "PSA 9 Mint",
  "PSA 8 Near Mint",
  "BGS 10 Pristine",
  "BGS 9.5 Gem Mint",
  "PCA 10 Gem Mint",
  "PCA 9.5",
  "CGC 10",
  "Autre / Non gradée",
];

export default function TcgPage() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"inventory" | "grading" | "blister" | "sealed" | "case" | "sales">("inventory");
  const [selectedGame, setSelectedGame] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [sellingItem, setSellingItem] = useState<Item | null>(null);
  const [revealingItem, setRevealingItem] = useState<Item | null>(null);

  // New TCG item form state
  const [game, setGame] = useState("Pokémon");
  const [category, setCategory] = useState<"graded" | "raw" | "sealed" | "grading" | "blister" | "case">("graded");
  const [cardName, setCardName] = useState("");
  const [setName, setSetName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [grade, setGrade] = useState("PSA 10 Gem Mint");
  const [quantity, setQuantity] = useState(1);
  const [cost, setCost] = useState("");
  const [fees, setFees] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("Cardmarket");
  const [notes, setNotes] = useState("");

  // All TCG Items
  const tcgItems = useMemo(() => {
    return state.items.filter((i) => {
      const isExplicitTcg = i.isTcg || Boolean(i.tcgGame) || Boolean(i.tcgCategory);
      const isKeywordTcg = [i.name, i.brand, i.type, i.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .match(/(pokémon|pokemon|cardmarket|psa|bgs|pca|etb|booster|display|tcg|yu-gi-oh|lorcana|magic|one piece)/);
      return isExplicitTcg || isKeywordTcg;
    });
  }, [state.items]);

  // Filter by Game and Search Query
  const filteredItems = useMemo(() => {
    return tcgItems.filter((i) => {
      // Filter by Game
      if (selectedGame !== "all") {
        const itemGameStr = (i.tcgGame || i.brand || i.name || "").toLowerCase();
        if (selectedGame === "pokemon" && !itemGameStr.includes("poké") && !itemGameStr.includes("poke")) return false;
        if (selectedGame === "onepiece" && !itemGameStr.includes("one piece")) return false;
        if (selectedGame === "yugioh" && !itemGameStr.includes("yu-gi-oh") && !itemGameStr.includes("yugioh")) return false;
        if (selectedGame === "magic" && !itemGameStr.includes("magic")) return false;
        if (selectedGame === "lorcana" && !itemGameStr.includes("lorcana")) return false;
        if (selectedGame === "dragonball" && !itemGameStr.includes("dragon ball")) return false;
      }

      // Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = [i.name, i.brand, i.tcgSet, i.tcgGrade, i.buyer, i.source, i.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [tcgItems, selectedGame, searchQuery]);

  const stockItems = useMemo(() => filteredItems.filter((i) => i.status === "stock" || i.status === "arrivage"), [filteredItems]);
  const gradingItems = useMemo(() => stockItems.filter((i) => i.tcgCategory === "grading" || (i.tcgGrade && i.tcgGrade.toLowerCase().includes("gradation"))), [stockItems]);
  const gradedStock = useMemo(() => stockItems.filter((i) => i.tcgCategory === "graded" || (i.tcgGrade && i.tcgGrade.includes("PSA"))), [stockItems]);
  const blisterStock = useMemo(() => stockItems.filter((i) => i.tcgCategory === "blister" || (i.name && i.name.toLowerCase().includes("blister")) || (i.type && i.type.toLowerCase().includes("blister"))), [stockItems]);
  const caseStock = useMemo(() => stockItems.filter((i) => i.tcgCategory === "case" || (i.name && i.name.toLowerCase().includes("case")) || (i.type && i.type.toLowerCase().includes("case"))), [stockItems]);
  const sealedStock = useMemo(() => stockItems.filter((i) => i.tcgCategory === "sealed" || (i.type && i.type.match(/(display|etb|booster|coffret)/i))), [stockItems]);
  const soldItems = useMemo(() => filteredItems.filter((i) => i.status === "vendu"), [filteredItems]);

  const [inputMode, setInputMode] = useState<"unit" | "total">("unit");

  // KPIs
  const totalStockCost = useMemo(() => stockItems.reduce((a, i) => a + costOf(i), 0), [stockItems]);
  const totalStockRealValue = useMemo(() => {
    return stockItems.reduce((a, i) => {
      const q = qtyOf(i);
      const estUnit = num(i.price) || num(i.estimatedPrice) || (num(i.cost) + purchaseFeesUnitOf(i));
      return a + estUnit * q;
    }, 0);
  }, [stockItems]);

  const totalStockPotentialMarge = totalStockRealValue - totalStockCost;
  const potentialRoi = totalStockCost > 0 ? (totalStockPotentialMarge / totalStockCost) * 100 : 0;

  const totalSalesCa = useMemo(() => soldItems.reduce((a, i) => a + revenueOf(i), 0), [soldItems]);
  const totalSalesMarge = useMemo(() => soldItems.reduce((a, i) => a + marginOf(i), 0), [soldItems]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim()) {
      toast("Veuillez entrer le nom du produit ou de la carte");
      return;
    }

    const qtyNum = Math.max(1, quantity);
    const rawCost = num(cost);
    const rawPrice = num(price);

    const unitCost = inputMode === "unit" ? rawCost : (qtyNum > 0 ? rawCost / qtyNum : rawCost);
    const unitPrice = inputMode === "unit" ? rawPrice : (qtyNum > 0 ? rawPrice / qtyNum : rawPrice);

    const fullTitle = `${cardName.trim()}${cardNumber ? ` #${cardNumber.trim()}` : ""}${setName ? ` (${setName.trim()})` : ""}`;
    const newItem: Item = {
      id: uid(),
      name: fullTitle,
      brand: game,
      type: category === "sealed" ? "Display / Scellé TCG" : category === "graded" ? "Carte Gradée" : "Carte Raw",
      size: grade,
      source: source.trim() || "Cardmarket",
      quantity: qtyNum,
      cost: unitCost,
      fees: num(fees),
      price: unitPrice,
      estimatedPrice: unitPrice,
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
      delivery: "commandee",
      notes: notes.trim(),
      photoId: null,
      createdAt: Date.now(),
      carrier: "",
      tracking: "",
      expectedDate: "",
      shipDate: "",
      shipping: "en_preparation",
      orderId: "",
      purchasePaid: true,
      lotTag: `TCG-${game.toUpperCase()}`,
      autoReceive: false,
      isTcg: true,
      tcgGame: game,
      tcgCategory: category,
      tcgGrade: grade,
      tcgSet: setName.trim(),
    };

    dispatch({ type: "upsertItem", item: newItem });
    toast(`« ${newItem.name} » ajouté à votre stock TCG !`);
    setShowAddModal(false);
    setCardName("");
    setSetName("");
    setCardNumber("");
    setCost("");
    setFees("");
    setPrice("");
    setNotes("");
  };

  const renderPriceInfo = (item: Item) => {
    const qty = qtyOf(item);
    const unitCost = num(item.cost) + purchaseFeesUnitOf(item);
    const totalCost = costOf(item);
    const unitEst = num(item.price) || num(item.estimatedPrice) || unitCost;
    const totalEst = unitEst * qty;
    const margeEst = totalEst - totalCost;
    const roi = totalCost > 0 ? (margeEst / totalCost) * 100 : 0;

    return {
      costCell: (
        <td className="r num">
          {qty > 1 ? (
            <div>
              <div style={{ fontWeight: 600 }}>{eur2(unitCost)} <span style={{ fontSize: 10, color: "var(--ink-3)" }}>/u</span></div>
              <div className="hint" style={{ fontSize: 11, fontWeight: 500 }}>({eur(totalCost)} total)</div>
            </div>
          ) : (
            <div style={{ fontWeight: 600 }}>{eur2(totalCost)}</div>
          )}
        </td>
      ),
      priceCell: (
        <td className="r num">
          {qty > 1 ? (
            <div>
              <div style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(unitEst)} <span style={{ fontSize: 10, opacity: 0.8 }}>/u</span></div>
              <div className="hint" style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)" }}>({eur(totalEst)} total)</div>
            </div>
          ) : (
            <div style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(totalEst)}</div>
          )}
        </td>
      ),
      margeCell: (
        <td className="r num">
          <div style={{ fontWeight: 700, color: margeEst >= 0 ? "var(--ok)" : "var(--err)" }}>
            {margeEst >= 0 ? "+" : ""}{eur(margeEst)}
          </div>
          <div className="hint" style={{ fontSize: 11 }}>
            {roi >= 0 ? "+" : ""}{roi.toFixed(0)}% ROI
          </div>
        </td>
      ),
    };
  };

  return (
    <>
      <HeaderActions>
        <button
          type="button"
          className="btn primary"
          onClick={() => setShowAddModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={16} />
          <span>+ Article TCG / Carte</span>
        </button>
      </HeaderActions>

      {/* ── HIGH LEVEL TCG KPIS (MARGE EN PREMIER, VALEUR RÉELLE EN DEUXIÈME) ── */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi
          label="Ventes & Marge TCG"
          value={eur(totalSalesCa)}
          meta={`Marge réalisée : ${totalSalesMarge >= 0 ? "+" : ""}${eur(totalSalesMarge)}`}
          tone={totalSalesMarge >= 0 ? "ok" : "warn"}
          to={links.ventes()}
          hint="Ventes"
        />
        <Kpi
          label="Valeur Réelle du Stock"
          value={eur(totalStockRealValue)}
          meta={`Marge pot. : ${totalStockPotentialMarge >= 0 ? "+" : ""}${eur(totalStockPotentialMarge)} (${potentialRoi >= 0 ? "+" : ""}${potentialRoi.toFixed(1)}%)`}
          tone="ok"
          hint="Revente Estimée"
        />
        <Kpi
          label="Stock TCG Engagé"
          value={eur(totalStockCost)}
          meta={`${stockItems.reduce((a, i) => a + qtyOf(i), 0)} pièce(s) & cartes en stock`}
          tone="info"
          hint="Stock TCG"
        />
        <Kpi
          label="Displays, Blisters & Gradées"
          value={`${sealedStock.reduce((a, i) => a + qtyOf(i), 0)} scellés · ${blisterStock.reduce((a, i) => a + qtyOf(i), 0)} blisters · ${gradedStock.reduce((a, i) => a + qtyOf(i), 0)} gradées`}
          meta="Cartes, scellés & booster boxes"
          tone="warn"
          hint="Formats"
        />
      </div>

      {/* ── BARRE DE SÉLECTION DU JEU / LICENCE TCG ── */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
        }}
      >
        {TCG_GAMES.map((g) => {
          const active = selectedGame === g.id;
          return (
            <button
              key={g.id}
              type="button"
              className={`btn ${active ? "primary" : "ghost"}`}
              onClick={() => setSelectedGame(g.id)}
              style={{
                borderRadius: 20,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                whiteSpace: "nowrap",
                padding: "4px 12px",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* ── ONGLETS PRINCIPAUX ET BARRE DE RECHERCHE ── */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div
          className="card-h"
          style={{
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <Segmented<"inventory" | "grading" | "blister" | "sealed" | "case" | "sales">
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "inventory", label: `🃏 Cartes (${stockItems.length})` },
              { value: "grading", label: `⏳ Gradation (${gradingItems.length})` },
              { value: "blister", label: `🟡 Blisters (${blisterStock.length})` },
              { value: "sealed", label: `📦 Displays (${sealedStock.length})` },
              { value: "case", label: `🧱 Cases (${caseStock.length})` },
              { value: "sales", label: `🏷️ Ventes (${soldItems.length})` },
            ]}
          />

          <div className="spacer" />

          <div style={{ position: "relative", minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "var(--ink-3)" }} />
            <input
              type="search"
              placeholder="Chercher carte, PSA, set, licence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 30, height: 32, fontSize: 12 }}
            />
          </div>
        </div>

        {/* TAB 1: CARTES EN STOCK */}
        {activeTab === "inventory" && (
          <div className="card-b">
            {stockItems.length === 0 ? (
              <Empty glyph="🃏" title="Aucune carte TCG en stock">
                {searchQuery
                  ? "Aucune carte ne correspond à votre recherche."
                  : "Ajoutez vos premières cartes Pokémon, One Piece ou Magic pour commencer le suivi TCG."}
                <div style={{ marginTop: 14 }}>
                  <button type="button" className="btn primary" onClick={() => setShowAddModal(true)}>
                    + Ajouter une carte TCG
                  </button>
                </div>
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Carte / Produit TCG</th>
                      <th>Licence</th>
                      <th>Grade / État</th>
                      <th>Set / Extension</th>
                      <th className="r">Qté</th>
                      <th className="r">Prix Achat</th>
                      <th className="r">Prix Estimé</th>
                      <th className="r">Marge Est.</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockItems.map((item) => {
                      const p = renderPriceInfo(item);

                      return (
                        <tr key={item.id}>
                          <td className="shrink">
                            <Photo id={item.photoId} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="linkish ellipsis"
                              style={{ fontWeight: 700, fontSize: 13 }}
                              onClick={() => setEditingItem(item)}
                            >
                              {item.name || "Carte TCG"}
                            </button>
                            {item.notes && <div className="hint ellipsis" style={{ fontSize: 11 }}>{item.notes}</div>}
                          </td>
                          <td>
                            <span className="pill info" style={{ fontSize: 11 }}>
                              {item.tcgGame || item.brand || "TCG"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`pill ${
                                (item.tcgGrade || item.size || "").includes("PSA 10") || (item.tcgGrade || item.size || "").includes("BGS 10")
                                  ? "ok"
                                  : "ghost"
                              }`}
                              style={{ fontWeight: 600, fontSize: 11 }}
                            >
                              <Award size={11} style={{ marginRight: 3 }} />
                              {item.tcgGrade || item.size || "Raw"}
                            </span>
                          </td>
                          <td>
                            <span className="hint" style={{ fontSize: 12 }}>
                              {item.tcgSet || "—"}
                            </span>
                          </td>
                          <td className="r num">{qtyOf(item)}</td>
                          {p.costCell}
                          {p.priceCell}
                          {p.margeCell}
                          <td className="r">
                            <div className="rowact always">
                              <button
                                type="button"
                                className="btn sm ok"
                                onClick={() => setSellingItem(item)}
                              >
                                Vendre
                              </button>
                              <button
                                type="button"
                                className="btn sm ghost"
                                onClick={() => setEditingItem(item)}
                              >
                                ✎
                              </button>
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
        )}

        {/* TAB GRADATION: EN COURS DE GRADATION & NOTES À DÉCOUVRIR */}
        {activeTab === "grading" && (
          <div className="card-b">
            {gradingItems.length === 0 ? (
              <Empty glyph="⏳" title="Aucune carte actuellement en gradation">
                Toutes vos cartes soumises chez PSA, BGS ou PCA ont reçu leur note ou n'ont pas encore été envoyées.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Carte Envoyée</th>
                      <th>Licence & Set</th>
                      <th>Organisme</th>
                      <th>Statut / Note</th>
                      <th className="r">Coût d'Achat</th>
                      <th className="r">Est. Revente</th>
                      <th className="r">Marge Est.</th>
                      <th className="r">Action Reveal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradingItems.map((item) => {
                      const p = renderPriceInfo(item);
                      return (
                        <tr key={item.id}>
                          <td className="shrink"><Photo id={item.photoId} /></td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {item.notes && <div className="hint" style={{ fontSize: 11 }}>{item.notes}</div>}
                          </td>
                          <td>
                            <div>{item.tcgGame || item.brand || "TCG"}</div>
                            <div className="hint" style={{ fontSize: 11 }}>{item.tcgSet || "—"}</div>
                          </td>
                          <td><span className="pill info" style={{ fontSize: 11 }}>{item.gradingCompany || "PSA / BGS"}</span></td>
                          <td>
                            <span className="pill" style={{ background: "rgba(234, 179, 8, 0.2)", color: "#eab308", border: "1px solid rgba(234, 179, 8, 0.4)", fontWeight: 700, fontSize: 11 }}>
                              ⏳ Note à découvrir
                            </span>
                          </td>
                          {p.costCell}
                          {p.priceCell}
                          {p.margeCell}
                          <td className="r">
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setRevealingItem(item)}
                              style={{
                                background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)",
                                color: "#fff",
                                borderColor: "#ca8a04",
                                fontWeight: 800,
                                fontSize: 11,
                              }}
                            >
                              ✨ Révéler la note
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB BLISTERS & ARTSETS */}
        {activeTab === "blister" && (
          <div className="card-b">
            {blisterStock.length === 0 ? (
              <Empty glyph="🟡" title="Aucun blister ou artset en stock">
                Vous n'avez actuellement aucun booster sous blister rigide ou artset enregistré.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Blister / Artset</th>
                      <th>Licence</th>
                      <th>Set / Extension</th>
                      <th className="r">Qté</th>
                      <th className="r">Coût d'Achat</th>
                      <th className="r">Prix Estimé</th>
                      <th className="r">Marge Est.</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blisterStock.map((item) => {
                      const p = renderPriceInfo(item);
                      return (
                        <tr key={item.id}>
                          <td className="shrink"><Photo id={item.photoId} /></td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {item.notes && <div className="hint" style={{ fontSize: 11 }}>{item.notes}</div>}
                          </td>
                          <td><span className="pill info" style={{ fontSize: 11 }}>{item.tcgGame || item.brand || "TCG"}</span></td>
                          <td>{item.tcgSet || "—"}</td>
                          <td className="r num">{qtyOf(item)}</td>
                          {p.costCell}
                          {p.priceCell}
                          {p.margeCell}
                          <td className="r">
                            <button type="button" className="btn sm ok" onClick={() => setSellingItem(item)}>
                              Vendre
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DISPLAYS ET SCELLÉ */}
        {activeTab === "sealed" && (
          <div className="card-b">
            {sealedStock.length === 0 ? (
              <Empty glyph="📦" title="Aucun scellé ou display TCG">
                Vous n'avez actuellement aucun booster box, ETB ou coffret scellé en stock.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Article Scellé</th>
                      <th>Licence</th>
                      <th>Source / Provenance</th>
                      <th className="r">Qté</th>
                      <th className="r">Coût d'Achat</th>
                      <th className="r">Prix Estimé</th>
                      <th className="r">Marge Est.</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sealedStock.map((item) => {
                      const p = renderPriceInfo(item);
                      return (
                        <tr key={item.id}>
                          <td className="shrink"><Photo id={item.photoId} /></td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div className="hint" style={{ fontSize: 11 }}>{item.tcgSet || "Coffret Scellé"}</div>
                          </td>
                          <td><span className="pill info" style={{ fontSize: 11 }}>{item.tcgGame || item.brand || "TCG"}</span></td>
                          <td>{item.source || "Direct"}</td>
                          <td className="r num">{qtyOf(item)}</td>
                          {p.costCell}
                          {p.priceCell}
                          {p.margeCell}
                          <td className="r">
                            <button type="button" className="btn sm ok" onClick={() => setSellingItem(item)}>
                              Vendre
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB CASES & CARTONS SCELLÉS */}
        {activeTab === "case" && (
          <div className="card-b">
            {caseStock.length === 0 ? (
              <Empty glyph="🧱" title="Aucune case ou carton scellé en stock">
                Vous n'avez actuellement aucune case scellée de displays ou blisters enregistrée.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Case / Carton Scellé</th>
                      <th>Licence</th>
                      <th>Set / Extension</th>
                      <th className="r">Qté Cases</th>
                      <th className="r">Coût d'Achat</th>
                      <th className="r">Prix Estimé</th>
                      <th className="r">Marge Est.</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseStock.map((item) => {
                      const p = renderPriceInfo(item);
                      return (
                        <tr key={item.id}>
                          <td className="shrink"><Photo id={item.photoId} /></td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {item.notes && <div className="hint" style={{ fontSize: 11 }}>{item.notes}</div>}
                          </td>
                          <td><span className="pill info" style={{ fontSize: 11 }}>{item.tcgGame || item.brand || "TCG"}</span></td>
                          <td>{item.tcgSet || "—"}</td>
                          <td className="r num">{qtyOf(item)}</td>
                          {p.costCell}
                          {p.priceCell}
                          {p.margeCell}
                          <td className="r">
                            <button type="button" className="btn sm ok" onClick={() => setSellingItem(item)}>
                              Vendre
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: VENTES TCG */}
        {activeTab === "sales" && (
          <div className="card-b">
            {soldItems.length === 0 ? (
              <Empty glyph="🏷️" title="Aucune vente TCG enregistrée">
                Vos ventes de cartes et de scellé TCG apparaîtront ici.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Produit Vendu</th>
                      <th>Date Vente</th>
                      <th>Plateforme</th>
                      <th>Acheteur</th>
                      <th className="r">Prix Vente</th>
                      <th className="r">Marge Nette</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldItems.map((item) => {
                      const m = marginOf(item);
                      return (
                        <tr key={item.id}>
                          <td className="shrink"><Photo id={item.photoId} /></td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div className="hint" style={{ fontSize: 11 }}>{item.tcgGrade || item.size || "—"}</div>
                          </td>
                          <td className="nowrap">{dshort(item.saleDate)}</td>
                          <td><span className="pill ghost">{item.platform || "Cardmarket"}</span></td>
                          <td>{item.buyer || "—"}</td>
                          <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(revenueOf(item))}</td>
                          <td className={`r num ${m >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>
                            {eur(m)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL SAISIE RAPIDE ARTICLE TCG ── */}
      {showAddModal && (
        <Modal
          title="🎴 Saisie Rapide d'un Produit / Carte TCG"
          onClose={() => setShowAddModal(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setShowAddModal(false)}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={handleAddSubmit}>
                ⚡ Enregistrer en Stock TCG
              </button>
            </>
          }
        >
          <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="fgrid">
              <label className="field">
                <span>Jeu / Licence *</span>
                <select value={game} onChange={(e) => setGame(e.target.value)}>
                  <option value="Pokémon">⚡ Pokémon</option>
                  <option value="One Piece">🏴‍☠️ One Piece</option>
                  <option value="Yu-Gi-Oh!">👁️ Yu-Gi-Oh!</option>
                  <option value="Magic">🔮 Magic: The Gathering</option>
                  <option value="Lorcana">✨ Lorcana</option>
                  <option value="Dragon Ball">🐉 Dragon Ball</option>
                  <option value="Autre TCG">🎴 Autre Licence TCG</option>
                </select>
              </label>

              <label className="field">
                <span>Format du Produit *</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
                  <option value="graded">🏆 Carte Gradée (PSA, BGS, PCA)</option>
                  <option value="grading">⏳ En gradation chez PSA/BGS (Note à découvrir ✨)</option>
                  <option value="raw">🃏 Carte Raw / À l'unité</option>
                  <option value="blister">🟡 Blister / Artset (Booster sous blister)</option>
                  <option value="sealed">📦 Display / ETB / Scellé</option>
                  <option value="case">🧱 Case / Carton Scellé (Case Displays/Blisters)</option>
                </select>
              </label>

              <label className="field col-2">
                <span>Nom de la Carte ou du Produit *</span>
                <input
                  type="text"
                  placeholder="ex. Charizard VMAX Alternate Art / Booster Box 151"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Extension / Set</span>
                <input
                  type="text"
                  placeholder="ex. 151, Évolution Céleste, OP-05"
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Numéro de carte (si applicable)</span>
                <input
                  type="text"
                  placeholder="ex. 154/172"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Grade / État de conservation</span>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {TCG_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Quantité</span>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </label>

              {/* COMMUTATEUR PRIX UNITAIRE VS PRIX TOTAL */}
              <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-sub)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line-2)", marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>Mode de Saisie des Prix :</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={`btn sm ${inputMode === "unit" ? "primary" : "ghost"}`}
                    onClick={() => setInputMode("unit")}
                    style={{ fontSize: 11, padding: "4px 10px" }}
                  >
                    💰 Prix Unitaire (par pièce)
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${inputMode === "total" ? "primary" : "ghost"}`}
                    onClick={() => setInputMode("total")}
                    style={{ fontSize: 11, padding: "4px 10px" }}
                  >
                    📦 Prix Total (du lot entier)
                  </button>
                </div>
              </div>

              <label className="field">
                <span>{inputMode === "unit" ? "Coût d'acquisition Unitaire (€/pc) *" : "Coût d'acquisition Total du Lot (€) *"}</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
                {quantity > 1 && num(cost) > 0 && (
                  <span className="hint" style={{ fontSize: 11, marginTop: 2, display: "block", color: "var(--accent)" }}>
                    {inputMode === "unit"
                      ? `Total Lot (x${quantity}) : ${eur(num(cost) * quantity)}`
                      : `Soit ${eur2(num(cost) / quantity)} / pièce`}
                  </span>
                )}
              </label>

              <label className="field">
                <span>{inputMode === "unit" ? "Prix Estimé Unitaire (€/pc)" : "Prix Estimé Total du Lot (€)"}</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                {quantity > 1 && num(price) > 0 && (
                  <span className="hint" style={{ fontSize: 11, marginTop: 2, display: "block", color: "var(--ok)" }}>
                    {inputMode === "unit"
                      ? `Total Revente (x${quantity}) : ${eur(num(price) * quantity)}`
                      : `Soit ${eur2(num(price) / quantity)} / pièce`}
                  </span>
                )}
              </label>

              <label className="field">
                <span>Source d'Achat</span>
                <input
                  type="text"
                  placeholder="Cardmarket, Vinted, eBay, Brocante..."
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>

              <label className="field col-2">
                <span>Notes &amp; Numéro de Certificat (optionnel)</span>
                <input
                  type="text"
                  placeholder="ex. Certificat PSA #8291048, coffret scellé parfait état..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </form>
        </Modal>
      )}

      {/* ── MODALS ÉDITION / VENTE ── */}
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
            setSellingItem(editingItem);
            setEditingItem(null);
          }}
        />
      )}

      {sellingItem && (
        <SellModal
          item={sellingItem}
          onClose={() => setSellingItem(null)}
          onSold={(i) => {
            toast(`« ${i.name} » marquée comme vendue !`);
            navigate(links.ventes());
          }}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
        />
      )}

      {revealingItem && (
        <GradeRevealModal
          item={revealingItem}
          onClose={() => setRevealingItem(null)}
        />
      )}
    </>
  );
}
