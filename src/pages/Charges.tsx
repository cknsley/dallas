import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Kpi, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import {
  chargesByCategory, chargesByKind, chargesInRange, chargesMonthlySeries, costOf, expenseKind, expenseMonthlyShare,
  expenseMonths, inRange, monthsElapsed, periodRange, remainingToAmortize, revenueOf, soldItems,
} from "../lib/calc";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { dfr, eur, eur2, pct } from "../lib/format";
import ExpenseModal from "../modals/ExpenseModal";
import type { Expense, Period } from "../types";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** « 2028-08 » → « août 2028 ». */
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

type ChargesTab = "apercu" | "graph" | "all";
type KindFilter = "all" | "achat" | "vente" | "activite";

export default function Charges() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [period, setPeriod] = usePref<Period>("chargePeriod", "month");
  const [chargesTab, setChargesTab] = usePref<ChargesTab>("chargesTab", "apercu");
  const [kindFilter, setKindFilter] = usePref<KindFilter>("kindFilter", "all");
  const [category, setCategory] = useQueryState("cat");
  const [editing, setEditing] = useState<{ expense: Expense | null } | null>(null);
  const [confirming, setConfirming] = useState<Expense | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const periodTotal = useMemo(() => chargesInRange(state.expenses, range), [state.expenses, range]);
  const byCategory = useMemo(() => chargesByCategory(state.expenses, range), [state.expenses, range]);
  const byKind = useMemo(() => chargesByKind(state.expenses, range), [state.expenses, range]);
  const series = useMemo(() => chargesMonthlySeries(state.expenses), [state.expenses]);
  const remaining = useMemo(() => remainingToAmortize(state.expenses), [state.expenses]);

  const purchasedItems = useMemo(
    () => state.items.filter((i) => !range.bounded || inRange(i.buyDate, range)),
    [state.items, range],
  );

  const achatsByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of purchasedItems) {
      const t = i.type || "Autre";
      map.set(t, (map.get(t) || 0) + costOf(i));
    }
    return Array.from(map.entries())
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => b.total - a.total);
  }, [purchasedItems]);

  const balanceAchatsTotal = useMemo(() => purchasedItems.reduce((a, i) => a + costOf(i), 0), [purchasedItems]);

  const achatsAVenir = useMemo(
    () => state.items.filter((i) => i.status === "arrivage").reduce((a, i) => a + costOf(i), 0),
    [state.items],
  );

  const stockTotal = useMemo(
    () => state.items.filter((i) => i.status === "stock").reduce((a, i) => a + costOf(i), 0),
    [state.items],
  );

  const ventesTotal = useMemo(
    () => soldItems(state.items, range).reduce((a, i) => a + revenueOf(i), 0),
    [state.items, range],
  );

  const elapsed = monthsElapsed(range);
  const monthlyAverage = periodTotal / elapsed;
  const top = byCategory[0];
  const recurring = state.expenses.filter((e) => e.amortizeMonths > 1).length;

  const list = useMemo(
    () =>
      [...state.expenses]
        .filter((e) => !category || (e.category || "Autre") === category)
        .filter((e) => kindFilter === "all" || expenseKind(e) === kindFilter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.expenses, category, kindFilter],
  );

  const maxMonth = Math.max(...series.map((s) => s.total), 0);

  return (
    <>
      <HeaderActions>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois" },
            { value: "quarter", label: "Trimestre" },
            { value: "year", label: "Année" },
            { value: "all", label: "Tout" },
          ]}
        />
        <button className="btn primary" onClick={() => setEditing({ expense: null })}>+ Nouvelle charge</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label={`Charges — ${range.label}`}
          value={eur(periodTotal)}
          meta={`Réparties sur ${elapsed} mois écoulé${elapsed > 1 ? "s" : ""}`}
          tone="warn"
        />
        <Kpi
          label="Moyenne par mois"
          value={eur(monthlyAverage)}
          meta="Ce que l'activité coûte chaque mois, hors articles"
        />
        <Kpi
          label="Poste principal"
          value={top ? top.key : "—"}
          meta={top ? `${eur(top.total)} · ${pct((top.total / periodTotal) * 100)} des charges` : "Aucune charge sur la période"}
          tone="info"
        />
        <Kpi
          label="Reste à étaler"
          value={eur(remaining)}
          meta={recurring ? `${recurring} charge${recurring > 1 ? "s" : ""} étalée${recurring > 1 ? "s" : ""} sur plusieurs mois` : "Aucune charge étalée"}
          tone={remaining > 0 ? "info" : "ok"}
        />
      </div>

      {/* Barre d'onglets pour la page Charges (la même que Ventes) */}
      <div style={{ margin: "24px 0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Segmented<ChargesTab>
          value={chargesTab}
          onChange={setChargesTab}
          options={[
            { value: "apercu", label: "⚡ Aperçu" },
            { value: "graph", label: "📊 Répartition & Évolution" },
            { value: "all", label: "❖ Tout afficher" },
          ]}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Segmented<KindFilter>
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "all", label: "Toutes charges" },
              { value: "achat", label: "📦 Achats" },
              { value: "vente", label: "🏷️ Ventes" },
              { value: "activite", label: "💼 Activité" },
            ]}
          />
        </div>
      </div>

      {/* Onglet 1 ou 3 : pipeline des charges + balance des achats */}
      {(chargesTab === "apercu" || chargesTab === "all") && (
        <div className="dash-grid" style={{ marginTop: 0, marginBottom: 16 }}>
          {/* Carte 1 : Performance Charges */}
          <section className="card col-2">
            <div className="card-h">
              <h3>Performance Charges</h3>
              <div className="spacer" />
              <span className="hint">{range.label}</span>
            </div>
            <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="pipe-row" onClick={() => setKindFilter(kindFilter === "achat" ? "all" : "achat")} style={{ cursor: "pointer" }}>
                <div className="pipe-head">
                  <span className="pill info">📦 Achats</span>
                  <span className="spacer" />
                  <b className="num">{byKind.achat.count}</b>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${periodTotal ? (byKind.achat.total / periodTotal) * 100 : 0}%`, background: "#38bdf8" }} />
                </div>
                <div className="hint num">{eur(byKind.achat.total)} engagés · {periodTotal ? pct((byKind.achat.total / periodTotal) * 100) : "0 %"}</div>
              </div>

              <div className="pipe-row" onClick={() => setKindFilter(kindFilter === "vente" ? "all" : "vente")} style={{ cursor: "pointer" }}>
                <div className="pipe-head">
                  <span className="pill warn">🏷️ Ventes</span>
                  <span className="spacer" />
                  <b className="num">{byKind.vente.count}</b>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${periodTotal ? (byKind.vente.total / periodTotal) * 100 : 0}%`, background: "#c084fc" }} />
                </div>
                <div className="hint num">{eur(byKind.vente.total)} engagés · {periodTotal ? pct((byKind.vente.total / periodTotal) * 100) : "0 %"}</div>
              </div>

              <div className="pipe-row" onClick={() => setKindFilter(kindFilter === "activite" ? "all" : "activite")} style={{ cursor: "pointer" }}>
                <div className="pipe-head">
                  <span className="pill ok">💼 Activité</span>
                  <span className="spacer" />
                  <b className="num">{byKind.activite.count}</b>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${periodTotal ? (byKind.activite.total / periodTotal) * 100 : 0}%`, background: "#34d399" }} />
                </div>
                <div className="hint num">{eur(byKind.activite.total)} engagés · {periodTotal ? pct((byKind.activite.total / periodTotal) * 100) : "0 %"}</div>
              </div>

              <hr className="sep" />
              <div className="totrow"><span>Charges Achats</span><b className="num">{eur(byKind.achat.total)}</b></div>
              <div className="totrow" style={{ marginTop: -10 }}>
                <span>Charges Ventes</span>
                <b className="num">{eur(byKind.vente.total)}</b>
              </div>
              <div className="totrow" style={{ marginTop: -10 }}>
                <span>Charges Activité</span>
                <b className="num">{eur(byKind.activite.total)}</b>
              </div>
              <div className="totrow" style={{ marginTop: -10 }}>
                <span>Total Général Charges</span>
                <b className="num neg">{eur(periodTotal)}</b>
              </div>
            </div>
          </section>

          {/* Carte 2 : Balance (Style exact de la photo 1) */}
          <section className="card col-1">
            <div className="card-h">
              <h3>Balance</h3>
              <div className="spacer" />
              <span className="hint">{range.label}</span>
            </div>
            <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="totrow" style={{ fontWeight: 700, fontSize: 14 }}>
                <span>Achats</span>
                <b className="num">{eur(balanceAchatsTotal)}</b>
              </div>

              {/* Sous-catégories d'achats par type d'article */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12, borderLeft: "2px solid var(--line-2)", margin: "2px 0 6px" }}>
                {achatsByType.length === 0 ? (
                  <span className="hint" style={{ fontSize: 12 }}>Aucun achat d'article sur la période</span>
                ) : (
                  achatsByType.map((t) => (
                    <div key={t.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-2)" }}>
                      <span>{t.key}</span>
                      <b className="num" style={{ fontWeight: 500 }}>{eur(t.total)}</b>
                    </div>
                  ))
                )}
              </div>

              <hr className="sep" style={{ margin: "4px 0" }} />
              <div className="totrow">
                <span>Achats à venir</span>
                <b className="num">{eur(achatsAVenir)}</b>
              </div>
              <div className="totrow" style={{ marginTop: -6 }}>
                <span>Stock total</span>
                <b className="num">{eur(stockTotal)}</b>
              </div>
              <div className="totrow" style={{ marginTop: -6 }}>
                <span>Ventes</span>
                <b className="num pos">{eur(ventesTotal)}</b>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Onglet 2 ou 3 : Répartition & Évolution */}
      {(chargesTab === "graph" || chargesTab === "all") && (
        <div className="cols two">
          <div className="card">
            <div className="card-h">
              <h3>Par catégorie</h3>
              <div className="spacer" />
              {category ? (
                <button className="btn ghost sm" onClick={() => setCategory("")}>Filtre : {category} ✕</button>
              ) : (
                <span className="hint">{range.label}</span>
              )}
            </div>
            {byCategory.length === 0 ? (
              <Empty glyph="◈" title="Aucune charge sur la période">
                Changez de période ou ajoutez une charge.
              </Empty>
            ) : (
              <div className="card-b">
                <div className="bars">
                  {byCategory.map((c) => (
                    <div className="bar-row" key={c.key}>
                      <button
                        className="bl linkish"
                        title={`Filtrer sur ${c.key}`}
                        onClick={() => setCategory(category === c.key ? "" : c.key)}
                      >
                        {c.key}
                      </button>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${Math.max(2, (c.total / byCategory[0].total) * 100)}%` }}
                        />
                      </div>
                      <div className="bv">
                        {eur(c.total)}
                        <span style={{ color: "var(--ink-3)" }}> · {pct((c.total / periodTotal) * 100)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>12 derniers mois</h3>
              <div className="spacer" />
              <span className="hint">Charge imputée chaque mois</span>
            </div>
            {maxMonth === 0 ? (
              <Empty glyph="▁▃▅" title="Rien à afficher">
                Les charges enregistrées se répartiront ici mois par mois.
              </Empty>
            ) : (
              <div className="card-b">
                <div className="month-bars">
                  {series.map((s) => (
                    <div className="month-bar" key={s.key} title={`${s.label} — ${eur2(s.total)}`}>
                      <div className="mb-track">
                        <div className="mb-fill" style={{ height: `${Math.max(2, (s.total / maxMonth) * 100)}%` }} />
                      </div>
                      <div className="mb-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>Charges de l'activité</h3>
          <div className="spacer" />
          <span className="hint">
            {list.length} charge{list.length > 1 ? "s" : ""}
            {category ? ` · ${category}` : ""}
          </span>
        </div>
        {list.length === 0 ? (
          <Empty glyph="◈" title="Aucune charge enregistrée">
            Ajoutez vos achats pour l'activité (balance, housses, étiquettes, abonnement Vinted Pro…).
            Indiquez combien ça a coûté et combien de temps vous allez vous en servir : la dépense se
            répartit sur cette durée et pèse sur la marge au bon rythme.
          </Empty>
        ) : (
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Charge</th>
                  <th>Catégorie</th>
                  <th>Type</th>
                  <th className="r">Montant</th>
                  <th>Depuis</th>
                  <th>Utilisation</th>
                  <th className="r">Coût / mois</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const months = expenseMonths(e);
                  const share = expenseMonthlyShare(e);
                  const active = months[months.length - 1] >= thisMonth();
                  const k = expenseKind(e);
                  return (
                    <tr key={e.id}>
                      <td>
                        <button className="linkish" onClick={() => setEditing({ expense: e })}>{e.label || "Sans nom"}</button>
                        {e.notes && <div className="hint ellipsis">{e.notes}</div>}
                      </td>
                      <td>
                        <button className="pill neutral pill-btn" onClick={() => setCategory(e.category || "Autre")}>
                          {e.category || "Autre"}
                        </button>
                      </td>
                      <td>
                        <span className={`pill ${k === "achat" ? "info" : k === "vente" ? "warn" : "ok"}`}>
                          {k === "achat" ? "📦 Achat" : k === "vente" ? "🏷️ Vente" : "💼 Activité"}
                        </span>
                      </td>
                      <td className="r num">{eur2(e.amount)}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dfr(e.date)}</td>
                      <td>
                        {e.amortizeMonths > 1 ? (
                          <span className={`pill ${active ? "info" : "neutral"}`}>
                            {e.amortizeMonths >= 12 && e.amortizeMonths % 12 === 0
                              ? `${e.amortizeMonths / 12} an${e.amortizeMonths > 12 ? "s" : ""}`
                              : `${e.amortizeMonths} mois`}{" "}
                            {active ? `· jusqu'à ${monthName(months[months.length - 1])}` : "· terminé"}
                          </span>
                        ) : (
                          <span className="pill neutral">Une seule fois</span>
                        )}
                      </td>
                      <td className="r num">{eur2(share)}</td>
                      <td className="r shrink">
                        <div className="rowact">
                          <button className="iconbtn" title="Éditer" onClick={() => setEditing({ expense: e })}>✎</button>
                          <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(e)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExpenseModal
          expense={editing.expense}
          onClose={() => setEditing(null)}
          onDelete={(e) => { dispatch({ type: "removeExpense", id: e.id }); toast("Charge supprimée"); }}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer cette charge ?"
          body={<>« {confirming.label || "Sans nom"} » sera définitivement retirée.</>}
          onConfirm={() => { dispatch({ type: "removeExpense", id: confirming.id }); toast("Charge supprimée"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}

