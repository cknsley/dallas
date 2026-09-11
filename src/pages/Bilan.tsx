import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import CashFlowCard from "../components/CashFlowCard";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, chargesInRange, computeStats, costOf, expenseMonthlyShare, groupBy,
  pendingDeliveryValue, periodRange, qtyOf, remainingToAmortize, revenueOf, soldItems,
} from "../lib/calc";
import { dshort, eur, eur2, num, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import { HINT, LABEL } from "../lib/lexicon";
import type { Period } from "../types";

interface BalanceLine { key: string; label: string; note: string; amount: number; }

/** Une ligne de patrimoine qui se déplie sur ce qui la compose. */
function BalanceRow({
  id, label, note, amount, lines, open, onToggle, to, linkLabel, emptyNote,
}: {
  id: string;
  label: string;
  note: string;
  amount: number;
  lines: BalanceLine[];
  open: string;
  onToggle: (v: string) => void;
  to: string;
  linkLabel: string;
  emptyNote: string;
}) {
  const isOpen = open === id;
  return (
    <div className={`balance-block${isOpen ? " open" : ""}`}>
      <button className="balance-row" onClick={() => onToggle(isOpen ? "" : id)} aria-expanded={isOpen}>
        <span className="bl-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        <span className="bl-label">{label}<small>{note}</small></span>
        <b className="num">{eur(amount)}</b>
      </button>
      {isOpen && (
        <div className="balance-detail">
          {lines.length === 0 ? (
            <div className="hint">{emptyNote}</div>
          ) : (
            lines.map((l) => (
              <div className="balance-line" key={l.key}>
                <span className="bl-label">{l.label}<small>{l.note}</small></span>
                <b className="num">{eur2(l.amount)}</b>
              </div>
            ))
          )}
          <Link className="btn sm" to={to} style={{ alignSelf: "flex-start" }}>{linkLabel} →</Link>
        </div>
      )}
    </div>
  );
}

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
  const [openRow, setOpenRow] = useState("");

  const heldItems = useMemo(
    () => state.items.filter((i) => i.status !== "vendu").sort((a, b) => costOf(b) - costOf(a)),
    [state.items],
  );
  const pendingItems = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "vendu" && i.delivery === "commandee")
        .sort((a, b) => revenueOf(b) - revenueOf(a)),
    [state.items],
  );
  // Part de chaque charge qui n'a pas encore pesé sur la marge.
  const remainingByExpense = useMemo(
    () =>
      state.expenses
        .map((e) => ({
          key: e.id,
          label: e.label || "Sans nom",
          note: `${e.category || "Autre"} · ${eur2(expenseMonthlyShare(e))} par mois`,
          amount: remainingToAmortize([e]),
        }))
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [state.expenses],
  );
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
          <BalanceRow
            id="stock"
            label="Stock"
            note="Articles non vendus, à leur coût total"
            amount={stats.engaged}
            open={openRow}
            onToggle={setOpenRow}
            to={links.stock({ status: "stock" })}
            linkLabel="Ouvrir le stock"
            lines={heldItems.map((i) => ({
              key: i.id,
              label: i.name || "Sans nom",
              note: `${i.brand || "—"}${i.size ? ` · ${i.size}` : ""}${qtyOf(i) > 1 ? ` · ×${qtyOf(i)}` : ""} · ${STATUS_LABEL[i.status]}`,
              amount: costOf(i),
            }))}
            emptyNote="Aucun article en stock."
          />
          <BalanceRow
            id="sleeping"
            label="Argent dormant"
            note="Ventes payées, colis pas encore parti"
            amount={sleeping}
            open={openRow}
            onToggle={setOpenRow}
            to={links.livraison({ tab: "faire" })}
            linkLabel="Ouvrir les livraisons"
            lines={pendingItems.map((i) => ({
              key: i.id,
              label: i.name || "Sans nom",
              note: `${i.buyer || "Acheteur non renseigné"}${i.platform ? ` · ${i.platform}` : ""} · vendu le ${dshort(i.saleDate)}`,
              amount: revenueOf(i),
            }))}
            emptyNote="Toutes les ventes payées sont livrées."
          />
          <BalanceRow
            id="immo"
            label="Matériel non encore absorbé"
            note="Ce qu'il reste à étaler de vos achats pour l'activité"
            amount={immo}
            open={openRow}
            onToggle={setOpenRow}
            to={links.charges()}
            linkLabel="Ouvrir les charges"
            lines={remainingByExpense}
            emptyNote="Aucune charge en cours d'étalement."
          />
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
