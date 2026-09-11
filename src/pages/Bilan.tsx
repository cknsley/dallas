import { useMemo } from "react";
import { Link } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import CashFlowCard from "../components/CashFlowCard";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, chargesInRange, computeStats, groupBy, pendingDeliveryValue, periodRange,
  remainingToAmortize, soldItems,
} from "../lib/calc";
import { eur, eur2, num, pct } from "../lib/format";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import { HINT, LABEL } from "../lib/lexicon";
import type { Period } from "../types";

/** Montant retranché : le signe n'apparaît que si la valeur est non nulle. */
const deducted = (v: number) => (v > 0 ? `−${eur2(v)}` : eur2(0));

export default function Bilan() {
  const { state } = useStore();
  const [period, setPeriod] = usePref<Period>("period", "month");

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range), [state, range]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );
  const byBrand = useMemo(() => groupBy(soldItems(state.items, range), "brand"), [state.items, range]);
  const sold = useMemo(() => soldItems(state.items, range), [state.items, range]);

  const tva = vatDue(regime, stats.ca, stats.marge);
  const charges = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const sleeping = useMemo(() => pendingDeliveryValue(state.items), [state.items]);
  const immo = useMemo(() => remainingToAmortize(state.expenses), [state.expenses]);
  const sleepingCount = state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length;
  const net = stats.marge - tva - charges;

  /* ---- détail des coûts de la période ---- */
  const detail = useMemo(() => {
    const achat = sold.reduce((a, i) => a + num(i.cost), 0);
    const fraisAchat = sold.reduce((a, i) => a + num(i.fees), 0);
    const commissions = sold.reduce((a, i) => a + num(i.saleFees), 0);
    const portPaye = sold.reduce((a, i) => a + num(i.shippingCost), 0);
    const portRecu = sold.reduce((a, i) => a + num(i.shippingPaid), 0);
    return { achat, fraisAchat, commissions, portPaye, portRecu, charges };
  }, [sold, charges]);

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

      <CashFlowCard state={state} range={range} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Ce que vous possédez</h3>
          <div className="spacer" />
          <span className="hint">Photo à aujourd'hui, toutes périodes confondues</span>
        </div>
        <div className="card-b balance-grid">
          <Link className="balance-row" to={links.stock({ status: "stock" })}>
            <span className="bl-label">Stock<small>Articles non vendus, à leur coût total</small></span>
            <b className="num">{eur(stats.engaged)}</b>
          </Link>
          <Link className="balance-row" to={links.livraison({ tab: "faire" })}>
            <span className="bl-label">Argent dormant<small>Ventes payées, colis pas encore parti</small></span>
            <b className="num">{eur(sleeping)}</b>
          </Link>
          <Link className="balance-row" to={links.charges()}>
            <span className="bl-label">Matériel non encore absorbé<small>Ce qu'il reste à étaler de vos achats pour l'activité</small></span>
            <b className="num">{eur(immo)}</b>
          </Link>
          <div className="balance-row total">
            <span className="bl-label">Total immobilisé</span>
            <b className="num">{eur(stats.engaged + sleeping + immo)}</b>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Capital engagé"
          value={eur(stats.engaged)}
          meta="Immobilisé dans le stock non vendu"
          tone="info"
          to={links.stock({ status: "stock" })}
          hint="Stock"
        />
        <Kpi
          label="Argent dormant"
          value={eur(sleeping)}
          meta={sleepingCount
            ? `${sleepingCount} vente${sleepingCount > 1 ? "s" : ""} payée${sleepingCount > 1 ? "s" : ""} mais pas encore livrée${sleepingCount > 1 ? "s" : ""}`
            : "Toutes les ventes payées sont livrées"}
          tone={sleepingCount ? "warn" : "ok"}
          to={links.livraison({ tab: "faire" })}
          hint="Livraison"
        />
        <Kpi label="Marge réalisée" value={eur(stats.marge)} meta={`${pct(stats.margePct)} du CA · ${range.label}`} tone="ok" />
        <Kpi
          label="Charges générales"
          value={eur(charges)}
          meta="Matériel, emballages, abonnements amortis"
          to={links.charges()}
          hint="Charges"
        />
        <Kpi
          label="Marge nette finale"
          value={eur(net)}
          meta={regime.subject ? `TVA −${eur(tva)} · charges −${eur(charges)}` : `Charges −${eur(charges)}`}
          tone={net >= 0 ? "ok" : "warn"}
        />
      </div>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}

      <div className="cols two">
        <div className="card">
          <div className="card-h">
            <h3>Compte de résultat</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
          <div className="card-b">
            <div className="totrow"><span>Chiffre d'affaires</span><b className="num">{eur2(stats.ca)}</b></div>
            <div className="totrow"><span>{LABEL.shippingPaid}</span><b className="num">{detail.portRecu ? `+${eur2(detail.portRecu)}` : eur2(0)}</b></div>
            <hr className="sep" />
            <div className="totrow"><span>{LABEL.cost} des articles vendus</span><b className="num">{deducted(detail.achat)}</b></div>
            <div className="totrow"><span>{LABEL.fees} <span className="hint">({HINT.fees.toLowerCase()})</span></span><b className="num">{deducted(detail.fraisAchat)}</b></div>
            <div className="totrow"><span>{LABEL.saleFees}</span><b className="num">{deducted(detail.commissions)}</b></div>
            <div className="totrow"><span>{LABEL.shippingCost}</span><b className="num">{deducted(detail.portPaye)}</b></div>
            <div className="totrow big" style={{ fontSize: 15 }}>
              <span>Marge réalisée</span><b className={`num ${stats.marge >= 0 ? "pos" : "neg"}`}>{eur2(stats.marge)}</b>
            </div>
            {regime.subject && (
              <div className="totrow"><span>TVA {regime.scheme === "marge" ? "sur la marge" : "sur le prix"} ({regime.rate} %)</span><b className="num">{deducted(tva)}</b></div>
            )}
            <div className="totrow">
              <span>Charges de la période</span>
              <b className="num">{deducted(detail.charges)}</b>
            </div>
            <div className="totrow big">
              <span>Marge nette finale</span>
              <b className={`num ${net >= 0 ? "pos" : "neg"}`}>{eur2(net)}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Répartition par marque</h3>
            <div className="spacer" />
            <span className="hint">Marge dégagée sur la période</span>
          </div>
          {byBrand.length === 0 ? (
            <Empty glyph="%" title="Pas encore de vente">Aucune marge à répartir sur cette période.</Empty>
          ) : (
            <div className="card-b">
              <BarList
                rows={byBrand.slice(0, 12).map((b) => ({
                  key: b.key,
                  label: b.key,
                  value: Math.max(0, b.marge),
                  display: eur(b.marge),
                  note: `${b.qty} article${b.qty > 1 ? "s" : ""}`,
                }))}
              />
            </div>
          )}
        </div>
      </div>

    </>
  );
}
