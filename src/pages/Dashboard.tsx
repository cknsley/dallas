import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { HeaderActions } from "../components/Layout";
import { Empty, RangePicker, Section } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import {
  computeStats, filterItemsByDomain, marginOf,
  qtyOf, revenueOf, sectorMeta, soldItems,
} from "../lib/calc";
import { dshort, eur, pct } from "../lib/format";

type SectorSort = "ca" | "marge" | "stock" | "articles" | "nom";
type ChartView = "ca" | "marge" | "stock" | "repartition";
type TopSort = "marge" | "ca" | "roi" | "rapide" | "quantite";
type VenteSort = "recent" | "ancien" | "marge_desc" | "prix_desc" | "roi_desc" | "delai_asc";

const VENTE_LABELS: Record<VenteSort, string> = {
  recent: "Plus récentes",
  ancien: "Plus anciennes",
  marge_desc: "Marge la plus forte",
  prix_desc: "Prix le plus élevé",
  roi_desc: "Meilleur ROI",
  delai_asc: "Vendu le plus vite",
};

const TOP_LABELS: Record<TopSort, string> = {
  marge: "Meilleure marge (€)",
  ca: "Plus gros CA (€)",
  roi: "Meilleur ROI (%)",
  rapide: "Vendu le plus vite",
  quantite: "Plus gros volume",
};

const PALETTE = ["#a78fff", "#5fd3ab", "#7fd4ee", "#f0c069", "#ec4899", "#8b5cf6", "#34d399"];

const SORT_LABELS: Record<SectorSort, string> = {
  ca: "Chiffre d'affaires ↓",
  marge: "Marge ↓",
  stock: "Valeur du stock ↓",
  articles: "Nombre d'articles ↓",
  nom: "Nom (A → Z)",
};

