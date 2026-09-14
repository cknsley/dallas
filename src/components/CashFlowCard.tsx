import { Link } from "react-router-dom";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { AppState } from "../types";
import { cashFlow, monthlySeries, type Range } from "../lib/calc";
import { eur } from "../lib/format";
import { links } from "../lib/links";

/**
 * Trésorerie de la période, mise en avant : ce qui rentre, ce qui sort,
 * et ce qu'il reste. C'est le chiffre qu'on regarde en premier.
 */
export default function CashFlowCard({ state, range }: { state: AppState; range: Range }) {
  const cf = cashFlow(state, range);
  const positive = cf.net >= 0;
  // Rien encaissé et rien en attente : l'activité démarre, elle n'échoue pas.
  const starting = cf.in === 0 && cf.pending === 0;
  const trend = monthlySeries(state.items, 6);

  return (
    <section className={`cashflow-v2${positive || starting ? "" : " negative"}`}>
      <div className="cf-main">
        <div className="cf-label">Trésorerie · {range.label}</div>
        <div className={`cf-net num${starting ? " neutral" : ""}`}>
          {positive ? "+" : "−"}{eur(Math.abs(cf.net))}
        </div>
        <div className="cf-sub">
          {starting
            ? "Mise de départ engagée, les ventes restent à venir"
            : positive
              ? "Trésorerie positive sur la période"
              : "Trésorerie négative sur la période"}
        </div>
        <div className="cf-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <Line type="monotone" dataKey="ca" stroke="var(--ink-3)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="cf-flow-grid">
        <div className="cf-flow-lg in">
          <span className="cf-flow-label">Entrant</span>
          <b className="num">+{eur(cf.in)}</b>
          <span className="cf-flow-note">Ventes encaissées, port compris</span>
        </div>

        <div className="cf-flow-lg out">
          <span className="cf-flow-label">Sortant</span>
          <b className="num">−{eur(cf.out)}</b>
          <span className="cf-flow-note">Achats, frais & charges</span>
        </div>

        <div className="cf-flow-lg pending">
          <span className="cf-flow-label">Bloqué</span>
          <b className="num">{eur(cf.pending)}</b>
          <span className="cf-flow-note">
            {cf.pending > 0 ? <Link to={links.ventes({ delivery: "non_payee" })}>En attente de paiement</Link> : "Aucun paiement en attente"}
          </span>
        </div>

        <div className="cf-flow-lg safe">
          <span className="cf-flow-label">Mis de côté</span>
          <b className="num">{positive ? "+" : "−"}{eur(Math.abs(cf.net))}</b>
          <span className="cf-flow-note">Trésorerie nette (Entrant − Sortant)</span>
        </div>
      </div>
    </section>
  );
}
