import { useMemo, useState } from "react";
import {
  Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import StockValueCard from "../components/StockValueCard";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, computeStats, groupBy, periodRange, soldItems, type Dimension,
} from "../lib/calc";
import { eur, pct } from "../lib/format";
import { links } from "../lib/links";
import { vatRegime } from "../lib/vat";
import ItemModal from "../modals/ItemModal";
import OrderModal from "../modals/OrderModal";
import type { Period } from "../types";

type SplitKind = "table" | "bars" | "donut";

const DIMS: { value: Dimension; label: string }[] = [
  { value: "item", label: "Article" },
  { value: "brand", label: "Marque" },
  { value: "type", label: "Type" },
  { value: "size", label: "Taille" },
];

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"item" | "order" | null>(null);
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [dim, setDim] = usePref<Dimension>("dashDim", "type");
  const [split, setSplit] = usePref<SplitKind>("dashSplit", "donut");

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range), [state, range]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );

  const soldInPeriod = useMemo(() => soldItems(state.items, range), [state.items, range]);
  const clients = useMemo(
    () => state.items.filter((i) => i.buyer?.trim()).map((i) => i.buyer.trim()),
    [state.items],
  );
  const buyerCounts = useMemo(() => {
    const m = new Map<string, number>();
    clients.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
    return m;
  }, [clients]);
  const repeatBuyers = useMemo(
    () => Array.from(buyerCounts.values()).filter((n) => n > 1).length,
    [buyerCounts],
  );
  const repeatRate = clients.length ? (repeatBuyers / buyerCounts.size) * 100 : 0;

  const rows = useMemo(() => groupBy(soldInPeriod, dim), [soldInPeriod, dim]);

  const COLORS = ["#7c5cff", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
  const donutData = useMemo(() => {
    const top = rows.slice(0, 7);
    const otherCa = rows.slice(7).reduce((a, r) => a + r.ca, 0);
    const res = top.map((r, idx) => ({
      name: r.key,
      value: r.ca,
      fill: COLORS[idx % COLORS.length],
    }));
    if (otherCa > 0) {
      res.push({ name: "Autres", value: otherCa, fill: "var(--ink-3)" });
    }
    return res;
  }, [rows]);

  const tooltipStyle = {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-2)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: 12,
  };
  const tooltipItemStyle = { color: "var(--ink)" };
  const tooltipLabelStyle = { fontWeight: 700, color: "var(--ink)" };

  return (
    <>
      <HeaderActions>
        <button className="btn" onClick={() => setCreating("item")}>+ Nouvel article</button>
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

      <StockValueCard state={state} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0 18px" }}>
        <button className="btn primary" onClick={() => setCreating("order")}>+ Nouvelle commande</button>
        <button className="btn" onClick={() => navigate(links.ventes())}>+ Vente</button>
        <button className="btn" onClick={() => navigate(links.deal())}>⚖ Deal</button>
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Chiffre d'affaires"
          value={eur(stats.ca)}
          meta={`${stats.count} vente${stats.count > 1 ? "s" : ""} · ${range.label}`}
        />
        <Kpi
          label="Marge réalisée"
          value={eur(stats.marge)}
          meta={stats.ca ? `${pct(stats.margePct)} du chiffre d'affaires` : "Aucune vente sur la période"}
          tone={stats.marge >= 0 ? "ok" : "warn"}
        />
        <Kpi
          label="Valeur estimée du stock"
          value={eur(stats.stockEstimate)}
          meta={`${stats.stockCount} article${stats.stockCount > 1 ? "s" : ""} · ${eur(stats.stockValue)} de coût total`}
          tone="info"
        />
        <Kpi
          label="Nombre de ventes"
          value={String(stats.count)}
          meta={`${stats.enStock} en stock · ${stats.arrivage} en arrivage`}
        />
        <Kpi
          label="Taux de recommande"
          value={pct(repeatRate)}
          meta={clients.length
            ? `${repeatBuyers} acheteur${repeatBuyers > 1 ? "s" : ""} sur ${clients.length} ${repeatBuyers > 1 ? "sont revenus" : "est revenu"}`
            : "Renseignez l'acheteur à la vente"}
          tone={repeatRate >= 20 ? "ok" : undefined}
        />
      </div>

      <div className="cols two">
        <section className="card col-1">
          <div className="card-h">
            <h3>Stock & Immobilisations</h3>
            <div className="spacer" />
            <span className="hint">Au coût d'achat</span>
          </div>
          <div className="card-b">
            <div className="totrow">
              <span>Capital immobilisé en stock</span>
              <b className="num">{eur(stats.stockValue)}</b>
            </div>
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Valeur estimée de revente</span>
              <b className="num">{eur(stats.stockEstimate)}</b>
            </div>
            <hr className="sep" />
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Marge potentielle estimée</span>
              <b className={`num ${stats.stockPotential >= 0 ? "pos" : "neg"}`}>{eur(stats.stockPotential)}</b>
            </div>
          </div>
        </section>

        <section className="card col-2">
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
              Changez de période, ou marquez un article comme vendu depuis le stock.
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
                    <tr key={r.key}>
                      <td style={{ fontWeight: 600 }}>{r.key}</td>
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
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v: number, k) => [eur(v), String(k)]} />
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
          onCreated={() => navigate(links.arrivage())}
        />
      )}
    </>
  );
}
