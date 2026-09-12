import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { HeaderActions } from "../components/Layout";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, costOf, monthlySeries, periodRange, revenueOf, soldItems,
} from "../lib/calc";
import { eur, num, pct } from "../lib/format";
import { links } from "../lib/links";
import type { Period } from "../types";

const isDirectOrSocialPlatform = (plat: string | undefined): boolean => {
  if (!plat) return true;
  const p = plat.toLowerCase().trim();
  const directKeywords = ["particulier", "discord", "insta", "instagram", "whatsapp", "leboncoin", "lbc", "main", "direct", "snap", "sms", "tel", "téléphone", "privé", "remise"];
  return directKeywords.some((k) => p.includes(k));
};

export default function PerformancePage() {
  const { state } = useStore();
  const [period, setPeriod] = usePref<Period>("period", "month");
  const range = useMemo(() => periodRange(period), [period]);

  const list = useMemo(() => soldItems(state.items, range), [state.items, range]);

  const ca = list.reduce((a, i) => a + revenueOf(i), 0);
  const engaged = list.reduce((a, i) => a + costOf(i), 0);
  const saleFees = list.reduce((a, i) => a + num(i.saleFees), 0);
  const shippingCost = list.reduce((a, i) => a + num(i.shippingCost), 0);
  const shippingPaid = list.reduce((a, i) => a + num(i.shippingPaid), 0);
  const totalCosts = engaged + saleFees + shippingCost - shippingPaid;
  const marge = ca - totalCosts;
  const margePct = ca ? (marge / ca) * 100 : 0;

  const paidCount = list.filter((i) => i.delivery === "livree" || isDirectOrSocialPlatform(i.platform)).length;
  const paidTotal = list
    .filter((i) => i.delivery === "livree" || isDirectOrSocialPlatform(i.platform))
    .reduce((a, i) => a + revenueOf(i), 0);

  const awaitingCount = list.filter((i) => i.delivery === "non_payee" && !isDirectOrSocialPlatform(i.platform)).length;
  const awaitingTotal = list
    .filter((i) => i.delivery === "non_payee" && !isDirectOrSocialPlatform(i.platform))
    .reduce((a, i) => a + revenueOf(i), 0);

  const toShipCount = list.filter((i) => i.delivery === "commandee").length;
  const sleepingMoney = list.filter((i) => i.delivery === "commandee").reduce((a, i) => a + revenueOf(i), 0);

  const avgMargin = list.length ? marge / list.length : 0;
  const avgBasket = list.length ? ca / list.length : 0;

  // Répartition par plateforme
  const byPlatform = useMemo(() => {
    const map = new Map<string, { key: string; ca: number; marge: number; qty: number }>();
    list.forEach((i) => {
      const k = i.platform || "Direct";
      const cur = map.get(k) || { key: k, ca: 0, marge: 0, qty: 0 };
      cur.ca += revenueOf(i);
      cur.marge += revenueOf(i) - costOf(i) - num(i.saleFees) - num(i.shippingCost);
      cur.qty += 1;
      map.set(k, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.ca - a.ca);
  }, [list]);

  const salesBreakdown = useMemo(() => {
    const topBy = (getKey: (item: (typeof list)[number]) => string) => {
      const grouped = new Map<string, { label: string; qty: number; ca: number }>();
      list.forEach((item) => {
        const label = getKey(item).trim() || "Non renseigné";
        const current = grouped.get(label) ?? { label, qty: 0, ca: 0 };
        current.qty += Math.max(1, num(item.quantity));
        current.ca += revenueOf(item);
        grouped.set(label, current);
      });
      return [...grouped.values()]
        .sort((a, b) => b.qty - a.qty || b.ca - a.ca)
        .slice(0, 4);
    };

    return [
      { key: "brand", title: "Marques", icon: "◆", rows: topBy((item) => item.brand) },
      { key: "size", title: "Tailles", icon: "↔", rows: topBy((item) => item.size) },
      { key: "type", title: "Types", icon: "▦", rows: topBy((item) => item.type) },
      { key: "platform", title: "Canaux", icon: "↗", rows: topBy((item) => item.platform || "Direct") },
    ];
  }, [list]);
  const soldQuantity = list.reduce((total, item) => total + Math.max(1, num(item.quantity)), 0);

  // Graphique d'évolution mensuelle
  const year = new Date().getFullYear();
  const series = useMemo(() => monthlySeries(state.items, year), [state.items, year]);
  const yearCA = caOfYear(state.items, year);

  const tooltipStyle = {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-2)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: 12,
  };

  return (
    <>
      <HeaderActions>
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

      <div className="kpi-grid">
        <Kpi
          label="Chiffre d'Affaires Brut"
          value={eur(ca)}
          meta={`${list.length} vente${list.length > 1 ? "s" : ""} · ${range.label}`}
          tone="info"
          to={links.ventes()}
          hint="Ventes"
        />
        <Kpi
          label="Marge Nette Réalisée"
          value={eur(marge)}
          meta={ca ? `${pct(margePct)} du CA` : "Aucune vente sur la période"}
          tone={marge >= 0 ? "ok" : "warn"}
          to={links.bilan()}
          hint="Bilan"
        />
        <Kpi
          label="Moyenne par Vente"
          value={eur(avgMargin)}
          meta={`Panier moyen : ${eur(avgBasket)}`}
          tone="ok"
          hint="Statistiques"
        />
        <Kpi
          label="Capital Engagé"
          value={eur(engaged)}
          meta="Coût total des articles vendus"
          to={links.fournisseurs()}
          hint="Achats"
        />
      </div>

      <div className="dash-grid">
        {/* Card 1 : Performance & Pipeline Ventes */}
        <section className="card col-1">
          <div className="card-h">
            <h3>Performance Ventes</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
          <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="pipe-row">
              <div className="pipe-head">
                <span className="pill ok">Livrées & Payées</span>
                <span className="spacer" />
                <b className="num">{paidCount}</b>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${list.length ? (paidCount / list.length) * 100 : 0}%`, background: "var(--ok)" }} />
              </div>
              <div className="hint num">{eur(paidTotal)} encaissés</div>
            </div>

            <div className="pipe-row">
              <div className="pipe-head">
                <span className="pill warn">À expédier / En cours</span>
                <span className="spacer" />
                <b className="num">{toShipCount}</b>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${list.length ? (toShipCount / list.length) * 100 : 0}%`, background: "var(--warn)" }} />
              </div>
              <div className="hint num">{eur(sleepingMoney)} en attente d'envoi</div>
            </div>

            <div className="pipe-row">
              <div className="pipe-head">
                <span className="pill bad">Non payées / Impayés</span>
                <span className="spacer" />
                <b className="num">{awaitingCount}</b>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${list.length ? (awaitingCount / list.length) * 100 : 0}%`, background: "var(--bad)" }} />
              </div>
              <div className="hint num">{eur(awaitingTotal)} non encaissés</div>
            </div>

            <hr className="sep" />
            <div className="totrow"><span>Chiffre d'Affaires Brut</span><b className="num">{eur(ca)}</b></div>
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Coût d'achat & Frais</span>
              <b className="num">{eur(engaged)}</b>
            </div>
            <div className="totrow" style={{ marginTop: -10 }}>
              <span>Marge Nette Réalisée</span>
              <b className={`num ${marge >= 0 ? "pos" : "neg"}`}>{eur(marge)}</b>
            </div>
          </div>
        </section>

        {/* Card 2 : ce qui se vend le plus */}
        <section className="card col-2">
          <div className="card-h">
            <h3>Produits les plus vendus</h3>
            <div className="spacer" />
            <span className="hint">{soldQuantity} article{soldQuantity > 1 ? "s" : ""} · {range.label}</span>
          </div>
          {list.length === 0 ? (
            <Empty glyph="▥" title="Aucune donnée">Les tendances apparaîtront après les premières ventes.</Empty>
          ) : (
            <div className="card-b sales-insight-grid">
              {salesBreakdown.map((group) => {
                const max = group.rows[0]?.qty || 1;
                return (
                  <div className="sales-insight" key={group.key}>
                    <div className="sales-insight-head">
                      <span className="sales-insight-icon">{group.icon}</span>
                      <strong>{group.title}</strong>
                      <span className="hint">Top {group.rows.length}</span>
                    </div>
                    <div className="sales-insight-bars">
                      {group.rows.map((row, index) => (
                        <div className="sales-insight-row" key={row.label}>
                          <div className="sales-insight-label">
                            <span>{index + 1}</span>
                            <strong title={row.label}>{row.label}</strong>
                            <b className="num">{row.qty}</b>
                          </div>
                          <div className="sales-insight-track">
                            <i style={{ width: `${(row.qty / max) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Section Graphique d'Évolution Mensuelle */}
      <div className="cols two" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-h">
            <h3>Évolution Mensuelle — {year}</h3>
            <div className="spacer" />
            <span className="hint">CA cumulé : {eur(yearCA)}</span>
          </div>
          <div className="card-b" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMarge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--ok)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--ok)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line-2)" />
                <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={11} />
                <YAxis stroke="var(--ink-3)" fontSize={11} tickFormatter={(v) => `${v}€`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [eur(v)]} />
                <Area type="monotone" dataKey="ca" name="CA Brut" stroke="var(--accent)" fillOpacity={1} fill="url(#colorCa)" />
                <Area type="monotone" dataKey="marge" name="Marge" stroke="var(--ok)" fillOpacity={1} fill="url(#colorMarge)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="card-h">
            <h3>Ventes par Canal / Plateforme</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
          {byPlatform.length === 0 ? (
            <Empty glyph="🚀" title="Aucune donnée">Pas de vente sur la période.</Empty>
          ) : (
            <div className="card-b">
              <BarList
                rows={byPlatform.map((p) => ({
                  key: p.key,
                  label: p.key,
                  value: p.ca,
                  display: eur(p.ca),
                  note: `${p.qty} vente${p.qty > 1 ? "s" : ""} · ${eur(p.marge)} marge`,
                  to: links.ventes({ platform: p.key }),
                }))}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
