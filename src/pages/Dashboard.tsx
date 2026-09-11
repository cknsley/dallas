import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import CashFlowCard from "../components/CashFlowCard";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, computeStats, costOf, groupBy, monthlySeries, periodRange, soldItems, type Dimension,
} from "../lib/calc";
import { eur, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import ItemModal from "../modals/ItemModal";
import OrderModal from "../modals/OrderModal";
import type { Period } from "../types";

type TrendKind = "bar" | "line" | "area";
type SplitKind = "table" | "bars" | "donut";

const DIMS: { value: Dimension; label: string }[] = [
  { value: "item", label: "Article" },
  { value: "brand", label: "Marque" },
  { value: "type", label: "Type" },
  { value: "size", label: "Taille" },
];

/* Palette lisible sur fond clair comme sur fond sombre. */
const SLICES = ["#7C5CFF", "#56BEE0", "#F2A65A", "#57C6A0", "#E4699B", "#8C7BE6", "#4FA3D1", "#C9A227"];

const axis = { fontSize: 11, fill: "var(--ink-3)" } as const;
const tooltipStyle = {
  background: "var(--surface-solid)",
  border: "1px solid var(--line-2)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "var(--shadow)",
} as const;
const shortEur = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

/** Une ligne du classement renvoie vers les pièces qu'elle agrège. */
const dimLink = (dim: Dimension, key: string) =>
  dim === "brand" ? links.stock({ brand: key })
  : dim === "type" ? links.stock({ type: key })
  : dim === "size" ? links.stock({ size: key })
  : links.stock({ q: key });

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"item" | "order" | null>(null);
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [dim, setDim] = usePref<Dimension>("dashDim", "brand");
  const [split, setSplit] = usePref<SplitKind>("dashSplit", "table");
  const [trend, setTrend] = usePref<TrendKind>("dashTrend", "bar");

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range), [state, range]);
  const rows = useMemo(() => groupBy(soldItems(state.items, range), dim), [state.items, range, dim]);
  const months = useMemo(() => monthlySeries(state.items), [state.items]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );

  const hasSales = state.items.some((i) => i.status === "vendu");
  const donutData = rows.slice(0, 7).map((r, ix) => ({ name: r.key, value: Math.round(r.ca), fill: SLICES[ix % SLICES.length] }));
  const others = rows.slice(7).reduce((a, r) => a + r.ca, 0);
  if (others > 0) donutData.push({ name: "Autres", value: Math.round(others), fill: "var(--ink-3)" });

  const pipeline = (["arrivage", "stock", "vendu"] as const).map((s) => {
    const items = state.items.filter((i) => i.status === s);
    return {
      status: s,
      count: items.length,
      value: items.reduce((a, i) => a + (s === "vendu" ? i.price : costOf(i)), 0),
    };
  });
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.count));

  return (
    <>
      <HeaderActions>
        <button className="btn" onClick={() => setCreating("item")}>+ Nouvelle pièce</button>
        <button className="btn primary" onClick={() => setCreating("order")}>+ Nouvelle commande</button>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois en cours" },
            { value: "year", label: "Année en cours" },
            { value: "all", label: "Depuis le début" },
          ]}
        />
      </HeaderActions>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div>
            <b>{regime.alert.title}</b><br />{regime.alert.text}{" "}
            <Link to={links.facturation()}>Régler le régime de TVA →</Link>
          </div>
        </div>
      )}

      <CashFlowCard state={state} range={range} />

      <div className="kpi-grid">
        <Kpi
          label="Chiffre d'affaires"
          value={eur(stats.ca)}
          meta={`${stats.count} vente${stats.count > 1 ? "s" : ""} · ${range.label}`}
          to={links.ventes()}
          hint="Ventes"
        />
        <Kpi
          label="Marge réalisée"
          value={eur(stats.marge)}
          meta={`${pct(stats.margePct)} du chiffre d'affaires`}
          tone={stats.marge >= 0 ? "ok" : "warn"}
          to={links.bilan()}
          hint="Détail"
        />
        <Kpi
          label="Valeur estimée du stock"
          value={eur(stats.stockEstimate)}
          meta={`${stats.stockCount} pièce${stats.stockCount > 1 ? "s" : ""} · ${eur(stats.stockValue)} de coût total`}
          tone="info"
          to={links.stock({ status: "stock" })}
          hint="Stock"
        />
        <Kpi
          label="Nombre de ventes"
          value={String(stats.count)}
          meta={`${stats.enStock} en stock · ${stats.arrivage} en arrivage`}
          to={links.ventes()}
          hint="Historique"
        />
      </div>

      <div className="dash-grid">
        {/* ---------- évolution ---------- */}
        <section className="card col-2">
          <div className="card-h">
            <h3>Évolution sur 12 mois</h3>
            <div className="spacer" />
            <Segmented<TrendKind>
              value={trend}
              onChange={setTrend}
              options={[
                { value: "bar", label: "Barres" },
                { value: "line", label: "Courbes" },
                { value: "area", label: "Aires" },
              ]}
            />
          </div>
          <div className="card-b" style={{ height: 330 }}>
            {hasSales ? (
              <ResponsiveContainer width="100%" height="100%">
                {trend === "line" ? (
                  <LineChart data={months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--line-2)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={shortEur} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k) => [eur(v), k === "ca" ? "CA" : "Marge"]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(k) => (k === "ca" ? "CA" : "Marge")} />
                    <Line type="monotone" dataKey="ca" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="marge" stroke="var(--accent-2)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                ) : trend === "area" ? (
                  <AreaChart data={months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="gMarge" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-2)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--accent-2)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--line-2)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={shortEur} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k) => [eur(v), k === "ca" ? "CA" : "Marge"]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(k) => (k === "ca" ? "CA" : "Marge")} />
                    <Area type="monotone" dataKey="ca" stroke="var(--accent)" strokeWidth={2} fill="url(#gCa)" />
                    <Area type="monotone" dataKey="marge" stroke="var(--accent-2)" strokeWidth={2} fill="url(#gMarge)" />
                  </AreaChart>
                ) : (
                  <BarChart data={months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--line-2)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={shortEur} />
                    <Tooltip cursor={{ fill: "var(--accent-soft)" }} contentStyle={tooltipStyle} formatter={(v: number, k) => [eur(v), k === "ca" ? "CA" : "Marge"]} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(k) => (k === "ca" ? "CA" : "Marge")} />
                    <Bar dataKey="ca" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="marge" fill="var(--accent-2)" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <Empty glyph="▁▃▅" title="Pas encore d'historique">
                Les ventes enregistrées alimenteront ce graphique mois par mois.
              </Empty>
            )}
          </div>
        </section>

        {/* ---------- pipeline ---------- */}
        <section className="card">
          <div className="card-h">
            <h3>Pipeline</h3>
            <div className="spacer" />
            <span className="hint">Toutes périodes</span>
          </div>
          <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {pipeline.map((p) => (
              <Link
                key={p.status}
                className="pipe-row"
                to={p.status === "vendu" ? links.ventes() : links.stock({ status: p.status })}
              >
                <div className="pipe-head">
                  <span className={`pill ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  <span className="spacer" />
                  <b className="num">{p.count}</b>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(2, (p.count / pipelineMax) * 100)}%` }} />
                </div>
                <div className="hint num">
                  {eur(p.value)} {p.status === "vendu" ? "de ventes" : "immobilisés"}
                </div>
              </Link>
            ))}
            <hr className="sep" />
            <div className="totrow"><span>Capital engagé</span><b className="num">{eur(stats.engaged)}</b></div>
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Valeur estimée à la revente</span>
              <b className="num">{eur(stats.stockEstimate)}</b>
            </div>
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Marge potentielle estimée</span>
              <b className={`num ${stats.stockPotential >= 0 ? "pos" : "neg"}`}>{eur(stats.stockPotential)}</b>
            </div>
          </div>
        </section>

        {/* ---------- répartition ---------- */}
        <section className="card col-3">
          <div className="card-h">
            <h3>Meilleures ventes</h3>
            <div className="spacer" />
            <Segmented<Dimension> value={dim} onChange={setDim} options={DIMS} />
            <Segmented<SplitKind>
              value={split}
              onChange={setSplit}
              options={[
                { value: "table", label: "Chiffré" },
                { value: "bars", label: "Barres" },
                { value: "donut", label: "Anneau" },
              ]}
            />
          </div>

          {rows.length === 0 ? (
            <Empty glyph="◌" title="Aucune vente sur la période">
              Changez de période, ou marquez une pièce comme vendue depuis le stock.
            </Empty>
          ) : split === "table" ? (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th>{DIMS.find((d) => d.value === dim)?.label}</th>
                    <th className="r">Qté</th>
                    <th className="r">CA</th>
                    <th className="r">Marge</th>
                    <th className="r">Marge %</th>
                    <th className="r">Part du CA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="clickable" onClick={() => navigate(dimLink(dim, r.key))}>
                      <td><span className="linkish">{r.key}</span></td>
                      <td className="r num">{r.qty}</td>
                      <td className="r num">{eur(r.ca)}</td>
                      <td className={`r num ${r.marge >= 0 ? "pos" : "neg"}`}>{eur(r.marge)}</td>
                      <td className="r num">{pct(r.ca ? (r.marge / r.ca) * 100 : 0)}</td>
                      <td className="r num">{pct(stats.ca ? (r.ca / stats.ca) * 100 : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : split === "bars" ? (
            <div className="card-b">
              <BarList
                rows={rows.slice(0, 14).map((r) => ({
                  key: r.key,
                  label: r.key,
                  value: r.ca,
                  display: eur(r.ca),
                  note: `${r.qty} vendue${r.qty > 1 ? "s" : ""}`,
                }))}
              />
            </div>
          ) : (
            <div className="card-b" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="var(--surface-solid)"
                    strokeWidth={2}
                  >
                    {donutData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, k) => [eur(v), String(k)]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {creating === "item" && <ItemModal item={null} onClose={() => setCreating(null)} />}
      {creating === "order" && (
        <OrderModal
          onClose={() => setCreating(null)}
          onCreated={() => navigate(links.livraison({ tab: "recevoir" }))}
        />
      )}
    </>
  );
}
