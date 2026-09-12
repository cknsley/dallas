import { Modal } from "../components/ui";
import { eur, pct } from "../lib/format";
import { chargesInRange, costOf, marginOf, qtyOf, saleCostsOf } from "../lib/calc";
import type { AppState } from "../types";

export default function RentabiliteModal({
  state,
  onClose,
}: {
  state: AppState;
  onClose: () => void;
}) {
  const soldItems = state.items.filter((i) => i.status === "vendu");
  const totalCa = soldItems.reduce((a, i) => a + i.price * qtyOf(i), 0);
  const totalMarge = soldItems.reduce((a, i) => a + marginOf(i), 0);
  const totalCost = soldItems.reduce((a, i) => a + costOf(i), 0);
  const totalSaleFees = soldItems.reduce((a, i) => a + saleCostsOf(i), 0);
  const totalShippingPaid = soldItems.reduce((a, i) => a + (i.shippingPaid || 0), 0);
  const totalCharges = chargesInRange(state.expenses, { from: "0000-01-01", to: "9999-12-31", label: "Tout", bounded: false });
  const finalNetProfit = totalMarge - totalCharges;

  const globalMargePct = totalCa > 0 ? (finalNetProfit / totalCa) * 100 : 0;
  const costPct = totalCa > 0 ? (totalCost / totalCa) * 100 : 0;
  const feesPct = totalCa > 0 ? (totalSaleFees / totalCa) * 100 : 0;
  const shippingPct = totalCa > 0 ? (totalShippingPaid / totalCa) * 100 : 0;
  const avgMargePerSale = soldItems.length > 0 ? totalMarge / soldItems.length : 0;

  // Répartition par marque
  const brandStats = Array.from(
    soldItems.reduce((map, item) => {
      const b = item.brand.trim() || "Sans marque";
      const existing = map.get(b) || { brand: b, qty: 0, ca: 0, marge: 0 };
      existing.qty += qtyOf(item);
      existing.ca += item.price * qtyOf(item);
      existing.marge += marginOf(item);
      map.set(b, existing);
      return map;
    }, new Map<string, { brand: string; qty: number; ca: number; marge: number }>()).values()
  ).sort((a, b) => b.marge - a.marge);

  let healthBadge = { text: "Excellente rentabilité", class: "ok", icon: "🚀" };
  let adviceText = "Votre stratégie d'achat et votre pricing sont très performants. Continuez à cibler ces références à forte marge.";
  if (globalMargePct < 15) {
    healthBadge = { text: "Rentabilité faible", class: "bad", icon: "⚠️" };
    adviceText = "Vos marges sont serrées. Revoir les frais d'acquisition, négocier les achats et augmenter vos prix de vente de 10 à 15%.";
  } else if (globalMargePct < 30) {
    healthBadge = { text: "Rentabilité correcte", class: "warn", icon: "📌" };
    adviceText = "Rentabilité moyenne. Optimisez les commissions de plateforme et réduisez le coût des fournitures/livraisons.";
  }

  return (
    <Modal wide title="📈 Indice de Rentabilité sur le Chiffre d'Affaires" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Résumé de santé */}
        <div
          className={`note ${healthBadge.class}`}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: "var(--r-sm)" }}
        >
          <span style={{ fontSize: 24 }}>{healthBadge.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {healthBadge.text} — Indice de {pct(globalMargePct)} de marge sur le CA
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 2 }}>{adviceText}</div>
          </div>
        </div>

        {/* Grille des KPIs clés */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>Chiffre d'affaires</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", margin: "2px 0" }}>{eur(totalCa)}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{soldItems.length} vente{soldItems.length > 1 ? "s" : ""}</div>
          </div>

          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>Marge Nette Finale</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: finalNetProfit >= 0 ? "var(--ok)" : "var(--bad)", margin: "2px 0" }}>
              {eur(finalNetProfit)}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{pct(globalMargePct)} du CA ({eur(totalCharges)} de frais d'activité)</div>
          </div>

          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>Marge moy. / article</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", margin: "2px 0" }}>{eur(avgMargePerSale)}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>par pièce vendue</div>
          </div>

          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>Coût total d'achat</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-2)", margin: "2px 0" }}>{eur(totalCost)}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{pct(costPct)} du CA</div>
          </div>
        </div>

        {/* Décomposition du Chiffre d'Affaires */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink-3)" }}>
            Décomposition du Chiffre d'Affaires (100 %)
          </h4>
          <div style={{ height: 16, borderRadius: 8, overflow: "hidden", display: "flex", background: "var(--surface-2)", marginBottom: 12 }}>
            <div style={{ width: `${Math.min(100, Math.max(0, costPct))}%`, background: "#38bdf8" }} title={`Achats: ${pct(costPct)}`} />
            <div style={{ width: `${Math.min(100, Math.max(0, feesPct))}%`, background: "#c084fc" }} title={`Frais: ${pct(feesPct)}`} />
            <div style={{ width: `${Math.min(100, Math.max(0, shippingPct))}%`, background: "#fbbf24" }} title={`Port: ${pct(shippingPct)}`} />
            <div style={{ width: `${Math.min(100, Math.max(0, globalMargePct))}%`, background: "#34d399" }} title={`Marge: ${pct(globalMargePct)}`} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#38bdf8" }} />
              <span>Achats stock : <b>{pct(costPct)}</b> ({eur(totalCost)})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c084fc" }} />
              <span>Frais & Commissions : <b>{pct(feesPct)}</b> ({eur(totalSaleFees)})</span>
            </div>
            {totalShippingPaid > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
                <span>Expéditions : <b>{pct(shippingPct)}</b> ({eur(totalShippingPaid)})</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399" }} />
              <span>Marge nette : <b>{pct(globalMargePct)}</b> ({eur(totalMarge)})</span>
            </div>
          </div>
        </div>

        {/* Classement des marques par rentabilité */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink-3)" }}>
            Classement de la rentabilité par Marque
          </h4>
          {brandStats.length === 0 ? (
            <div className="hint">Aucune vente enregistrée.</div>
          ) : (
            <div className="twrap">
              <table style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Marque</th>
                    <th className="r">Qté</th>
                    <th className="r">Chiffre d'Affaires</th>
                    <th className="r">Marge réalisée</th>
                    <th className="r">Taux de marge</th>
                  </tr>
                </thead>
                <tbody>
                  {brandStats.map((b) => {
                    const mPct = b.ca > 0 ? (b.marge / b.ca) * 100 : 0;
                    return (
                      <tr key={b.brand}>
                        <td><b>{b.brand}</b></td>
                        <td className="r num">{b.qty}</td>
                        <td className="r num">{eur(b.ca)}</td>
                        <td className={`r num ${b.marge >= 0 ? "pos" : "neg"}`}>{eur(b.marge)}</td>
                        <td className="r num">
                          <span className={`pill ${mPct >= 35 ? "ok" : mPct >= 20 ? "neutral" : "warn"}`}>
                            {pct(mPct)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
