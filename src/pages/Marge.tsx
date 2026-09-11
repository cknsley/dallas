import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { BarList, Empty, Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import {
  caOfYear, chargesInRange, computeStats, costOf, groupBy, pendingDeliveryValue, periodRange,
  revenueOf, saleCostsOf, soldItems,
} from "../lib/calc";
import { eur, eur2, num, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { vatDue, vatRegime } from "../lib/vat";
import { links } from "../lib/links";
import { HINT, LABEL } from "../lib/lexicon";
import type { Period } from "../types";

/** Montant retranché : le signe n'apparaît que si la valeur est non nulle. */
const deducted = (v: number) => (v > 0 ? `−${eur2(v)}` : eur2(0));

interface BuyLine { id: string; label: string; price: string; fees: string; estimate: string; }
interface SellLine { id: string; label: string; price: string; shippingPaid: string; saleFees: string; shippingCost: string; }

const newBuyLine = (): BuyLine => ({ id: Math.random().toString(36).slice(2), label: "", price: "", fees: "", estimate: "" });
const newSellLine = (): SellLine => ({ id: Math.random().toString(36).slice(2), label: "", price: "", shippingPaid: "", saleFees: "", shippingCost: "" });

export default function Marge() {
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
          hint="Détail"
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
            <h3>Détail des coûts</h3>
            <div className="spacer" />
            <span className="hint">{range.label}</span>
          </div>
          <div className="card-b">
            <div className="totrow"><span>Chiffre d'affaires</span><b className="num">{eur2(stats.ca)}</b></div>
            <div className="totrow"><span>{LABEL.shippingPaid}</span><b className="num">{detail.portRecu ? `+${eur2(detail.portRecu)}` : eur2(0)}</b></div>
            <hr className="sep" />
            <div className="totrow"><span>{LABEL.cost} des pièces vendues</span><b className="num">{deducted(detail.achat)}</b></div>
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
              <span>Charges générales amorties</span>
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
                  note: `${b.qty} pièce${b.qty > 1 ? "s" : ""}`,
                }))}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <MargeCalculators regime={regime} />
      </div>
    </>
  );
}

/* ============================ CALCULATRICES ============================ */

function MargeCalculators({ regime }: { regime: ReturnType<typeof vatRegime> }) {
  const [mode, setMode] = usePref<"achat" | "vente">("calcMode", "vente");
  return (
    <div className="card">
      <div className="card-h">
        <h3>Calculatrice « et si »</h3>
        <div className="spacer" />
        <Segmented<"achat" | "vente">
          value={mode}
          onChange={setMode}
          options={[
            { value: "achat", label: "Achat" },
            { value: "vente", label: "Vente" },
          ]}
        />
      </div>
      {mode === "achat" ? <BuyCalculator /> : <SellCalculator regime={regime} />}
    </div>
  );
}

