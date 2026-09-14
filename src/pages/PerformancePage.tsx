import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { HeaderActions } from "../components/Layout";
import { Empty, RangePicker, Section } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import { usePref } from "../lib/usePref";
import {
  chargesByCategory, chargesInRange, costOf, filterItemsByDomain, marginOf,
  monthlySeries, qtyOf, revenueOf, saleCostsOf, sectorMeta, soldItems,
} from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import type { Item } from "../types";

type ChartView = "evolution" | "univers" | "marques" | "canaux" | "charges";
type SortKey =
  | "recent" | "ancien" | "marge_desc" | "marge_asc"
  | "prix_desc" | "prix_asc" | "roi_desc" | "delai_asc" | "delai_desc";

const PALETTE = ["#a78fff", "#5fd3ab", "#7fd4ee", "#f0c069", "#ec4899", "#8b5cf6", "#34d399"];

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Plus récentes",
  ancien: "Plus anciennes",
  marge_desc: "Marge la plus forte",
  marge_asc: "Marge la plus faible",
  prix_desc: "Prix le plus élevé",
  prix_asc: "Prix le plus bas",
  roi_desc: "Meilleur ROI",
  delai_asc: "Vendu le plus vite",
  delai_desc: "Resté le plus longtemps",
};

const CHART_LABELS: Record<ChartView, string> = {
  evolution: "Évolution CA & marge (12 mois)",
  univers: "Répartition par univers",
  marques: "Top marques",
  canaux: "Canaux de vente",
  charges: "Charges par catégorie",
};

const daysInStock = (i: Item): number | null => {
  if (!i.buyDate || !i.saleDate) return null;
  const d = (new Date(i.saleDate).getTime() - new Date(i.buyDate).getTime()) / 86400000;
  return Math.max(0, Math.round(d));
};

