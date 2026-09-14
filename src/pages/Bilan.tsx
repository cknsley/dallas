import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { HeaderActions } from "../components/Layout";
import CashFlowCard from "../components/CashFlowCard";
import { Empty, Kpi, RangePicker, Section } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import {
  caOfYear, chargesInRange, chargesMonthlySeries, computeStats, costOf,
  filterItemsByDomain, marginOf, monthlySeries, purchaseFeesOf, qtyOf,
  revenueOf, sectorMeta, soldItems,
} from "../lib/calc";
import { eur, eur2, num, pct } from "../lib/format";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import type { Item } from "../types";







interface RentabiliteMetrics {
  ca: number;
  ventesCount: number;
  margeBrute: number;
  charges: number;
  chargesCount: number;
  margeNette: number;
  roi: number;
  roiHint: string;
  coutAchatMoyen: number;
  coutAchatTotal: number;
  commissions: number;
  portPaye: number;
  portRecu: number;
  capitalImmobilise: number;
  articlesEnStock: number;
}

/** Bloc CA/Marge/Charges/Marge nette + ROI/Coûts/Commissions/Port/Capital : réutilisé pour le total et chaque univers. */
function RentabiliteGrid({ title, m }: { title: string; m: RentabiliteMetrics }) {
  return (
    <div style={{ marginTop: title === "Total" ? 0 : 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        {[
          {
            label: "Chiffre d'affaires",
            value: eur2(m.ca),
            sub: `${m.ventesCount} vente${m.ventesCount > 1 ? "s" : ""}`,
            color: "var(--accent-glow)",
            icon: "💰",
          },
          {
            label: "Marge brute",
            value: eur2(m.margeBrute),
            sub: m.ca > 0 ? `${pct((m.margeBrute / m.ca) * 100)} du CA` : "–",
            color: m.margeBrute >= 0 ? "var(--ok)" : "var(--bad)",
            icon: "📈",
          },
          {
            label: "Charges (période)",
            value: `−${eur2(m.charges)}`,
            sub: `${m.chargesCount} charge(s) imputée(s)`,
            color: "var(--warn)",
            icon: "📋",
          },
          {
            label: "Marge nette",
            value: eur2(m.margeNette),
            sub: m.ca > 0 ? `${pct((m.margeNette / m.ca) * 100)} du CA` : "–",
            color: m.margeNette >= 0 ? "var(--ok)" : "var(--bad)",
            icon: "🎯",
          },
        ].map((cell) => (
          <div key={cell.label} style={{ padding: "16px 18px", background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {cell.icon} {cell.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cell.color, fontVariantNumeric: "tabular-nums" }}>{cell.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{cell.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 14 }}>
        {[
          { label: "ROI", value: pct(m.roi), hint: m.roiHint, good: m.roi > 0 },
          {
            label: "Coût d'achat moyen",
            value: eur2(m.coutAchatMoyen),
            hint: `Total coûts vendus : ${eur(m.coutAchatTotal)}`,
            good: true,
          },
          {
            label: "Commissions plateformes",
            value: eur2(m.commissions),
            hint: `${m.ca > 0 ? pct((m.commissions / m.ca) * 100) : "0 %"} du CA`,
            good: m.commissions === 0,
          },
          {
            label: "Port payé",
            value: eur2(m.portPaye),
            hint: `Port refacturé : +${eur2(m.portRecu)}`,
            good: m.portPaye <= m.portRecu,
          },
          {
            label: "Capital immobilisé",
            value: eur2(m.capitalImmobilise),
            hint: `${m.articlesEnStock} article(s) en stock/arrivage`,
            good: false,
          },
        ].map((cell) => (
          <div key={cell.label} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--surface-sub)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {cell.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: cell.good ? "var(--ok)" : "var(--ink-1)" }}>{cell.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{cell.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type BilanChartView = "evolution" | "repartition" | "margenette" | "univers";
const BILAN_CHART_LABELS: Record<BilanChartView, string> = {
  evolution: "📈 Évolution CA & marge",
  repartition: "🥧 Où part l'argent",
  margenette: "🎯 Marge nette (6 mois)",
  univers: "🌐 CA par univers",
};

export default function Bilan() {
  const { state } = useStore();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("bilan");
  const [chartView, setChartView] = useState<BilanChartView>("evolution");
  const [chartSector, setChartSector] = useState<string>("all");
  const domain = "all";

  const domainItems = useMemo(() => state.items, [state.items]);
  const stats = useMemo(() => computeStats(state, range, domain), [state, range, domain]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(domainItems, new Date().getFullYear())),
    [state.settings, domainItems],
  );
  const sold = useMemo(() => soldItems(domainItems, range), [domainItems, range]);

  const tva = vatDue(regime, stats.ca, stats.marge);
  const charges = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  
  const heldItems = useMemo(
    () => domainItems.filter((i: Item) => i.status !== "vendu"),
    [domainItems]
  );
  const net = stats.marge - tva - charges;

  // Achats côté bilan
  const detail = useMemo(() => {
    const achat = sold.reduce((a: number, i: Item) => a + num(i.cost), 0);
    const fraisAchat = sold.reduce((a: number, i: Item) => a + purchaseFeesOf(i), 0);
    const commissions = sold.reduce((a: number, i: Item) => a + num(i.saleFees), 0);
    const portPaye = sold.reduce((a: number, i: Item) => a + num(i.shippingCost), 0);
    const portRecu = sold.reduce((a: number, i: Item) => a + num(i.shippingPaid), 0);
    return { achat, fraisAchat, commissions, portPaye, portRecu, charges };
  }, [sold, charges]);

  // Total achats (stock + arrivage) — côté balance achats
  // Ces valeurs ont été déplacées vers Balance.tsx


  // Balance ventes
  const allSold = soldItems(domainItems); // toutes périodes
  const totalCA = allSold.reduce((a: number, i: Item) => a + revenueOf(i), 0);
  const totalCost = allSold.reduce((a: number, i: Item) => a + costOf(i), 0);
  const totalSaleCosts = allSold.reduce((a: number, i: Item) => a + num(i.saleFees) + num(i.shippingCost) - num(i.shippingPaid), 0);
  const totalMargeGlobale = totalCA - totalCost - Math.max(0, totalSaleCosts);
  const roiGlobal = totalCost > 0 ? (totalMargeGlobale / totalCost) * 100 : 0;

  // Insights
  const panierMoyen = stats.count > 0 ? stats.ca / stats.count : 0;
  const benefMoyen = stats.count > 0 ? net / stats.count : 0;
  const soldWithDates = sold.filter((i) => i.buyDate && i.saleDate);
  const delaiMoyen = soldWithDates.length
    ? soldWithDates.reduce((a, i) => a + (new Date(i.saleDate!).getTime() - new Date(i.buyDate).getTime()) / 86400000, 0) / soldWithDates.length
    : 0;
  
  const bestItem = sold.length
    ? [...sold].sort((a, b) => (revenueOf(b) - costOf(b) - num(b.saleFees) - num(b.shippingCost) + num(b.shippingPaid)) - (revenueOf(a) - costOf(a) - num(a.saleFees) - num(a.shippingCost) + num(a.shippingPaid)))[0]
    : null;
  const bestItemMargin = bestItem ? revenueOf(bestItem) - costOf(bestItem) - num(bestItem.saleFees) - num(bestItem.shippingCost) + num(bestItem.shippingPaid) : 0;

  // Rentabilité par univers : mêmes indicateurs que le total, ventilés pour repérer où scaler.
  const customSectors = state.settings.customSectors ?? [];
  const sectorIds = useMemo(
    () => ["fashion", "tcg", ...customSectors.map((s) => s.id)],
    [customSectors],
  );
  const sectorRows = useMemo(() => {
    return sectorIds
      .map((id) => {
        const meta = sectorMeta(id, customSectors);
        const items = filterItemsByDomain(domainItems, id);
        const soldSector = soldItems(items, range);
        const ca = soldSector.reduce((a, i) => a + revenueOf(i), 0);
        const marge = soldSector.reduce((a, i) => a + marginOf(i), 0);
        const cost = soldSector.reduce((a, i) => a + costOf(i), 0);
        const vendus = soldSector.reduce((a, i) => a + qtyOf(i), 0);
        const withDates = soldSector.filter((i) => i.buyDate && i.saleDate);
        const delai = withDates.length
          ? withDates.reduce((a, i) => a + (new Date(i.saleDate!).getTime() - new Date(i.buyDate).getTime()) / 86400000, 0) / withDates.length
          : 0;
        const achat = soldSector.reduce((a, i) => a + num(i.cost), 0);
        const commissions = soldSector.reduce((a, i) => a + num(i.saleFees), 0);
        const portPaye = soldSector.reduce((a, i) => a + num(i.shippingCost), 0);
        const portRecu = soldSector.reduce((a, i) => a + num(i.shippingPaid), 0);
        const heldSector = items.filter((i: Item) => i.status !== "vendu");
        const capitalImmobilise = heldSector.reduce((a, i) => a + costOf(i), 0);
        // Les charges générales ne sont pas rattachées à un univers : réparties au prorata du CA.
        const chargesAlloc = stats.ca > 0 ? charges * (ca / stats.ca) : 0;
        return {
          id,
          name: meta.label,
          icon: meta.icon,
          ca,
          marge,
          margePct: ca > 0 ? (marge / ca) * 100 : 0,
          roi: cost > 0 ? (marge / cost) * 100 : 0,
          vendus,
          panierMoyen: vendus > 0 ? ca / vendus : 0,
          delai,
          part: stats.ca > 0 ? (ca / stats.ca) * 100 : 0,
          achat,
          commissions,
          portPaye,
          portRecu,
          capitalImmobilise,
          articlesEnStock: heldSector.length,
          charges: chargesAlloc,
          net: marge - chargesAlloc,
        };
      })
      .filter((r) => r.ca > 0 || r.vendus > 0)
      .sort((a, b) => b.ca - a.ca);
  }, [sectorIds, customSectors, domainItems, range, stats.ca, charges]);

  // Données des graphiques, filtrées par univers (ou "Tous").
  const chartItems = useMemo(
    () => (chartSector === "all" ? domainItems : filterItemsByDomain(domainItems, chartSector)),
    [domainItems, chartSector],
  );
  const chartSold = useMemo(() => soldItems(chartItems, range), [chartItems, range]);

  const evolutionData = useMemo(() => monthlySeries(chartItems, 6), [chartItems]);

  const margeNetteData = useMemo(() => {
    const ms = monthlySeries(chartItems, 6);
    const cs = chargesMonthlySeries(state.expenses, 6);
    const chargeByKey = new Map(cs.map((c) => [c.key, c.total]));
    // Les charges générales ne se répartissent pas par univers : appliquées seulement sur "Tous".
    return ms.map((m) => ({
      label: m.label,
      margeNette: Math.round(m.marge - (chartSector === "all" ? (chargeByKey.get(m.key) ?? 0) : 0)),
    }));
  }, [chartItems, state.expenses, chartSector]);

  const universChartData = useMemo(
    () => sectorRows
      .filter((r) => chartSector === "all" || r.id === chartSector)
      .map((r) => ({ name: r.name, value: Math.round(r.marge) })),
    [sectorRows, chartSector],
  );

  const REPART_PALETTE = ["#a78fff", "#f0c069", "#ec4899", "#7fd4ee", "#5fd3ab"];
  const repartitionData = useMemo(() => {
    const achat = chartSold.reduce((a: number, i: Item) => a + num(i.cost), 0);
    const fraisAchat = chartSold.reduce((a: number, i: Item) => a + purchaseFeesOf(i), 0);
    const commissions = chartSold.reduce((a: number, i: Item) => a + num(i.saleFees), 0);
    const portPaye = chartSold.reduce((a: number, i: Item) => a + num(i.shippingCost), 0);
    return [
      { name: "Coût d'achat", value: Math.round(achat) },
      { name: "Frais d'achat", value: Math.round(fraisAchat) },
      { name: "Commissions", value: Math.round(commissions) },
      { name: "Port payé", value: Math.round(portPaye) },
      { name: "Charges", value: chartSector === "all" ? Math.round(charges) : 0 },
    ].filter((r) => r.value > 0);
  }, [chartSold, charges, chartSector]);

  return (
    <>
      <HeaderActions>
        <span className="hint">Rentabilité de la période : marges, ROI et indicateurs moyens</span>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      {/* ── TRÉSORERIE ── */}
      <CashFlowCard state={state} range={range} />

      {/* ── INSIGHTS ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi
          label="Panier moyen"
          value={eur(panierMoyen)}
          meta={stats.count ? `Sur ${stats.count} vente${stats.count > 1 ? "s" : ""}` : "Aucune vente"}
          tone="info"
        />
        <Kpi
          label="Bénéfice moyen"
          value={eur(benefMoyen)}
          meta={stats.count ? `Bénéfice net par article` : "—"}
          tone={benefMoyen > 0 ? "ok" : "warn"}
        />
        <Kpi
          label="Délai de revente"
          value={soldWithDates.length ? `${Math.max(0, Math.round(delaiMoyen))} jours` : "—"}
          meta={soldWithDates.length ? "En moyenne entre l'achat et la vente" : "Pas assez de données"}
          tone="info"
        />
        <Kpi
          label="ROI Période"
          value={stats.engaged > 0 ? pct((stats.marge / stats.engaged) * 100) : "—"}
          meta={stats.engaged > 0 ? "Marge vs Capital stocké" : "—"}
          tone={stats.engaged > 0 && stats.marge > 0 ? "ok" : "warn"}
        />
        <Kpi
          label="Meilleure vente"
          value={bestItem ? eur(bestItemMargin) : "—"}
          meta={bestItem ? bestItem.name : "Aucune vente"}
          tone={bestItem ? "ok" : "info"}
          to={bestItem ? links.ventes() : undefined}
          hint={bestItem ? "Voir" : undefined}
        />
      </div>

      {/* ── RENTABILITÉ ── */}
      <Section title="📊 Rentabilité" right={<span className="hint">{range.label}</span>}>
          <RentabiliteGrid
            title="Total"
            m={{
              ca: stats.ca,
              ventesCount: stats.count,
              margeBrute: stats.marge,
              charges,
              chargesCount: state.expenses.length,
              margeNette: net,
              roi: roiGlobal,
              roiHint: "Marge / coûts d'achat (tout temps)",
              coutAchatMoyen: stats.count > 0 ? detail.achat / stats.count : 0,
              coutAchatTotal: detail.achat,
              commissions: detail.commissions,
              portPaye: detail.portPaye,
              portRecu: detail.portRecu,
              capitalImmobilise: stats.engaged,
              articlesEnStock: heldItems.length,
            }}
          />

          {sectorRows.map((r) => (
            <RentabiliteGrid
              key={r.id}
              title={`${r.icon} ${r.name}`}
              m={{
                ca: r.ca,
                ventesCount: r.vendus,
                margeBrute: r.marge,
                charges: r.charges,
                chargesCount: state.expenses.length,
                margeNette: r.net,
                roi: r.roi,
                roiHint: "Marge / coûts d'achat (période)",
                coutAchatMoyen: r.vendus > 0 ? r.achat / r.vendus : 0,
                coutAchatTotal: r.achat,
                commissions: r.commissions,
                portPaye: r.portPaye,
                portRecu: r.portRecu,
                capitalImmobilise: r.capitalImmobilise,
                articlesEnStock: r.articlesEnStock,
              }}
            />
          ))}
      </Section>

      {/* ── VUES GRAPHIQUES ── */}
      <Section
        title={BILAN_CHART_LABELS[chartView]}
        right={
          <select value={chartView} onChange={(e) => setChartView(e.target.value as BilanChartView)} style={{ width: "auto" }}>
            {(Object.keys(BILAN_CHART_LABELS) as BilanChartView[]).map((v) => (
              <option key={v} value={v}>{BILAN_CHART_LABELS[v]}</option>
            ))}
          </select>
        }
      >
        <div className="seg" style={{ marginBottom: 14 }}>
          <button type="button" className={chartSector === "all" ? "on" : ""} onClick={() => setChartSector("all")}>
            🌐 Tous
          </button>
          {sectorIds.map((id) => {
            const meta = sectorMeta(id, customSectors);
            return (
              <button key={id} type="button" className={chartSector === id ? "on" : ""} onClick={() => setChartSector(id)}>
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
        <div className="card-b" style={{ height: 300 }}>
          {chartView === "evolution" && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="bilanCaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78fff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#a78fff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bilanMargeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5fd3ab" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5fd3ab" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => eur(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="ca" name="CA" stroke="#a78fff" fill="url(#bilanCaGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="marge" name="Marge" stroke="#5fd3ab" fill="url(#bilanMargeGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {chartView === "repartition" && (
            repartitionData.length === 0 ? (
              <Empty glyph="🥧" title="Aucune donnée">Rien à répartir sur cette période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={repartitionData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={3}>
                    {repartitionData.map((_, idx) => <Cell key={idx} fill={REPART_PALETTE[idx % REPART_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => eur(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )
          )}

          {chartView === "margenette" && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={margeNetteData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => eur(v)}
                />
                <Bar dataKey="margeNette" name="Marge nette" radius={[4, 4, 0, 0]}>
                  {margeNetteData.map((d, idx) => <Cell key={idx} fill={d.margeNette >= 0 ? "#5fd3ab" : "#ec4899"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartView === "univers" && (
            universChartData.length === 0 ? (
              <Empty glyph="🌐" title="Aucune donnée">Rien à afficher sur cette période.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={universChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--ink-3)" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-solid)", border: "1px solid var(--line-2)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => eur(v)}
                  />
                  <Bar dataKey="value" name="Marge" radius={[4, 4, 0, 0]}>
                    {universChartData.map((_, idx) => <Cell key={idx} fill={REPART_PALETTE[idx % REPART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          )}
        </div>
      </Section>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}



    </>
  );
}