/** Simule un lot à acquérir, avant même qu'il entre en stock. */
function BuyCalculator() {
  const [lines, setLines] = useState<BuyLine[]>([]);
  const patch = (id: string, p: Partial<BuyLine>) => setLines((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const totals = useMemo(() => {
    let price = 0, fees = 0, estimate = 0, estimatedLines = 0;
    for (const l of lines) {
      price += num(l.price);
      fees += num(l.fees);
      if (l.estimate) { estimate += num(l.estimate); estimatedLines++; }
    }
    const engaged = price + fees;
    const margin = estimate - engaged;
    return { price, fees, engaged, estimate, margin, estimatedLines };
  }, [lines]);

  return (
    <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="note info">
        <span className="glyph">≡</span>
        <div>Simulez l'achat d'un lot ou d'une pièce avant de l'ajouter au stock — prix, frais, et une estimation de revente pour juger si l'affaire est bonne.</div>
      </div>

      {lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lines.map((l) => {
            const engaged = num(l.price) + num(l.fees);
            const margin = l.estimate ? num(l.estimate) - engaged : null;
            return (
              <div key={l.id} className="calc-line">
                <div className="calc-line-h">
                  <input type="text" value={l.label} placeholder="Ex. lot de 5 vestes" onChange={(e) => patch(l.id, { label: e.target.value })} />
                  <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.id !== l.id))}>✕</button>
                </div>
                <div className="calc-line-grid">
                  <label><span>{LABEL.cost}</span><input type="number" step="0.01" value={l.price} placeholder="0,00" onChange={(e) => patch(l.id, { price: e.target.value })} /></label>
                  <label><span>{LABEL.fees}</span><input type="number" step="0.01" value={l.fees} placeholder={HINT.fees} onChange={(e) => patch(l.id, { fees: e.target.value })} /></label>
                  <label><span>{LABEL.estimate}</span><input type="number" step="0.01" value={l.estimate} placeholder="0,00" onChange={(e) => patch(l.id, { estimate: e.target.value })} /></label>
                </div>
                <div className="hint num" style={{ textAlign: "right" }}>
                  Engagé {eur2(engaged)}{margin !== null && <> · marge estimée <span className={margin >= 0 ? "pos" : "neg"}>{eur2(margin)}</span></>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn ghost sm" onClick={() => setLines((l) => [...l, newBuyLine()])} style={{ alignSelf: "flex-start" }}>
        + Ajouter une pièce
      </button>

      <div>
        <div className="totrow"><span>{LABEL.cost} total</span><b className="num">{eur2(totals.price)}</b></div>
        <div className="totrow"><span>{LABEL.fees}</span><b className="num">+{eur2(totals.fees)}</b></div>
        <div className="totrow big"><span>Capital à engager</span><b className="num">{eur2(totals.engaged)}</b></div>
        {totals.estimatedLines > 0 && (
          <>
            <div className="totrow" style={{ marginTop: 6 }}><span>Revente estimée ({totals.estimatedLines} pièce{totals.estimatedLines > 1 ? "s" : ""})</span><b className="num">{eur2(totals.estimate)}</b></div>
            <div className="totrow big">
              <span>Marge potentielle estimée</span>
              <b className={`num ${totals.margin >= 0 ? "pos" : "neg"}`}>{eur2(totals.margin)}</b>
            </div>
            <div className="hint" style={{ textAlign: "right" }}>ROI estimé {pct(totals.engaged ? (totals.margin / totals.engaged) * 100 : 0)}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Simule une vente : pièces du stock au choix, plus des lignes hypothétiques, port et commission compris. */
function SellCalculator({ regime }: { regime: ReturnType<typeof vatRegime> }) {
  const { state } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<SellLine[]>([]);
  const [query, setQuery] = useState("");

  const pickable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.items.filter((i) => !needle || [i.name, i.brand, i.type, i.size].join(" ").toLowerCase().includes(needle));
  }, [state.items, query]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const patch = (id: string, p: Partial<SellLine>) => setLines((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const sim = useMemo(() => {
    const picked = state.items.filter((i) => selected.has(i.id));
    let ca = picked.reduce((a, i) => a + revenueOf(i), 0);
    let cost = picked.reduce((a, i) => a + costOf(i) + saleCostsOf(i), 0);
    for (const l of lines) {
      ca += num(l.price) + num(l.shippingPaid);
      cost += num(l.saleFees) + num(l.shippingCost);
    }
    const marge = ca - cost;
    const simTva = vatDue(regime, ca, marge);
    return { ca, cost, marge, tva: simTva, net: marge - simTva, count: picked.length + lines.length };
  }, [state.items, selected, lines, regime]);

  return (
    <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="field">
        <span>Pièces du stock — {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
        <input type="search" value={query} placeholder="Filtrer la liste…" onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="picker">
        {pickable.length === 0 ? (
          <div className="empty" style={{ padding: 22 }}>Aucune pièce ne correspond</div>
        ) : (
          pickable.map((i) => (
            <div key={i.id} className={`prow${selected.has(i.id) ? " sel" : ""}`} onClick={() => toggle(i.id)}>
              <input type="checkbox" readOnly checked={selected.has(i.id)} tabIndex={-1} style={{ accentColor: "var(--accent)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }} className="ellipsis">{i.name || "Sans nom"}</div>
                <div className="hint">{i.brand || "—"}{i.size ? ` · ${i.size}` : ""} · {STATUS_LABEL[i.status]}</div>
              </div>
              <div className="num" style={{ fontSize: 12, textAlign: "right" }}>
                {eur2(revenueOf(i))}
                <div className="hint num">−{eur2(costOf(i) + saleCostsOf(i))}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lines.map((l) => {
            const ca = num(l.price) + num(l.shippingPaid);
            const cost = num(l.saleFees) + num(l.shippingCost);
            return (
              <div key={l.id} className="calc-line">
                <div className="calc-line-h">
                  <input type="text" value={l.label} placeholder="Hypothèse de vente" onChange={(e) => patch(l.id, { label: e.target.value })} />
                  <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.id !== l.id))}>✕</button>
                </div>
                <div className="calc-line-grid">
                  <label><span>{LABEL.price}</span><input type="number" step="0.01" value={l.price} placeholder="0,00" onChange={(e) => patch(l.id, { price: e.target.value })} /></label>
                  <label><span>{LABEL.shippingPaid}</span><input type="number" step="0.01" value={l.shippingPaid} placeholder="0,00" onChange={(e) => patch(l.id, { shippingPaid: e.target.value })} /></label>
                  <label><span>{LABEL.saleFees}</span><input type="number" step="0.01" value={l.saleFees} placeholder="0,00" onChange={(e) => patch(l.id, { saleFees: e.target.value })} /></label>
                  <label><span>{LABEL.shippingCost}</span><input type="number" step="0.01" value={l.shippingCost} placeholder="0,00" onChange={(e) => patch(l.id, { shippingCost: e.target.value })} /></label>
                </div>
                <div className="hint num" style={{ textAlign: "right" }}>
                  Encaissé {eur2(ca)} · marge {eur2(ca - cost)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn ghost sm" onClick={() => setLines((l) => [...l, newSellLine()])} style={{ alignSelf: "flex-start" }}>
        + Ajouter une vente hypothétique
      </button>

      <div>
        <div className="totrow"><span>Encaissé simulé (port compris)</span><b className="num">{eur2(sim.ca)}</b></div>
        <div className="totrow"><span>{LABEL.totalCost} + {LABEL.saleCosts.toLowerCase()}</span><b className="num">{deducted(sim.cost)}</b></div>
        {regime.subject && (
          <div className="totrow">
            <span>TVA {regime.scheme === "marge" ? "sur la marge" : "sur le prix"} ({regime.rate} %)</span>
            <b className="num">{deducted(sim.tva)}</b>
          </div>
        )}
        <div className="totrow big">
          <span>{regime.subject ? "Marge nette" : "Marge"}</span>
          <b className={`num ${sim.net >= 0 ? "pos" : "neg"}`}>{eur2(sim.net)}</b>
        </div>
        <div className="hint" style={{ textAlign: "right" }}>
          {sim.count} ligne{sim.count > 1 ? "s" : ""} · ROI {pct(sim.cost ? (sim.net / sim.cost) * 100 : 0)}
        </div>
      </div>
    </div>
  );
}
