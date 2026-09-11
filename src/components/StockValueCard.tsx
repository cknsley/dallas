import { Link } from "react-router-dom";
import type { AppState } from "../types";
import { costOf, qtyOf } from "../lib/calc";
import { eur, pct } from "../lib/format";
import { links } from "../lib/links";
import { num } from "../lib/format";

/**
 * Valeur théorique du stock : ce que les articles non vendus rapporteraient
 * à leur prix estimé. C'est le chiffre qui compte quand on constitue un stock,
 * bien avant la trésorerie du mois.
 */
export default function StockValueCard({ state }: { state: AppState }) {
  const held = state.items.filter((i) => i.status !== "vendu");
  const pieces = held.reduce((a, i) => a + qtyOf(i), 0);
  const cost = held.reduce((a, i) => a + costOf(i), 0);
  // Un article sans estimation est compté à son coût : jamais de valeur inventée.
  const value = held.reduce((a, i) => a + (num(i.price) ? num(i.price) * qtyOf(i) : costOf(i)), 0);
  const potential = value - cost;
  const estimated = held.filter((i) => num(i.price) > 0).length;
  const missing = held.length - estimated;

  return (
    <section className="cashflow stockvalue">
      <div className="cf-main">
        <div className="cf-label">Valeur théorique du stock</div>
        <div className="cf-net num">{eur(value)}</div>
        <div className="cf-sub">
          {pieces} article{pieces > 1 ? "s" : ""} non vendu{pieces > 1 ? "s" : ""}
          {missing > 0 && (
            <>
              {" · "}
              <Link to={links.stock({ status: "stock" })}>
                {missing} sans estimation, compté{missing > 1 ? "s" : ""} à son coût
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="cf-flows">
        <div className="cf-flow out">
          <span className="cf-flow-label">Immobilisé</span>
          <b className="num">{eur(cost)}</b>
          <span className="cf-flow-note">Ce que le stock a coûté</span>
        </div>
        <div className="cf-flow in">
          <span className="cf-flow-label">Marge potentielle</span>
          <b className="num">{potential >= 0 ? "+" : "−"}{eur(Math.abs(potential))}</b>
          <span className="cf-flow-note">
            {cost > 0 ? `${pct((potential / cost) * 100)} de ROI si tout part au prix estimé` : "Aucun stock"}
          </span>
        </div>
      </div>
    </section>
  );
}
