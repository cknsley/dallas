import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Zap,
  ShoppingBag,
  Target,
  Award,
  Layers,
  ShoppingCart as ShoppingIcon,
  Search,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import { HeaderActions } from "../components/Layout";
import { BarList, Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  costOf,
  filterItemsByDomain,
  marginOf,
  periodRange,
  qtyOf,
  revenueOf,
  saleCostsOf,
  soldItems,
  type Dimension,
} from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { links } from "../lib/links";
import type { Item, Period } from "../types";

type PerfTab = "sales_list" | "channels" | "categories" | "velocity";
type SalesSortKey = "saleDate" | "marge" | "price" | "cost" | "daysInStock";

export default function PerformancePage() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [period, setPeriod] = usePref<Period>("perf_period", "month");
  const [domain, setDomain] = usePref<"all" | "fashion" | "tcg">("perfDomain", "all");
  const [searchParams] = useSearchParams();

  // Le domaine suit l'URL : un secteur le pré-sélectionne, son absence rétablit la vue
  // d'ensemble — sinon la préférence mémorisée filtrerait encore une vue dite collective.
  useEffect(() => {
    const secteur = searchParams.get("secteur");
    setDomain(secteur === "tcg" || secteur === "fashion" ? secteur : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState<PerfTab>("sales_list");
  const [selectedDim, setSelectedDim] = useState<Dimension>("brand");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SalesSortKey>("saleDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const domainItems = useMemo(() => filterItemsByDomain(state.items, domain), [state.items, domain]);
  const range = useMemo(() => periodRange(period), [period]);
  const list = useMemo(() => soldItems(domainItems, range), [domainItems, range]);

  // Overall Stock Sell-Through Metrics
  const totalStockCount = useMemo(
    () => domainItems.reduce((a, i) => a + qtyOf(i), 0),
    [domainItems]
  );
  const totalSoldAllTime = useMemo(
    () => domainItems.filter((i) => i.status === "vendu").reduce((a, i) => a + qtyOf(i), 0),
    [domainItems]
  );
  const sellThroughRate = totalStockCount > 0 ? (totalSoldAllTime / totalStockCount) * 100 : 0;

  // Key Financial Metrics
  const ca = useMemo(() => list.reduce((a, i) => a + revenueOf(i), 0), [list]);
  const totalCost = useMemo(() => list.reduce((a, i) => a + costOf(i), 0), [list]);
  const netMarge = useMemo(() => list.reduce((a, i) => a + marginOf(i), 0), [list]);
  const margePct = ca > 0 ? (netMarge / ca) * 100 : 0;
  const totalQty = useMemo(() => list.reduce((a, i) => a + qtyOf(i), 0), [list]);
  const avgBasket = totalQty > 0 ? ca / totalQty : 0;
  const avgProfitPerPiece = totalQty > 0 ? netMarge / totalQty : 0;
  const roiGlobal = totalCost > 0 ? (netMarge / totalCost) * 100 : 0;

  // Average days to sell
  const averageDaysToSell = useMemo(() => {
    const valid = list.filter((i) => i.buyDate && i.saleDate);
    if (valid.length === 0) return null;
    const totalDays = valid.reduce((a, i) => {
      const bTime = new Date(i.buyDate).getTime();
      const sTime = new Date(i.saleDate).getTime();
      const diff = Math.max(0, (sTime - bTime) / (1000 * 60 * 60 * 24));
      return a + diff;
    }, 0);
    return Math.round(totalDays / valid.length);
  }, [list]);

  // Helper for single item days in stock
  const getDaysInStock = (i: Item): number | null => {
    if (!i.buyDate || !i.saleDate) return null;
    const bTime = new Date(i.buyDate).getTime();
    const sTime = new Date(i.saleDate).getTime();
    return Math.max(0, Math.round((sTime - bTime) / (1000 * 60 * 60 * 24)));
  };

  // Filtered & Sorted Sales List
  const processedSalesList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = list.filter((i) => {
      if (!q) return true;
      const haystack = [i.name, i.brand, i.buyer, i.platform, i.type, i.sku]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortKey === "saleDate") {
        valA = a.saleDate || "";
        valB = b.saleDate || "";
      } else if (sortKey === "marge") {
        valA = marginOf(a);
        valB = marginOf(b);
      } else if (sortKey === "price") {
        valA = revenueOf(a);
        valB = revenueOf(b);
      } else if (sortKey === "cost") {
        valA = costOf(a);
        valB = costOf(b);
      } else if (sortKey === "daysInStock") {
        valA = getDaysInStock(a) ?? -1;
        valB = getDaysInStock(b) ?? -1;
      }

      if (valA === valB) return b.createdAt - a.createdAt;
      return (valA > valB ? 1 : -1) * dir;
    });
  }, [list, searchQuery, sortKey, sortDir]);

  const toggleSort = (key: SalesSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Breakdown by Platform
  const platformStats = useMemo(() => {
    const map = new Map<
      string,
      {
        platform: string;
        qty: number;
        ca: number;
        marge: number;
        fees: number;
        avgPrice: number;
        margeRate: number;
      }
    >();
    list.forEach((i) => {
      const p = i.platform?.trim() || "Vente Directe";
      const cur = map.get(p) || {
        platform: p,
        qty: 0,
        ca: 0,
        marge: 0,
        fees: 0,
        avgPrice: 0,
        margeRate: 0,
      };
      const q = qtyOf(i);
      const rev = revenueOf(i);
      const m = marginOf(i);
      const f = saleCostsOf(i);
      cur.qty += q;
      cur.ca += rev;
      cur.marge += m;
      cur.fees += f;
      map.set(p, cur);
    });

    return Array.from(map.values())
      .map((p) => ({
        ...p,
        avgPrice: p.qty > 0 ? p.ca / p.qty : 0,
        margeRate: p.ca > 0 ? (p.marge / p.ca) * 100 : 0,
      }))
      .sort((a, b) => b.ca - a.ca);
  }, [list]);

  const topPlatform = platformStats.length > 0 ? platformStats[0] : null;

  // Breakdown by Brand / Category / Type
  const dimensionStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        qty: number;
        ca: number;
        marge: number;
        margePct: number;
        shareOfCa: number;
      }
    >();

    list.forEach((i) => {
      let key = "";
      if (selectedDim === "brand") key = i.brand?.trim() || "Sans Marque";
      else if (selectedDim === "type") key = i.type?.trim() || "Autre Produit";
      else if (selectedDim === "size") key = i.size?.trim() || "Taille Unique";
      else key = i.name?.trim() || "Article";

      const cur = map.get(key) || {
        key,
        qty: 0,
        ca: 0,
        marge: 0,
        margePct: 0,
        shareOfCa: 0,
      };
      const q = qtyOf(i);
      cur.qty += q;
      cur.ca += revenueOf(i);
      cur.marge += marginOf(i);
      map.set(key, cur);
    });

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        margePct: r.ca > 0 ? (r.marge / r.ca) * 100 : 0,
        shareOfCa: ca > 0 ? (r.ca / ca) * 100 : 0,
      }))
      .sort((a, b) => b.ca - a.ca);
  }, [list, selectedDim, ca]);

  return (
    <>
      <HeaderActions>
        <Segmented<"all" | "fashion" | "tcg">
          value={domain}
          onChange={setDomain}
          options={[
            { value: "all", label: "🌐 Tout" },
            { value: "fashion", label: "👕 Vêtements & Fashion" },
            { value: "tcg", label: "🃏 TCG & Cartes" },
          ]}
        />
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois en cours" },
            { value: "quarter", label: "Ce trimestre" },
            { value: "year", label: "Année en cours" },
            { value: "all", label: "Depuis le début" },
          ]}
        />
      </HeaderActions>

      {/* ── HIGH LEVEL SALES KPIS ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          label="Chiffre d'Affaires Ventes"
          value={eur(ca)}
          meta={`${totalQty} pièce(s) vendue(s) · ${range.label}`}
          tone="info"
          to={links.ventes()}
          hint="Ventes"
        />
        <Kpi
          label="Marge Nette Ventes"
          value={eur(netMarge)}
          meta={`${pct(margePct)} du CA · ROI ${pct(roiGlobal)}`}
          tone={netMarge >= 0 ? "ok" : "warn"}
          to={links.bilan()}
          hint="Bilan"
        />
        <Kpi
          label="Délai Moyen d'Écoulement"
          value={averageDaysToSell !== null ? `${averageDaysToSell} jours` : "–"}
          meta="Temps moyen en stock avant vente"
          tone="ok"
        />
        <Kpi
          label="Panier Moyen & Gain / Pièce"
          value={eur(avgBasket)}
          meta={`Marge moyenne : +${eur(avgProfitPerPiece)} / art.`}
          tone="info"
        />
      </div>

      {/* ── SYNTHÈSE SMART STRATÉGIQUE DES VENTEMENT ── */}
      {list.length > 0 && (
        <div
          className="note ok"
          style={{
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 10,
          }}
        >
          <Zap size={20} style={{ color: "var(--ok)", flexShrink: 0 }} />
          <div style={{ fontSize: 13, flex: 1 }}>
            <b>Synthèse d'Activité :</b>{" "}
            {topPlatform
              ? `Canal dominant : ${topPlatform.platform} (${eur(topPlatform.ca)} CA, ${pct(topPlatform.margeRate)} de marge)`
              : "Ventes actives"}
            {" · "}
            {averageDaysToSell !== null ? `Écoulement moyen en ${averageDaysToSell} jours` : ""}
            {" · "}
            Marge nette globale de {pct(margePct)} sur la période.
          </div>
        </div>
      )}

      {/* ── ONGLETS DE NAVIGATION DANS PERFORMANCES ── */}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "sales_list", label: "📦 Liste des Ventes Conclues", icon: ShoppingIcon },
          { id: "channels", label: "🛍️ Canaux & Plateformes", icon: ShoppingBag },
          { id: "categories", label: "🏷️ Marque & Catégorie", icon: Layers },
          { id: "velocity", label: "⚡ Vitesse & Écoulement", icon: Zap },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`btn ${active ? "primary" : "ghost"}`}
              onClick={() => setActiveTab(t.id as PerfTab)}
              style={{
                borderRadius: 20,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1 : LISTE DÉTAILLÉE DES VENTES PIÈCE PAR PIÈCE ── */}
      {activeTab === "sales_list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h" style={{ flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingIcon size={18} style={{ color: "var(--accent)" }} /> Liste des Ventes Conclues ({processedSalesList.length})
              </h3>
              <div className="spacer" />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative", minWidth: 200 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "var(--ink-3)" }} />
                  <input
                    type="search"
                    placeholder="Filtrer vente, client, marque..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: 30, height: 32, fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
            <div className="card-b">
              {processedSalesList.length === 0 ? (
                <Empty glyph="🛒" title="Aucune vente trouvée">
                  {searchQuery ? "Aucune vente ne correspond à votre recherche." : "Aucune vente conclue sur la période sélectionnée."}
                </Empty>
              ) : (
                <div className="twrap">
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th style={{ width: 44 }}>Photo</th>
                        <th>Article / Produit</th>
                        <th className="sortable" onClick={() => toggleSort("saleDate")}>
                          Date Vente <ArrowUpDown size={11} />
                        </th>
                        <th>Canal / Plateforme</th>
                        <th>Acheteur / Client</th>
                        <th className="r sortable" onClick={() => toggleSort("price")}>
                          Prix Vente <ArrowUpDown size={11} />
                        </th>
                        <th className="r sortable" onClick={() => toggleSort("cost")}>
                          Coût Achat <ArrowUpDown size={11} />
                        </th>
                        <th className="r sortable" onClick={() => toggleSort("marge")}>
                          Marge Nette <ArrowUpDown size={11} />
                        </th>
                        <th className="r sortable" onClick={() => toggleSort("daysInStock")}>
                          Délai Stock <ArrowUpDown size={11} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedSalesList.map((item) => {
                        const m = marginOf(item);
                        const rev = revenueOf(item);
                        const c = costOf(item);
                        const mRate = rev > 0 ? (m / rev) * 100 : 0;
                        const daysInStock = getDaysInStock(item);

                        return (
                          <tr key={item.id}>
                            <td className="shrink">
                              <Photo id={item.photoId} />
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                                {item.name || "Article sans nom"}
                              </div>
                              <div className="hint" style={{ fontSize: 11 }}>
                                {item.brand || "—"}{item.size ? ` · ${item.size}` : ""}{qtyOf(item) > 1 ? ` · ×${qtyOf(item)}` : ""}
                              </div>
                            </td>
                            <td className="nowrap" style={{ fontSize: 12 }}>
                              {dshort(item.saleDate)}
                            </td>
                            <td>
                              <span className="pill ghost" style={{ fontSize: 11 }}>
                                {item.platform || "Direct"}
                              </span>
                            </td>
                            <td>
                              {item.buyer ? (
                                <span style={{ fontWeight: 500 }}>{item.buyer}</span>
                              ) : (
                                <span className="hint" style={{ fontSize: 11 }}>—</span>
                              )}
                            </td>
                            <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>
                              {eur(rev)}
                            </td>
                            <td className="r num">−{eur2(c)}</td>
                            <td className={`r num ${m >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>
                              <div>{eur(m)}</div>
                              <div style={{ fontSize: 10, opacity: 0.8 }}>{pct(mRate)}</div>
                            </td>
                            <td className="r num">
                              {daysInStock !== null ? (
                                <span className={`pill ${daysInStock <= 14 ? "ok" : daysInStock <= 45 ? "info" : "warn"}`} style={{ fontSize: 11 }}>
                                  <Clock size={11} style={{ marginRight: 3 }} />
                                  {daysInStock}j
                                </span>
                              ) : (
                                <span className="hint">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="cols two">
            {/* Card 1 : Record & Pépites de Ventes */}
            <div className="card">
              <div className="card-h">
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Award size={18} style={{ color: "var(--warn)" }} /> Pépites & Records de Ventes
                </h3>
              </div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Plus forte marge */}
                {(() => {
                  const topMarginItem = list.reduce(
                    (best, i) => (!best || marginOf(i) > marginOf(best) ? i : best),
                    null as Item | null
                  );
                  const topRoiItem = list.reduce((best, i) => {
                    const roi = costOf(i) > 0 ? (marginOf(i) / costOf(i)) * 100 : 0;
                    const bestRoi = best && costOf(best) > 0 ? (marginOf(best) / costOf(best)) * 100 : -Infinity;
                    return roi > bestRoi ? i : best;
                  }, null as Item | null);
                  const fastestItem = list
                    .filter((i) => i.buyDate && i.saleDate)
                    .reduce((best, i) => {
                      const days = getDaysInStock(i);
                      const bestDays = best ? getDaysInStock(best) : Infinity;
                      return days !== null && days < (bestDays ?? Infinity) ? i : best;
                    }, null as Item | null);

                  return (
                    <>
                      {topMarginItem ? (
                        <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>🥇 Plus Forte Marge (€)</div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{topMarginItem.name || "Article"}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{topMarginItem.brand || "—"} · vendu le {dshort(topMarginItem.saleDate)}</div>
                          </div>
                          <b style={{ fontSize: 16, color: "var(--ok)", fontVariantNumeric: "tabular-nums" }}>+{eur(marginOf(topMarginItem))}</b>
                        </div>
                      ) : null}

                      {topRoiItem && costOf(topRoiItem) > 0 ? (
                        <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>🚀 Meilleur ROI (%)</div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{topRoiItem.name || "Article"}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Achat {eur2(costOf(topRoiItem))} → Vente {eur(revenueOf(topRoiItem))}</div>
                          </div>
                          <b style={{ fontSize: 16, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>+{pct((marginOf(topRoiItem) / costOf(topRoiItem)) * 100)}</b>
                        </div>
                      ) : null}

                      {fastestItem ? (
                        <div style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>⚡ Vente la plus rapide</div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{fastestItem.name || "Article"}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Écoulé sur {fastestItem.platform || "Canal"}</div>
                          </div>
                          <b style={{ fontSize: 14, color: "var(--warn)" }}>{getDaysInStock(fastestItem)} jour(s)</b>
                        </div>
                      ) : null}

                      {!topMarginItem && !topRoiItem && (
                        <Empty glyph="🏆" title="Pas encore de ventes">
                          Les meilleures pépites apparaîtront avec vos premières ventes.
                        </Empty>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Card 2 : Distribution par Tranche de Prix */}
            <div className="card">
              <div className="card-h">
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Target size={18} style={{ color: "var(--accent)" }} /> Ventes par Tranche de Prix
                </h3>
              </div>
              <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(() => {
                  const under100 = list.filter((i) => revenueOf(i) < 100);
                  const between100And300 = list.filter((i) => revenueOf(i) >= 100 && revenueOf(i) <= 300);
                  const above300 = list.filter((i) => revenueOf(i) > 300);

                  const tiers = [
                    { label: "Accessible (< 100 €)", items: under100, color: "#38bdf8" },
                    { label: "Cœur de Gamme (100 – 300 €)", items: between100And300, color: "#a78fff" },
                    { label: "Premium / Luxe (> 300 €)", items: above300, color: "#34d399" },
                  ];

                  return tiers.map((tier) => {
                    const count = tier.items.length;
                    const tierCa = tier.items.reduce((a, i) => a + revenueOf(i), 0);
                    const tierMarge = tier.items.reduce((a, i) => a + marginOf(i), 0);
                    const share = ca > 0 ? (tierCa / ca) * 100 : 0;

                    return (
                      <div key={tier.label} style={{ padding: 10, borderRadius: 8, background: "var(--surface-2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink)" }}>{tier.label}</span>
                          <b style={{ color: tier.color, fontVariantNumeric: "tabular-nums" }}>{eur(tierCa)} ({pct(share)})</b>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
                          <span>{count} article(s) vendu(s)</span>
                          <span>Marge générée : <b style={{ color: tierMarge >= 0 ? "var(--ok)" : "var(--bad)" }}>{eur(tierMarge)}</b></span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2 : NIVEAU CANAUX ET PLATEFORMES DE VENTE ── */}
      {activeTab === "channels" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h">
              <h3>Matrice de Performance par Plateforme</h3>
              <div className="spacer" />
              <span className="hint">Volume, Chiffre d'Affaires & Marge nette réelle</span>
            </div>
            {platformStats.length === 0 ? (
              <Empty glyph="🛍️" title="Aucune vente">Pas de vente sur la période.</Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th>Canal / Plateforme</th>
                      <th className="r">Ventes (Qté)</th>
                      <th className="r">CA Réalisé</th>
                      <th className="r">Prix Moyen</th>
                      <th className="r">Commissions</th>
                      <th className="r">Marge Nette</th>
                      <th className="r">Taux de Marge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformStats.map((p) => (
                      <tr key={p.platform}>
                        <td>
                          <button
                            className="linkish"
                            onClick={() => navigate(links.ventes({ platform: p.platform }))}
                            style={{ fontWeight: 600 }}
                          >
                            {p.platform}
                          </button>
                        </td>
                        <td className="r num">{p.qty}</td>
                        <td className="r num" style={{ color: "var(--accent)", fontWeight: 700 }}>
                          {eur(p.ca)}
                        </td>
                        <td className="r num">{eur2(p.avgPrice)}</td>
                        <td className="r num" style={{ color: "var(--warn)" }}>−{eur2(p.fees)}</td>
                        <td className={`r num ${p.marge >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>
                          {eur(p.marge)}
                        </td>
                        <td className="r num">
                          <span className={`pill ${p.margeRate >= 20 ? "ok" : "warn"}`}>
                            {pct(p.margeRate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3 : PAR MARQUE & CATÉGORIE ── */}
      {activeTab === "categories" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h" style={{ flexWrap: "wrap", gap: 8 }}>
              <h3>Classement des Ventes par Marque & Catégorie</h3>
              <div className="spacer" />
              <Segmented<Dimension>
                value={selectedDim}
                onChange={setSelectedDim}
                options={[
                  { value: "brand", label: "Marque" },
                  { value: "type", label: "Type Produit" },
                  { value: "size", label: "Taille" },
                ]}
              />
            </div>
            {dimensionStats.length === 0 ? (
              <Empty glyph="📦" title="Aucune donnée">Pas de vente sur la période.</Empty>
            ) : (
              <div className="card-b">
                <div className="twrap">
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th>Nom / Libellé</th>
                        <th className="r">Qté</th>
                        <th className="r">CA Total</th>
                        <th className="r">Marge Nette</th>
                        <th className="r">Taux Marge</th>
                        <th className="r">Part du CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dimensionStats.map((r) => (
                        <tr key={r.key}>
                          <td style={{ fontWeight: 600 }}>{r.key}</td>
                          <td className="r num">{r.qty}</td>
                          <td className="r num">{eur(r.ca)}</td>
                          <td className={`r num ${r.marge >= 0 ? "pos" : "neg"}`}>{eur(r.marge)}</td>
                          <td className="r num">{pct(r.margePct)}</td>
                          <td className="r num" style={{ color: "var(--accent)" }}>{pct(r.shareOfCa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 20 }}>
                  <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 10 }}>
                    Visualisation en barres (Volume de CA)
                  </h4>
                  <BarList
                    rows={dimensionStats.slice(0, 10).map((r) => ({
                      key: r.key,
                      label: r.key,
                      value: r.ca,
                      display: eur(r.ca),
                      note: `${r.qty} vente${r.qty > 1 ? "s" : ""} · ${pct(r.margePct)} de marge`,
                    }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4 : VITESSE D'ÉCOULEMENT & VÉLOCITÉ DE STOCK ── */}
      {activeTab === "velocity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-h">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={18} style={{ color: "var(--accent)" }} /> Vélocité de Vente & Écoulement du Stock
              </h3>
            </div>
            <div className="card-b">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
                <div style={{ padding: 14, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>
                    Délai Moyen d'Écoulement
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", margin: "4px 0" }}>
                    {averageDaysToSell !== null ? `${averageDaysToSell} jours` : "–"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Temps entre l'achat et la vente</div>
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>
                    Taux d'Écoulement (Sell-Through)
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ok)", margin: "4px 0" }}>
                    {pct(sellThroughRate)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {totalSoldAllTime} vendus / {totalStockCount + totalSoldAllTime} articles gérés
                  </div>
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>
                    Pièces en Stock à Vendre
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", margin: "4px 0" }}>
                    {state.items.filter((i) => i.status === "stock").reduce((a, i) => a + qtyOf(i), 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Articles disponibles immédiatement</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
