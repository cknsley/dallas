import { Link } from "react-router-dom";
import type { AppState } from "../types";
import { cashFlow, type Range } from "../lib/calc";
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

  return (
    <section className={`cashflow${positive || starting ? "" : " negative"}`}>
      <div className="cf-main">
        <div className="cf-label">Trésorerie · {range.label}</div>
        <div className={`cf-net num${starting ? " neutral" : ""}`}>
          {positive ? "+" : "−"}{eur(Math.abs(cf.net))}
        </div>
        <div className="cf-sub">
          {starting
            ? "Mise de départ engagée, les ventes restent à venir"
            : positive
              ? "Entré de plus que sorti sur la période"
              : "Sorti de plus que rentré sur la période"}
          {cf.pending > 0 && (
            <> · <Link to={links.ventes({ delivery: "non_payee" })}>{eur(cf.pending)} en attente de paiement</Link></>
          )}
        </div>
      </div>

      <div className="cf-flows">
        <div className="cf-flow in">
          <span className="cf-flow-label">Encaissé</span>
          <b className="num">+{eur(cf.in)}</b>
          <span className="cf-flow-note">Ventes payées, port compris</span>
        </div>
        <div className="cf-flow out">
          <span className="cf-flow-label">Décaissé</span>
          <b className="num">−{eur(cf.out)}</b>
          <span className="cf-flow-note">
            {eur(cf.purchases)} d'achats · {eur(cf.saleFees)} de frais · {eur(cf.charges)} de charges
          </span>
        </div>
      </div>
    </section>
  );
}