const CHART_LABELS: Record<ChartView, string> = {
  ca: "CA par univers",
  marge: "Marge par univers",
  stock: "Valeur du stock par univers",
  repartition: "Répartition du CA",
};

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("dash");
  const [sectorSort, setSectorSort] = useState<SectorSort>("ca");
  const [chartView, setChartView] = useState<ChartView>("ca");
  const [topSort, setTopSort] = useState<TopSort>("marge");
  const [venteSort, setVenteSort] = useState<VenteSort>("recent");

  const customSectors = state.settings.customSectors ?? [];
  const sectorIds = useMemo(
    () => ["fashion", "tcg", ...customSectors.map((s) => s.id)],
    [customSectors],
  );

  const global = useMemo(() => computeStats(state, range), [state, range]);

  /* Une ligne par univers, existant ou créé plus tard : la liste suit les réglages. */
  const rows = useMemo(() => {
    const list = sectorIds.map((id) => {
      const meta = sectorMeta(id, customSectors);
      const items = filterItemsByDomain(state.items, id);
      const sold = soldItems(items, range);
      const inStock = items.filter((i) => i.status !== "vendu");
      const ca = sold.reduce((a, i) => a + revenueOf(i), 0);
      const marge = sold.reduce((a, i) => a + marginOf(i), 0);
      return {
        id,
        name: meta.label,
        icon: meta.icon,
        ca,
        marge,
        margePct: ca > 0 ? (marge / ca) * 100 : 0,
        vendus: sold.reduce((a, i) => a + qtyOf(i), 0),
        stock: inStock.reduce((a, i) => a + (i.price ? i.price * qtyOf(i) : i.cost * qtyOf(i)), 0),
        articles: inStock.reduce((a, i) => a + qtyOf(i), 0),
      };
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sectorSort) {
        case "marge": return b.marge - a.marge;
        case "stock": return b.stock - a.stock;
        case "articles": return b.articles - a.articles;
        case "nom": return a.name.localeCompare(b.name);
        default: return b.ca - a.ca;
      }
    });
    return sorted;
  }, [sectorIds, customSectors, state.items, range, sectorSort]);

  /* Top produits, tous univers confondus : ce qui a le mieux marché sur la période. */
  const topProduits = useMemo(() => {
    const sold = soldItems(state.items, range);
    const withMetrics = sold.map((i) => {
      const rev = revenueOf(i);
      const marge = marginOf(i);
      const cost = i.cost ? (i.cost + (i.fees || 0)) * qtyOf(i) : 0;
      const delai = i.buyDate && i.saleDate
        ? Math.max(0, Math.round((new Date(i.saleDate).getTime() - new Date(i.buyDate).getTime()) / 86400000))
        : null;
      const sectorId = sectorIds.find((id) => filterItemsByDomain([i], id).length > 0);
      return { item: i, rev, marge, roi: cost > 0 ? (marge / cost) * 100 : 0, delai, qty: qtyOf(i), sectorId };
    });
    withMetrics.sort((a, b) => {
      switch (topSort) {
        case "ca": return b.rev - a.rev;
        case "roi": return b.roi - a.roi;
        case "rapide": return (a.delai ?? Infinity) - (b.delai ?? Infinity);
        case "quantite": return b.qty - a.qty;
        default: return b.marge - a.marge;
      }
    });
    return withMetrics.slice(0, 10);
  }, [state.items, range, topSort, sectorIds]);

  /* Toutes les ventes de la période, quel que soit l'univers. */
  const ventes = useMemo(() => {
    const rows = soldItems(state.items, range).map((i) => {
      const cost = i.cost ? (i.cost + (i.fees || 0)) * qtyOf(i) : 0;
      const delai = i.buyDate && i.saleDate
        ? Math.max(0, Math.round((new Date(i.saleDate).getTime() - new Date(i.buyDate).getTime()) / 86400000))
        : null;
      const marge = marginOf(i);
      return {
        item: i, rev: revenueOf(i), marge, delai,
        roi: cost > 0 ? (marge / cost) * 100 : 0,
        sectorId: sectorIds.find((id) => filterItemsByDomain([i], id).length > 0),
      };
    });
    rows.sort((a, b) => {
      switch (venteSort) {
        case "ancien": return (a.item.saleDate || "").localeCompare(b.item.saleDate || "");
        case "marge_desc": return b.marge - a.marge;
        case "prix_desc": return b.rev - a.rev;
        case "roi_desc": return b.roi - a.roi;
        case "delai_asc": return (a.delai ?? Infinity) - (b.delai ?? Infinity);
        default: return (b.item.saleDate || "").localeCompare(a.item.saleDate || "");
      }
    });
    return rows;
  }, [state.items, range, venteSort, sectorIds]);

  const chartData = useMemo(() => {
    const key = chartView === "repartition" ? "ca" : chartView;
    return rows
      .map((r) => ({ name: r.name, value: Math.round(r[key as "ca" | "marge" | "stock"]) }))
      .filter((r) => r.value !== 0);
  }, [rows, chartView]);

  const axisProps = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false };
  const tooltipStyle = {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-2)",
    borderRadius: 10,
    fontSize: 12,
  };

  const totals = rows.reduce(
    (a, r) => ({ ca: a.ca + r.ca, marge: a.marge + r.marge, stock: a.stock + r.stock, articles: a.articles + r.articles, vendus: a.vendus + r.vendus }),
    { ca: 0, marge: 0, stock: 0, articles: 0, vendus: 0 },
  );

  return (
    <>
      <HeaderActions>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      {/* ── TOTAUX, TOUS UNIVERS CONFONDUS ── */}
      <div className="perf-kpis">
        <div className="perf-kpi">
          <span className="lbl">Chiffre d'affaires</span>
          <b className="val">{eur(totals.ca)}</b>
          <span className="meta">{totals.vendus} pièce(s) · {range.label}</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Marge nette</span>
          <b className={`val ${global.margeNette >= 0 ? "pos" : "neg"}`}>{eur(global.margeNette)}</b>
          <span className="meta">{pct(totals.ca > 0 ? (global.margeNette / totals.ca) * 100 : 0)} du CA, charges déduites</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Valeur du stock</span>
          <b className="val">{eur(totals.stock)}</b>
          <span className="meta">{totals.articles} article(s) non vendus</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Univers actifs</span>
          <b className="val">{rows.filter((r) => r.articles > 0 || r.ca > 0).length} / {rows.length}</b>
          <span className="meta">Univers avec stock ou ventes</span>
        </div>
      </div>

      {/* ── COMPARATIF DES UNIVERS ── */}
      <Section
        title="Comparatif des univers"
        right={
          <select value={sectorSort} onChange={(e) => setSectorSort(e.target.value as SectorSort)} style={{ width: "auto" }}>
            {(Object.keys(SORT_LABELS) as SectorSort[]).map((k) => (
              <option key={k} value={k}>Trier : {SORT_LABELS[k]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b">
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Univers</th>
                  <th className="r">CA</th>
                  <th className="r">Marge</th>
                  <th className="r">Taux</th>
                  <th className="r">Vendus</th>
                  <th className="r">Stock</th>
                  <th className="r">Articles</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.icon} {r.name}</td>
                    <td className="r num" style={{ color: "var(--accent)", fontWeight: 700 }}>{eur(r.ca)}</td>
                    <td className={`r num ${r.marge >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>{eur(r.marge)}</td>
                    <td className="r num">{pct(r.margePct)}</td>
                    <td className="r num">{r.vendus}</td>
                    <td className="r num">{eur(r.stock)}</td>
                    <td className="r num">{r.articles}</td>
                    <td className="r">
                      <button className="btn ghost sm" onClick={() => navigate(`/achats?secteur=${r.id}`)} title={`Ouvrir ${r.name}`}>
                        <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: "1px solid var(--line-2)" }}>
                  <td>Total</td>
                  <td className="r num">{eur(totals.ca)}</td>
                  <td className="r num">{eur(totals.marge)}</td>
                  <td className="r num">{pct(totals.ca > 0 ? (totals.marge / totals.ca) * 100 : 0)}</td>
                  <td className="r num">{totals.vendus}</td>
                  <td className="r num">{eur(totals.stock)}</td>
                  <td className="r num">{totals.articles}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>

      {/* ── TOP PRODUITS, TOUS UNIVERS ── */}
      <Section
        title="Top produits"
        right={
          <select value={topSort} onChange={(e) => setTopSort(e.target.value as TopSort)} style={{ width: "auto" }}>
            {(Object.keys(TOP_LABELS) as TopSort[]).map((k) => (
              <option key={k} value={k}>Trier : {TOP_LABELS[k]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b">
          {topProduits.length === 0 ? (
            <Empty glyph="🏆" title="Aucune vente">Les meilleurs produits apparaîtront dès vos premières ventes.</Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Produit</th>
                    <th>Univers</th>
                    <th className="r">Prix</th>
                    <th className="r">Marge</th>
                    <th className="r">ROI</th>
                    <th className="r">Délai</th>
                  </tr>
                </thead>
                <tbody>
                  {topProduits.map((r, idx) => (
                    <tr key={r.item.id}>
                      <td className="num" style={{ color: "var(--ink-3)", fontWeight: 700 }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.item.name || "Sans nom"}</div>
                        <div className="hint" style={{ fontSize: 11 }}>
                          {r.item.brand || "—"}{r.item.size ? ` · ${r.item.size}` : ""}{r.qty > 1 ? ` · ×${r.qty}` : ""}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.sectorId ? `${sectorMeta(r.sectorId, customSectors).icon} ${sectorMeta(r.sectorId, customSectors).label}` : "—"}
                      </td>
                      <td className="r num" style={{ color: "var(--accent)", fontWeight: 700 }}>{eur(r.rev)}</td>
                      <td className={`r num ${r.marge >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>{eur(r.marge)}</td>
                      <td className="r num">{pct(r.roi)}</td>
                      <td className="r num">{r.delai !== null ? `${r.delai} j` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── VENTES, TOUS UNIVERS CONFONDUS ── */}
      <Section
        title={`Ventes (${ventes.length})`}
        right={
          <select value={venteSort} onChange={(e) => setVenteSort(e.target.value as VenteSort)} style={{ width: "auto" }}>
            {(Object.keys(VENTE_LABELS) as VenteSort[]).map((k) => (
              <option key={k} value={k}>Trier : {VENTE_LABELS[k]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b">
          {ventes.length === 0 ? (
            <Empty glyph="🛒" title="Aucune vente">Rien de vendu sur cette période.</Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Univers</th>
                    <th>Date</th>
                    <th>Canal</th>
                    <th className="r">Prix</th>
                    <th className="r">Marge</th>
                    <th className="r">ROI</th>
                    <th className="r">Délai</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes.map((v) => (
                    <tr key={v.item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{v.item.name || "Sans nom"}</div>
                        <div className="hint" style={{ fontSize: 11 }}>
                          {v.item.brand || "—"}{v.item.size ? ` · ${v.item.size}` : ""}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {v.sectorId ? `${sectorMeta(v.sectorId, customSectors).icon} ${sectorMeta(v.sectorId, customSectors).label}` : "—"}
                      </td>
                      <td className="nowrap" style={{ fontSize: 12 }}>{dshort(v.item.saleDate)}</td>
                      <td><span className="pill ghost" style={{ fontSize: 11 }}>{v.item.platform || "Direct"}</span></td>
                      <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(v.rev)}</td>
                      <td className={`r num ${v.marge >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>{eur(v.marge)}</td>
                      <td className="r num">{pct(v.roi)}</td>
                      <td className="r num">{v.delai !== null ? `${v.delai} j` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── VUES GRAPHIQUES ── */}
      <Section
        title={CHART_LABELS[chartView]}
        right={
          <select value={chartView} onChange={(e) => setChartView(e.target.value as ChartView)} style={{ width: "auto" }}>
            {(Object.keys(CHART_LABELS) as ChartView[]).map((v) => (
              <option key={v} value={v}>{CHART_LABELS[v]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b" style={{ height: 300 }}>
          {chartData.length === 0 ? (
            <Empty glyph="📊" title="Aucune donnée">Rien à afficher sur cette période.</Empty>
          ) : chartView === "repartition" ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={3}>
                  {chartData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                <Bar dataKey="value" name={CHART_LABELS[chartView]} radius={[4, 4, 0, 0]}>
                  {chartData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>
    </>
  );
}
