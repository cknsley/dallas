import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { caOfYear, costOf, revenueOf, saleCostsOf } from "../lib/calc";
import { eur, eur2, num, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { HINT, LABEL } from "../lib/lexicon";
import { vatDue, vatRegime } from "../lib/vat";
import { uid } from "../lib/id";
import OrderModal, { type OrderPresetLine } from "../modals/OrderModal";
import SellModal from "../modals/SellModal";
import type { Item } from "../types";

const deducted = (v: number) => (v > 0 ? `−${eur2(v)}` : eur2(0));

/* ============================ ACHAT ============================ */

interface BuyLine { id: string; label: string; price: string; fees: string; estimate: string; }
const newBuyLine = (): BuyLine => ({ id: uid(), label: "", price: "", fees: "", estimate: "" });

/** Simule un lot à acheter : ce qu'il engage, ce qu'il peut rapporter,
 *  et jusqu'où on peut monter le prix d'achat sans y perdre. */
function BuyCalculator({ onConvert }: { onConvert: (lines: OrderPresetLine[]) => void }) {
  const [lines, setLines] = useState<BuyLine[]>([newBuyLine()]);
  const [targetMargin, setTargetMargin] = useState("30");
  const patch = (id: string, p: Partial<BuyLine>) => setLines((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const totals = useMemo(() => {
    let price = 0, fees = 0, estimate = 0, withEstimate = 0;
    for (const l of lines) {
      price += num(l.price);
      fees += num(l.fees);
      if (l.estimate) { estimate += num(l.estimate); withEstimate++; }
    }
    const engaged = price + fees;
    return { price, fees, engaged, estimate, margin: estimate - engaged, withEstimate };
  }, [lines]);

  // Prix d'achat maximum pour conserver la marge visée sur la revente estimée.
  const target = Math.max(0, num(targetMargin));
  const maxBuy = totals.estimate > 0 ? totals.estimate * (1 - target / 100) - totals.fees : 0;
  const headroom = maxBuy - totals.price;

  const validLines = lines.filter((l) => l.label.trim() || num(l.price) > 0);

  const handleConvert = () => {
    const presets: OrderPresetLine[] = validLines.map((l) => ({
      name: l.label || "Article simulé",
      cost: l.price,
      fees: l.fees,
      estimate: l.estimate,
    }));
    onConvert(presets.length > 0 ? presets : [{ name: "Lot simulé", cost: String(totals.price), fees: String(totals.fees), estimate: String(totals.estimate) }]);
  };

  return (
    <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="note info">
        <span className="glyph">≡</span>
        <div>Ce que le lot engage, ce qu'il peut rapporter, et le prix d'achat à ne pas dépasser pour tenir votre marge.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.map((l) => {
          const engaged = num(l.price) + num(l.fees);
          const margin = l.estimate ? num(l.estimate) - engaged : null;
          return (
            <div key={l.id} className="calc-line">
              <div className="calc-line-h">
                <input type="text" value={l.label} placeholder="Ex. lot de 5 vestes" onChange={(e) => patch(l.id, { label: e.target.value })} />
                {lines.length > 1 && (
                  <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.id !== l.id))}>✕</button>
                )}
              </div>
              <div className="calc-line-grid">
                <label><span>{LABEL.cost}</span><input type="number" step="0.01" value={l.price} placeholder="0,00" onChange={(e) => patch(l.id, { price: e.target.value })} /></label>
                <label><span>{LABEL.fees}</span><input type="number" step="0.01" value={l.fees} placeholder={HINT.fees} onChange={(e) => patch(l.id, { fees: e.target.value })} /></label>
                <label><span>{LABEL.estimate}</span><input type="number" step="0.01" value={l.estimate} placeholder="0,00" onChange={(e) => patch(l.id, { estimate: e.target.value })} /></label>
              </div>
              <div className="hint num" style={{ textAlign: "right" }}>
                Engagé {eur2(engaged)}
                {margin !== null && <> · marge estimée <span className={margin >= 0 ? "pos" : "neg"}>{eur2(margin)}</span></>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn ghost sm" onClick={() => setLines((l) => [...l, newBuyLine()])}>
          + Ajouter un article au lot
        </button>
        {totals.price > 0 && (
          <button className="btn sm primary" onClick={handleConvert}>
            ⇩ Créer la commande à partir de cette simulation
          </button>
        )}
      </div>

      <div>
        <div className="totrow"><span>{LABEL.cost} du lot</span><b className="num">{eur2(totals.price)}</b></div>
        <div className="totrow"><span>{LABEL.fees}</span><b className="num">+{eur2(totals.fees)}</b></div>
        <div className="totrow big"><span>Capital à engager</span><b className="num">{eur2(totals.engaged)}</b></div>
        {totals.withEstimate > 0 && (
          <>
            <div className="totrow" style={{ marginTop: 6 }}>
              <span>Revente estimée ({totals.withEstimate} article{totals.withEstimate > 1 ? "s" : ""})</span>
              <b className="num">{eur2(totals.estimate)}</b>
            </div>
            <div className="totrow big">
              <span>Marge potentielle</span>
              <b className={`num ${totals.margin >= 0 ? "pos" : "neg"}`}>{eur2(totals.margin)}</b>
            </div>
            <div className="hint" style={{ textAlign: "right" }}>
              ROI estimé {pct(totals.engaged ? (totals.margin / totals.engaged) * 100 : 0)}
            </div>
          </>
        )}
      </div>

      {totals.estimate > 0 && (
        <div className="deal-panel">
          <div className="deal-panel-h">
            <span>Jusqu'où négocier</span>
            <label className="deal-target">
              marge visée
              <input type="number" step="1" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
              %
            </label>
          </div>
          <div className="totrow"><span>Prix d'achat maximum</span><b className="num">{eur2(Math.max(0, maxBuy))}</b></div>
          <div className="totrow">
            <span>{headroom >= 0 ? "Marge de négociation restante" : "Au-dessus du prix maximum"}</span>
            <b className={`num ${headroom >= 0 ? "pos" : "neg"}`}>{eur2(Math.abs(headroom))}</b>
          </div>
          <div className="hint">
            {headroom >= 0
              ? `À ${eur2(Math.max(0, maxBuy))} d'achat vous gardez ${target} % de marge sur une revente à ${eur2(totals.estimate)}.`
              : `Il faut négocier ${eur2(Math.abs(headroom))} de moins pour tenir ${target} % de marge.`}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ VENTE ============================ */

interface SellLine { id: string; label: string; price: string; cost: string; saleFees: string; shippingCost: string; shippingPaid: string; }
const newSellLine = (): SellLine => ({ id: uid(), label: "", price: "", cost: "", saleFees: "", shippingCost: "", shippingPaid: "" });

/** Compose un lot à vendre et montre jusqu'à quelle remise on reste gagnant. */
function SellCalculator({ onSellItem }: { onSellItem: (item: Item, targetPrice: number) => void }) {
  const { state } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<SellLine[]>([]);
  const [query, setQuery] = useState("");
  const [discount, setDiscount] = useState(0);

  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );

  const pickable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.items
      .filter((i) => i.status !== "vendu")
      .filter((i) => !needle || [i.name, i.brand, i.type, i.size].join(" ").toLowerCase().includes(needle));
  }, [state.items, query]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const patch = (id: string, p: Partial<SellLine>) => setLines((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const lot = useMemo(() => {
    const picked = state.items.filter((i) => selected.has(i.id));
    let gross = picked.reduce((a, i) => a + revenueOf(i), 0);
    let cost = picked.reduce((a, i) => a + costOf(i) + saleCostsOf(i), 0);
    for (const l of lines) {
      gross += num(l.price) + num(l.shippingPaid);
      cost += num(l.cost) + num(l.saleFees) + num(l.shippingCost);
    }
    return { gross, cost, count: picked.length + lines.length };
  }, [state.items, selected, lines]);

  const asked = lot.gross * (1 - discount / 100);
  const margin = asked - lot.cost;
  const tva = vatDue(regime, asked, margin);
  const net = margin - tva;
  // Remise maximale avant de vendre à perte.
  const maxDiscount = lot.gross > 0 ? Math.max(0, (1 - lot.cost / lot.gross) * 100) : 0;
  const floorPrice = lot.cost;

  const pickedItems = state.items.filter((i) => selected.has(i.id));

  const handleStartSale = () => {
    if (pickedItems.length === 1) {
      const first = pickedItems[0];
      const targetPrice = first.price ? first.price * (1 - discount / 100) : asked;
      onSellItem(first, targetPrice);
    } else if (pickedItems.length > 1) {
      const first = pickedItems[0];
      const targetPrice = asked / pickedItems.length;
      onSellItem(first, targetPrice);
    }
  };

  return (
    <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="field">
        <span>Articles du lot — {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
        <input type="search" value={query} placeholder="Filtrer le stock…" onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="picker">
        {pickable.length === 0 ? (
          <div className="empty" style={{ padding: 22 }}>Aucun article disponible en stock</div>
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
          {lines.map((l) => (
            <div key={l.id} className="calc-line">
              <div className="calc-line-h">
                <input type="text" value={l.label} placeholder="Article hors stock" onChange={(e) => patch(l.id, { label: e.target.value })} />
                <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.id !== l.id))}>✕</button>
              </div>
              <div className="calc-line-grid">
                <label><span>{LABEL.price}</span><input type="number" step="0.01" value={l.price} placeholder="0,00" onChange={(e) => patch(l.id, { price: e.target.value })} /></label>
                <label><span>{LABEL.totalCost}</span><input type="number" step="0.01" value={l.cost} placeholder="0,00" onChange={(e) => patch(l.id, { cost: e.target.value })} /></label>
                <label><span>{LABEL.saleFees}</span><input type="number" step="0.01" value={l.saleFees} placeholder="0,00" onChange={(e) => patch(l.id, { saleFees: e.target.value })} /></label>
                <label><span>{LABEL.shippingPaid}</span><input type="number" step="0.01" value={l.shippingPaid} placeholder="0,00" onChange={(e) => patch(l.id, { shippingPaid: e.target.value })} /></label>
                <label><span>{LABEL.shippingCost}</span><input type="number" step="0.01" value={l.shippingCost} placeholder="0,00" onChange={(e) => patch(l.id, { shippingCost: e.target.value })} /></label>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((l) => [...l, newSellLine()])}>
        + Ajouter un article hors stock
      </button>

      {lot.count === 0 ? (
        <Empty glyph="%" title="Composez votre lot">
          Cochez des articles du stock pour voir jusqu'où vous pouvez négocier.
        </Empty>
      ) : (
        <>
          <div className="deal-panel">
            <div className="deal-panel-h">
              <span>Remise sur le lot</span>
              <b className="num deal-pct">−{discount} %</b>
            </div>
            <input
              className="deal-slider"
              type="range"
              min={0}
              max={60}
              step={1}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
            <div className="deal-steps">
              {[0, 5, 10, 15, 20, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn sm${discount === d ? " primary" : ""}`}
                  onClick={() => setDiscount(d)}
                >
                  −{d} %
                </button>
              ))}
            </div>
            <div className={`note ${margin >= 0 ? "ok" : "bad"}`} style={{ marginTop: 12 }}>
              <span className="glyph">{margin >= 0 ? "✓" : "⚠"}</span>
              <div>
                {margin >= 0 ? (
                  <>
                    À <b className="num">{eur2(asked)}</b> vous gagnez encore <b className="num">{eur2(net)}</b>.
                    Vous pouvez descendre jusqu'à <b className="num">−{pct(maxDiscount)}</b>, soit{" "}
                    <b className="num">{eur2(floorPrice)}</b>, avant de vendre à perte.
                  </>
                ) : (
                  <>
                    À <b className="num">{eur2(asked)}</b> vous perdez <b className="num">{eur2(Math.abs(net))}</b>.
                    Le plancher est à <b className="num">{eur2(floorPrice)}</b> (−{pct(maxDiscount)}).
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="totrow"><span>Prix du lot, remise comprise</span><b className="num">{eur2(asked)}</b></div>
            <div className="totrow"><span>{LABEL.totalCost} + {LABEL.saleCosts.toLowerCase()}</span><b className="num">{deducted(lot.cost)}</b></div>
            {regime.subject && (
              <div className="totrow">
                <span>TVA {regime.scheme === "marge" ? "sur la marge" : "sur le prix"} ({regime.rate} %)</span>
                <b className="num">{deducted(tva)}</b>
              </div>
            )}
            <div className="totrow big">
              <span>{regime.subject ? "Marge nette" : "Marge"}</span>
              <b className={`num ${net >= 0 ? "pos" : "neg"}`}>{eur2(net)}</b>
            </div>
            <div className="hint" style={{ textAlign: "right", marginBottom: 12 }}>
              {lot.count} article{lot.count > 1 ? "s" : ""} · ROI {pct(lot.cost ? (net / lot.cost) * 100 : 0)}
              {discount > 0 && ` · remise ${eur2(lot.gross - asked)}`}
            </div>

            {pickedItems.length > 0 && (
              <button className="btn primary sm" style={{ width: "100%", justifyContent: "center" }} onClick={handleStartSale}>
                € Enregistrer la vente du lot ({eur2(asked)})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ PAGE ============================ */

export default function Deal() {
  const { state } = useStore();
  const toast = useToast();

  const [convertingOrder, setConvertingOrder] = useState<OrderPresetLine[] | null>(null);
  const [sellingPreset, setSellingPreset] = useState<{ item: Item; price: number } | null>(null);

  const inStock = state.items.filter((i) => i.status !== "vendu");
  const stockCost = inStock.reduce((a, i) => a + costOf(i), 0);
  const stockValue = inStock.reduce((a, i) => a + revenueOf(i), 0);
  const potential = stockValue - stockCost;
  const roi = stockCost > 0 ? (potential / stockCost) * 100 : 0;

  return (
    <>
      <HeaderActions>
        <span className="hint">Les deux côtés de la négociation, côte à côte</span>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi label="Stock disponible" value={String(inStock.length)} meta={`${eur(stockCost)} de coût total`} tone="info" />
        <Kpi label="Valeur estimée" value={eur(stockValue)} meta="Aux prix de revente espérés" />
        <Kpi label="Marge potentielle" value={eur(potential)} meta="Si tout part au prix estimé" tone={potential >= 0 ? "ok" : "warn"} />
        <Kpi
          label="ROI potentiel"
          value={pct(roi)}
          meta="Ce que le stock rendrait sur ce qu'il a coûté"
          tone={roi >= 0 ? "ok" : "warn"}
        />
      </div>

      <div className="cols two">
        <div className="card">
          <div className="card-h">
            <h3>Négocier un achat</h3>
            <div className="spacer" />
            <span className="hint">Jusqu'à combien payer ce lot</span>
          </div>
          <BuyCalculator onConvert={(lines) => setConvertingOrder(lines)} />
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Négocier une vente</h3>
            <div className="spacer" />
            <span className="hint">Jusqu'à quelle remise rester gagnant</span>
          </div>
          <SellCalculator onSellItem={(item, price) => setSellingPreset({ item, price })} />
        </div>
      </div>

      {convertingOrder && (
        <OrderModal
          mode="lot"
          initialLines={convertingOrder}
          onClose={() => setConvertingOrder(null)}
        />
      )}

      {sellingPreset && (
        <SellModal
          item={sellingPreset.item}
          initialPrice={sellingPreset.price}
          onClose={() => setSellingPreset(null)}
          onInvoice={(i) => toast(`Doc à générer pour ${i.name}`)}
        />
      )}
    </>
  );
}
