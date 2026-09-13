import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import CashFlowCard from "../components/CashFlowCard";
import RentabilitePanel from "../components/RentabilitePanel";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, chargesInRange, chargesByKind, computeStats, costOf, expenseMonthlyShare,
  filterItemsByDomain, groupBy, pendingDeliveryValue, periodRange, qtyOf, remainingToAmortize, revenueOf,
  soldItems,
} from "../lib/calc";
import { dshort, eur, eur2, num, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import type { Item, Period } from "../types";



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



export default function Bilan() {
  const { state } = useStore();
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [domain, setDomain] = usePref<"all" | "fashion" | "tcg">("bilanDomain", "all");
  const [searchParams] = useSearchParams();

  // Arrivée depuis le hub d'un secteur (?secteur=tcg|fashion) : on pré-sélectionne ce domaine.
  useEffect(() => {
    const secteur = searchParams.get("secteur");
    if (secteur === "tcg" || secteur === "fashion") setDomain(secteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const domainItems = useMemo(() => filterItemsByDomain(state.items, domain), [state.items, domain]);
  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range, domain), [state, range, domain]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(domainItems, new Date().getFullYear())),
    [state.settings, domainItems],
  );
  const byBrand = useMemo(() => groupBy(soldItems(domainItems, range), "brand"), [domainItems, range]);
  const byType = useMemo(() => groupBy(soldItems(domainItems, range), "type"), [domainItems, range]);
  const sold = useMemo(() => soldItems(domainItems, range), [domainItems, range]);

  const tva = vatDue(regime, stats.ca, stats.marge);
  const charges = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const chargesKinds = useMemo(() => chargesByKind(state.expenses, range), [state.expenses, range]);
  const sleeping = useMemo(() => pendingDeliveryValue(domainItems), [domainItems]);
  const immo = useMemo(() => remainingToAmortize(state.expenses), [state.expenses]);
  const [openRow, setOpenRow] = useState("");

  const heldItems = useMemo(
    () => domainItems.filter((i: Item) => i.status !== "vendu").sort((a: Item, b: Item) => costOf(b) - costOf(a)),
    [domainItems],
  );
  const pendingItems = useMemo(
    () => domainItems
      .filter((i: Item) => i.status === "vendu" && i.delivery === "commandee")
      .sort((a: Item, b: Item) => revenueOf(b) - revenueOf(a)),
    [domainItems],
  );
  const remainingByExpense = useMemo(
    () => state.expenses
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

  const sleepingCount = domainItems.filter((i: Item) => i.status === "vendu" && i.delivery === "commandee").length;
  const net = stats.marge - tva - charges;

  // Achats côté bilan
  const detail = useMemo(() => {
    const achat = sold.reduce((a: number, i: Item) => a + num(i.cost), 0);
    const fraisAchat = sold.reduce((a: number, i: Item) => a + num(i.fees), 0);
    const commissions = sold.reduce((a: number, i: Item) => a + num(i.saleFees), 0);
    const portPaye = sold.reduce((a: number, i: Item) => a + num(i.shippingCost), 0);
    const portRecu = sold.reduce((a: number, i: Item) => a + num(i.shippingPaid), 0);
    return { achat, fraisAchat, commissions, portPaye, portRecu, charges };
  }, [sold, charges]);

  // Total achats (stock + arrivage) — côté balance achats
  const stockItems = domainItems.filter((i: Item) => i.status !== "vendu");
  const totalAchats = stockItems.reduce((a: number, i: Item) => a + costOf(i), 0);
  const arrivageItems = domainItems.filter((i: Item) => i.status === "arrivage");
  const arrivageVal = arrivageItems.reduce((a: number, i: Item) => a + costOf(i), 0);
  const stockSeulVal = domainItems.filter((i: Item) => i.status === "stock").reduce((a: number, i: Item) => a + costOf(i), 0);

  // Balance ventes
  const allSold = soldItems(domainItems); // toutes périodes
  const totalCA = allSold.reduce((a: number, i: Item) => a + revenueOf(i), 0);
  const totalCost = allSold.reduce((a: number, i: Item) => a + costOf(i), 0);
  const totalSaleCosts = allSold.reduce((a: number, i: Item) => a + num(i.saleFees) + num(i.shippingCost) - num(i.shippingPaid), 0);
  const totalMargeGlobale = totalCA - totalCost - Math.max(0, totalSaleCosts);
  const roiGlobal = totalCost > 0 ? (totalMargeGlobale / totalCost) * 100 : 0;


  return (
    <>
      <HeaderActions>
        <Segmented<"all" | "fashion" | "tcg">
          value={domain}
          onChange={setDomain}
          options={[
            { value: "all", label: "🌐 Tout" },
            { value: "fashion", label: "👕 Vêtements & Fashion" },
            { value: "tcg", label: "🃏 TCG & Cartes" },
          ]}
        />
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

      {/* ── TRÉSORERIE ── */}
      <CashFlowCard state={state} range={range} />

      {/* ── RENTABILITÉ ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>📊 Rentabilité</h3>
          <div className="spacer" />
          <span className="hint">{range.label} · toutes ventes confondues</span>
        </div>
        <div className="card-b">
          {/* Ligne principale : CA / Marge brute / Charges / Marge nette */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
            {[
              {
                label: "Chiffre d'affaires",
                value: eur2(stats.ca),
                sub: `${stats.count} vente${stats.count > 1 ? "s" : ""}`,
                color: "var(--accent-glow)",
                icon: "💰",
              },
              {
                label: "Marge brute",
                value: eur2(stats.marge),
                sub: stats.ca > 0 ? `${pct((stats.marge / stats.ca) * 100)} du CA` : "–",
                color: stats.marge >= 0 ? "var(--ok)" : "var(--bad)",
                icon: "📈",
              },
              {
                label: "Charges (période)",
                value: `−${eur2(charges)}`,
                sub: `${state.expenses.length} charge(s) imputée(s)`,
                color: "var(--warn)",
                icon: "📋",
              },
              {
                label: "Marge nette",
                value: eur2(net),
                sub: stats.ca > 0 ? `${pct((net / stats.ca) * 100)} du CA` : "–",
                color: net >= 0 ? "var(--ok)" : "var(--bad)",
                icon: "🎯",
              },
            ].map((cell) => (
              <div
                key={cell.label}
                style={{
                  padding: "16px 18px",
                  background: "var(--surface)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  {cell.icon} {cell.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: cell.color, fontVariantNumeric: "tabular-nums" }}>
                  {cell.value}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{cell.sub}</div>
              </div>
            ))}
          </div>

          {/* Ligne secondaire : ROI / Coûts d'achat / Commissions / Port */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 14 }}>
            {[
              {
                label: "ROI",
                value: `${pct(roiGlobal)}`,
                hint: "Marge / coûts d'achat (tout temps)",
                good: roiGlobal > 0,
              },
              {
                label: "Coût d'achat moyen",
                value: eur2(stats.count > 0 ? detail.achat / stats.count : 0),
                hint: `Total coûts vendus : ${eur(detail.achat)}`,
                good: true,
              },
              {
                label: "Commissions plateformes",
                value: eur2(detail.commissions),
                hint: `${stats.ca > 0 ? pct((detail.commissions / stats.ca) * 100) : "0 %"} du CA`,
                good: detail.commissions === 0,
              },
              {
                label: "Port payé",
                value: eur2(detail.portPaye),
                hint: `Port refacturé : +${eur2(detail.portRecu)}`,
                good: detail.portPaye <= detail.portRecu,
              },
              {
                label: "Capital immobilisé",
                value: eur2(stats.engaged),
                hint: `${heldItems.length} article(s) en stock/arrivage`,
                good: false,
              },
            ].map((cell) => (
              <div
                key={cell.label}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--surface-sub)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {cell.label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: cell.good ? "var(--ok)" : "var(--ink-1)" }}>
                  {cell.value}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{cell.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PANNEAU DÉTAILLÉ DE RENTABILITÉ DES VENTES ── */}
      <RentabilitePanel state={state} />

      {/* ── KPIs RAPIDES ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
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
          to={links.livraison()}
          hint="Livraison"
        />
        <Kpi
          label="Marge réalisée"
          value={eur(stats.marge)}
          meta={stats.ca ? `${pct(stats.margePct)} du CA · ${range.label}` : `Aucune vente sur ${range.label.toLowerCase()}`}
          tone="ok"
          to={links.ventes()}
          hint="Ventes"
        />
        <Kpi
          label="Charges imputées"
          value={eur(charges)}
          meta="Matériel, emballages, abonnements amortis"
          to={links.charges()}
          hint="Charges"
        />
        <Kpi
          label="Marge nette finale"
          value={eur(net)}
          meta={
            stats.ca === 0 && charges > 0
              ? `Charges générales de ${range.label.toLowerCase()}, avant la première vente`
              : regime.subject
                ? `TVA −${eur(tva)} · charges générales −${eur(charges)}`
                : `Charges générales −${eur(charges)}`
          }
          tone={net >= 0 ? "ok" : "warn"}
        />
      </div>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}

      {/* ── CE QUE VOUS POSSÉDEZ ── */}
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

      {/* ── BALANCE ACHATS + BALANCE VENTES côte à côte ── */}
      <div className="cols two" style={{ marginBottom: 16 }}>
        {/* Balance achats */}
        <div className="card">
          <div className="card-h">
            <h3>📦 Balance achats</h3>
            <div className="spacer" />
            <span className="hint">Stock actuel</span>
          </div>
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
        </div>

        {/* Balance ventes */}
        <div className="card">
          <div className="card-h">
            <h3>🏷️ Balance ventes</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
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
        </div>
      </div>

      {/* ── RÉPARTITION PAR MARQUE + TYPE ── */}
      <div className="cols two" style={{ marginBottom: 16 }}>
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
                  to: links.ventes({ brand: b.key }),
                }))}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Détail par type de produit</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
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
        </div>
      </div>

    </>
  );
}