export default function PerformancePage() {
  const { state } = useStore();
  const [searchParams] = useSearchParams();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("perf");
  const [domain, setDomain] = usePref<string>("perfDomain", "all");
  const [chartView, setChartView] = useState<ChartView>("univers");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const customSectors = state.settings.customSectors ?? [];
  const sectorIds = useMemo(
    () => ["fashion", "tcg", ...customSectors.map((s) => s.id)],
    [customSectors],
  );

  // Le secteur suit l'URL : sans paramètre, on retombe sur la vue tous univers.
  useEffect(() => {
    const secteur = searchParams.get("secteur");
    setDomain(secteur && sectorIds.includes(secteur) ? secteur : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sectorIds.join(",")]);

  const domainItems = useMemo(() => filterItemsByDomain(state.items, domain), [state.items, domain]);
  const sold = useMemo(() => soldItems(domainItems, range), [domainItems, range]);

  /* ── Indicateurs clés ── */
  const ca = useMemo(() => sold.reduce((a, i) => a + revenueOf(i), 0), [sold]);
  const grossMarge = useMemo(() => sold.reduce((a, i) => a + marginOf(i), 0), [sold]);
  const charges = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const netMarge = grossMarge - charges;
  const qty = useMemo(() => sold.reduce((a, i) => a + qtyOf(i), 0), [sold]);
  const avgDays = useMemo(() => {
    const valid = sold.map(daysInStock).filter((d): d is number => d !== null);
    return valid.length ? Math.round(valid.reduce((a, d) => a + d, 0) / valid.length) : null;
  }, [sold]);

  /* ── Données des graphiques ── */
  const evolutionData = useMemo(
    () => monthlySeries(domainItems, 12).map((m) => ({ mois: m.label, CA: Math.round(m.ca), Marge: Math.round(m.marge) })),
    [domainItems],
  );

  const universData = useMemo(
    () => sectorIds
      .map((id) => {
        const items = soldItems(filterItemsByDomain(state.items, id), range);
        return {
          name: sectorMeta(id, customSectors).label,
          ca: Math.round(items.reduce((a, i) => a + revenueOf(i), 0)),
          marge: Math.round(items.reduce((a, i) => a + marginOf(i), 0)),
        };
      })
      .filter((r) => r.ca > 0 || r.marge !== 0),
    [sectorIds, state.items, range, customSectors],
  );

  const marquesData = useMemo(() => {
    const m = new Map<string, { name: string; ca: number; marge: number; qty: number }>();
    sold.forEach((i) => {
      const key = i.brand?.trim() || "Sans marque";
      const cur = m.get(key) ?? { name: key, ca: 0, marge: 0, qty: 0 };
      cur.ca += revenueOf(i);
      cur.marge += marginOf(i);
      cur.qty += qtyOf(i);
      m.set(key, cur);
    });
    return [...m.values()]
      .map((r) => ({ ...r, ca: Math.round(r.ca), marge: Math.round(r.marge) }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 8);
  }, [sold]);

  const canauxData = useMemo(() => {
    const m = new Map<string, { name: string; ca: number; marge: number; frais: number; qty: number }>();
    sold.forEach((i) => {
      const key = i.platform?.trim() || "Vente directe";
      const cur = m.get(key) ?? { name: key, ca: 0, marge: 0, frais: 0, qty: 0 };
      cur.ca += revenueOf(i);
      cur.marge += marginOf(i);
      cur.frais += saleCostsOf(i);
      cur.qty += qtyOf(i);
      m.set(key, cur);
    });
    return [...m.values()]
      .map((r) => ({ ...r, ca: Math.round(r.ca), marge: Math.round(r.marge), frais: Math.round(r.frais) }))
      .sort((a, b) => b.ca - a.ca);
  }, [sold]);

  const chargesData = useMemo(
    () => chargesByCategory(state.expenses, range).map((c) => ({ name: c.key, value: Math.round(c.total) })),
    [state.expenses, range],
  );

  /* ── Table des ventes, triée via le menu déroulant ── */
  const sortedSales = useMemo(() => {
    const rows = [...sold];
    rows.sort((a, b) => {
      const roi = (i: Item) => (costOf(i) > 0 ? (marginOf(i) / costOf(i)) * 100 : 0);
      switch (sortKey) {
        case "ancien": return (a.saleDate || "").localeCompare(b.saleDate || "");
        case "marge_desc": return marginOf(b) - marginOf(a);
        case "marge_asc": return marginOf(a) - marginOf(b);
        case "prix_desc": return revenueOf(b) - revenueOf(a);
        case "prix_asc": return revenueOf(a) - revenueOf(b);
        case "roi_desc": return roi(b) - roi(a);
        case "delai_asc": return (daysInStock(a) ?? Infinity) - (daysInStock(b) ?? Infinity);
        case "delai_desc": return (daysInStock(b) ?? -1) - (daysInStock(a) ?? -1);
        default: return (b.saleDate || "").localeCompare(a.saleDate || "");
      }
    });
    return rows;
  }, [sold, sortKey]);

  const axisProps = { stroke: "var(--ink-3)", fontSize: 11, tickLine: false };
  const tooltipStyle = {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-2)",
    borderRadius: 10,
    fontSize: 12,
  };

  return (
    <>
      <HeaderActions>
        <select value={domain} onChange={(e) => setDomain(e.target.value)} style={{ width: "auto" }}>
          <option value="all">🌐 Tous les univers</option>
          {sectorIds.map((id) => {
            const meta = sectorMeta(id, customSectors);
            return <option key={id} value={id}>{meta.icon} {meta.label}</option>;
          })}
        </select>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      {/* ── INDICATEURS CLÉS ── */}
      <div className="perf-kpis">
        <div className="perf-kpi">
          <span className="lbl">Chiffre d'affaires</span>
          <b className="val">{eur(ca)}</b>
          <span className="meta">{qty} pièce(s) · {range.label}</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Marge nette</span>
          <b className={`val ${netMarge >= 0 ? "pos" : "neg"}`}>{eur(netMarge)}</b>
          <span className="meta">{pct(ca > 0 ? (netMarge / ca) * 100 : 0)} du CA · {eur(charges)} de charges</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Panier moyen</span>
          <b className="val">{eur(qty > 0 ? ca / qty : 0)}</b>
          <span className="meta">{eur(qty > 0 ? netMarge / qty : 0)} de marge / pièce</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Délai d'écoulement</span>
          <b className="val">{avgDays !== null ? `${avgDays} j` : "–"}</b>
          <span className="meta">Entre l'achat et la vente</span>
        </div>
      </div>

      {/* ── VENTES, TRI PAR MENU DÉROULANT ── */}
      <Section
        title={`Ventes (${sortedSales.length})`}
        right={
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ width: "auto" }}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>Trier : {SORT_LABELS[k]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b">
          {sortedSales.length === 0 ? (
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
                    <th className="r">Coût</th>
                    <th className="r">Marge</th>
                    <th className="r">Délai</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSales.map((i) => {
                    const m = marginOf(i);
                    const rev = revenueOf(i);
                    const d = daysInStock(i);
                    const sectorId = sectorIds.find((id) => filterItemsByDomain([i], id).length > 0);
                    return (
                      <tr key={i.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{i.name || "Sans nom"}</div>
                          <div className="hint" style={{ fontSize: 11 }}>{i.brand || "—"}{i.size ? ` · ${i.size}` : ""}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {sectorId ? `${sectorMeta(sectorId, customSectors).icon} ${sectorMeta(sectorId, customSectors).label}` : "—"}
                        </td>
                        <td className="nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</td>
                        <td><span className="pill ghost" style={{ fontSize: 11 }}>{i.platform || "Direct"}</span></td>
                        <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(rev)}</td>
                        <td className="r num">−{eur2(costOf(i))}</td>
                        <td className={`r num ${m >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>
                          <div>{eur(m)}</div>
                          <div style={{ fontSize: 10, opacity: 0.8 }}>{pct(rev > 0 ? (m / rev) * 100 : 0)}</div>
                        </td>
                        <td className="r num">{d !== null ? `${d} j` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── GRAPHIQUES, VUE AU CHOIX ── */}
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
          {chartView === "evolution" && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mois" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="CA" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Marge" stroke={PALETTE[1]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {chartView === "univers" && (
            universData.length === 0 ? (
              <Empty glyph="🌐" title="Aucune vente">Pas encore de vente sur la période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={universData} dataKey="ca" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={3}>
                    {universData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          )}

          {chartView === "marques" && (
            marquesData.length === 0 ? (
              <Empty glyph="🏷️" title="Aucune vente">Pas encore de vente sur la période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marquesData} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                  <XAxis type="number" {...axisProps} />
                  <YAxis type="category" dataKey="name" width={100} {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ca" name="CA" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="marge" name="Marge" fill={PALETTE[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          )}

          {chartView === "canaux" && (
            canauxData.length === 0 ? (
              <Empty glyph="🛍️" title="Aucune vente">Pas encore de vente sur la période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canauxData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ca" name="CA" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="marge" name="Marge" fill={PALETTE[1]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="frais" name="Frais" fill={PALETTE[4]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          )}

          {chartView === "charges" && (
            chargesData.length === 0 ? (
              <Empty glyph="💸" title="Aucune charge">Pas de charge sur la période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chargesData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={3}>
                    {chargesData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => eur(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          )}
        </div>
      </Section>
    </>
  );
}
