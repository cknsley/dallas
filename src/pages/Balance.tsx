import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { BarList, Empty, RangePicker, Section } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import {
  caOfYear, chargesByKind, computeStats, costOf, purchaseFeesOf,
  groupBy, pendingDeliveryValue, qtyOf, remainingToAmortize, revenueOf, soldItems,
} from "../lib/calc";
import { eur, eur2, num } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import type { Item } from "../types";

interface BalanceLine { key: string; label: string; note: string; amount: number; }

function BalanceRow({
  id, label, note, amount, lines, open, onToggle, to, linkLabel, emptyNote,
}: {
  id: string; label: string; note: string; amount: number; lines: BalanceLine[];
  open: string; onToggle: (v: string) => void; to: string; linkLabel: string; emptyNote: string;
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

export default function Balance() {
  const { state } = useStore();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("balance");
  const [openRow, setOpenRow] = useState("");
  const domain = "all";
  const domainItems = useMemo(() => state.items, [state.items]);
  const stats = useMemo(() => computeStats(state, range, domain), [state, range, domain]);
  
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(domainItems, new Date().getFullYear())),
    [state.settings, domainItems],
  );
  
  const tva = vatDue(regime, stats.ca, stats.marge);
  const chargesKinds = useMemo(() => chargesByKind(state.expenses, range), [state.expenses, range]);
  
  const heldItems = useMemo(
    () => domainItems.filter((i: Item) => i.status !== "vendu"),
    [domainItems]
  );
  const pendingItems = useMemo(
    () => domainItems.filter((i: Item) => i.status === "vendu" && i.delivery === "non_payee"),
    [domainItems]
  );
  const sleeping = pendingDeliveryValue(domainItems);

  const expenses = state.expenses;
  const immo = expenses
    .filter((e) => e.amortizeMonths > 1)
    .reduce((a, e) => a + remainingToAmortize([e]), 0);
  const remainingByExpense = expenses
    .filter((e) => e.amortizeMonths > 1 && remainingToAmortize([e]) > 0)
    .map((e) => ({
      key: e.id,
      label: e.label,
      note: `${eur(remainingToAmortize([e]))} restants / ${eur(e.amount)} (${e.amortizeMonths} mois)`,
      amount: remainingToAmortize([e]),
    }));

  const arrivageVal = heldItems.filter((i: Item) => i.status === "arrivage").reduce((a: number, i: Item) => a + costOf(i), 0);
  const stockSeulVal = heldItems.filter((i: Item) => i.status === "stock").reduce((a: number, i: Item) => a + costOf(i), 0);
  const totalAchats = arrivageVal + stockSeulVal;
  
  const sold = useMemo(() => soldItems(domainItems, range), [domainItems, range]);
  
  const detail = useMemo(() => {
    const achat = sold.reduce((a: number, i: Item) => a + num(i.cost), 0);
    const fraisAchat = sold.reduce((a: number, i: Item) => a + purchaseFeesOf(i), 0);
    const commissions = sold.reduce((a: number, i: Item) => a + num(i.saleFees), 0);
    const portPaye = sold.reduce((a: number, i: Item) => a + num(i.shippingCost), 0);
    const portRecu = sold.reduce((a: number, i: Item) => a + num(i.shippingPaid), 0);
    return { achat, fraisAchat, commissions, portPaye, portRecu };
  }, [sold]);
  
  const net = stats.marge - tva - (chargesKinds.activite?.total || 0) - (chargesKinds.vente?.total || 0) - (chargesKinds.achat?.total || 0);

  const byBrand = useMemo(() => groupBy(sold, "brand"), [sold]);
  const byType = useMemo(() => groupBy(sold, "type"), [sold]);

  return (
    <>
      <HeaderActions>
        <span className="hint">Ce que vous possédez et le détail de vos flux achats/ventes</span>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      {/* ── CE QUE VOUS POSSÉDEZ ── */}
      <Section title="Ce que vous possédez" right={<span className="hint">Photo à aujourd'hui, toutes périodes confondues</span>}>
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
            lines={heldItems.map((i: Item) => ({
              key: i.id,
              label: i.name || "Sans nom",
              note: `${i.brand || "—"}${i.size ? ` · ${i.size}` : ""}${qtyOf(i) > 1 ? ` · ×${qtyOf(i)}` : ""} · ${STATUS_LABEL[i.status as keyof typeof STATUS_LABEL] || i.status}`,
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
            to={links.livraison()}
            linkLabel="Ouvrir les livraisons"
            lines={pendingItems.map((i: Item) => ({
              key: i.id,
              label: i.name || "Sans nom",
              note: `${i.buyer || "Acheteur non renseigné"}${i.platform ? ` · ${i.platform}` : ""} · vendu le ${i.saleDate ? i.saleDate : "—"}`,
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
      </Section>

      {/* ── BALANCE ACHATS + BALANCE VENTES côte à côte ── */}
      <div className="cols two" style={{ marginBottom: 16 }}>
        {/* Balance achats */}
        <Section title="📦 Balance achats" right={<span className="hint">Stock actuel</span>}>
          <div className="card-b">
            <div className="totrow">
              <span>Stock en boutique</span>
              <b className="num">{eur2(stockSeulVal)}</b>
            </div>
            <div className="totrow">
              <span>Arrivages en cours</span>
              <b className="num">{eur2(arrivageVal)}</b>
            </div>
            <div className="totrow big">
              <span>Total immobilisé</span>
              <b className="num" style={{ color: "var(--accent-glow)" }}>{eur2(totalAchats)}</b>
            </div>
            <hr className="sep" />
            <div className="totrow">
              <span>Coût d'achat vendus ({range.label})</span>
              <b className="num">{eur2(detail.achat)}</b>
            </div>
            <div className="totrow">
              <span>Frais d'achat</span>
              <b className="num">{eur2(detail.fraisAchat)}</b>
            </div>
            <div className="totrow">
              <span>Charges achat (période)</span>
              <b className="num">{eur2(chargesKinds.achat?.total ?? 0)}</b>
            </div>
            <div className="totrow big" style={{ marginTop: 8 }}>
              <span>Total sorties achat</span>
              <b className="num" style={{ color: "var(--warn)" }}>
                {eur2(detail.achat + detail.fraisAchat + (chargesKinds.achat?.total ?? 0))}
              </b>
            </div>
            <Link className="btn sm ghost" to={links.fournisseurs()} style={{ marginTop: 8, alignSelf: "flex-start" }}>
              Fournisseurs →
            </Link>
          </div>
        </Section>

        {/* Balance ventes */}
        <Section title="🏷️ Balance ventes" right={<span className="hint">{range.label}</span>}>
          <div className="card-b">
            <div className="totrow">
              <span>Chiffre d'affaires</span>
              <b className="num" style={{ color: "var(--accent-glow)" }}>{eur2(stats.ca)}</b>
            </div>
            <div className="totrow">
              <span>Port refacturé</span>
              <b className="num">+{eur2(detail.portRecu)}</b>
            </div>
            <hr className="sep" />
            <div className="totrow">
              <span>Coût des articles vendus</span>
              <b className="num">−{eur2(detail.achat)}</b>
            </div>
            <div className="totrow">
              <span>Commissions plateformes</span>
              <b className="num">−{eur2(detail.commissions)}</b>
            </div>
            <div className="totrow">
              <span>Port payé</span>
              <b className="num">−{eur2(detail.portPaye)}</b>
            </div>
            <div className="totrow">
              <span>Charges vente (période)</span>
              <b className="num">−{eur2(chargesKinds.vente?.total ?? 0)}</b>
            </div>
            <div className="totrow big" style={{ marginTop: 8 }}>
              <span>Marge brute</span>
              <b className={`num ${stats.marge >= 0 ? "pos" : "neg"}`}>{eur2(stats.marge)}</b>
            </div>
            <div className="totrow">
              <span>Charges générales (période)</span>
              <b className="num">−{eur2(chargesKinds.activite?.total ?? 0)}</b>
            </div>
            {regime.subject && (
              <div className="totrow">
                <span>TVA collectée</span>
                <b className="num">−{eur2(tva)}</b>
              </div>
            )}
            <div className="totrow big">
              <span>Marge nette</span>
              <b className={`num ${net >= 0 ? "pos" : "neg"}`}>{eur2(net)}</b>
            </div>
            <Link className="btn sm ghost" to={links.ventes()} style={{ marginTop: 8, alignSelf: "flex-start" }}>
              Toutes les ventes →
            </Link>
          </div>
        </Section>
      </div>

      {/* ── RÉPARTITION PAR MARQUE + TYPE ── */}
      <div className="cols two" style={{ marginBottom: 16 }}>
        <Section title="Répartition par marque" right={<span className="hint">Marge dégagée sur la période</span>}>
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
                  to: links.ventes({ brand: b.key }),
                }))}
              />
            </div>
          )}
        </Section>

        <Section title="Détail par type de produit" right={<span className="hint">{range.label}</span>}>
          {byType.length === 0 ? (
            <Empty glyph="▦" title="Pas encore de vente">Aucun article vendu sur cette période.</Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="r">Qté</th>
                    <th className="r">Prix moyen</th>
                    <th className="r">CA</th>
                    <th className="r">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((t) => (
                    <tr key={t.key}>
                      <td>
                        <Link to={links.ventes({ type: t.key === "Sans type" ? undefined : t.key })}>{t.key}</Link>
                      </td>
                      <td className="r num">{t.qty}</td>
                      <td className="r num">{eur2(t.qty ? t.ca / t.qty : 0)}</td>
                      <td className="r num">{eur2(t.ca)}</td>
                      <td className={`r num ${t.marge >= 0 ? "pos" : "neg"}`}>{eur2(t.marge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
