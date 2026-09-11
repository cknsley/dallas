import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { buildSuppliers } from "../lib/suppliers";
import { costOf, periodRange, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import ItemModal from "../modals/ItemModal";
import type { Item, Period } from "../types";

type Sort = "purchases" | "margin" | "debt";

export default function Fournisseurs() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [sort, setSort] = usePref<Sort>("supplierSort", "purchases");
  const [q, setQ] = useQueryState("q");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const suppliers = useMemo(() => buildSuppliers(state.items), [state.items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = suppliers.filter((s) => !needle || s.name.toLowerCase().includes(needle));
    return [...filtered].sort((a, b) =>
      sort === "margin" ? b.margin - a.margin : sort === "debt" ? b.debt - a.debt : b.purchases - a.purchases,
    );
  }, [suppliers, q, sort]);

  /* ---- bilan achat / vente de la période ---- */
  const bought = state.items.filter((i) => i.buyDate >= range.from && i.buyDate <= range.to);
  const purchases = bought.reduce((a, i) => a + costOf(i), 0);
  const soldInRange = state.items.filter(
    (i) => i.status === "vendu" && i.saleDate >= range.from && i.saleDate <= range.to,
  );
  const sales = soldInRange.reduce((a, i) => a + revenueOf(i), 0);

  // Dettes : achats non réglés. Créances : ventes encaissées à venir et factures impayées.
  const debt = state.items.filter((i) => !i.purchasePaid).reduce((a, i) => a + costOf(i), 0);
  const debtCount = state.items.filter((i) => !i.purchasePaid).length;
  const clientDebt = state.items
    .filter((i) => i.status === "vendu" && i.delivery === "non_payee")
    .reduce((a, i) => a + revenueOf(i), 0);
  const unpaidDocs = state.docs.filter((d) => !d.paid).reduce((a, d) => a + d.total, 0);
  const receivables = clientDebt + unpaidDocs;

  const settleSupplier = (key: string) => {
    const due = suppliers.find((s) => s.key === key)?.items.filter((i) => !i.purchasePaid) ?? [];
    due.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch: { purchasePaid: true } }));
    toast(`${due.length} achat${due.length > 1 ? "s" : ""} marqué${due.length > 1 ? "s" : ""} réglé${due.length > 1 ? "s" : ""}`);
  };

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
        <input
          type="search"
          value={q}
          placeholder="Rechercher un fournisseur…"
          style={{ width: 200 }}
          onChange={(e) => setQ(e.target.value)}
        />
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label={`Achats — ${range.label}`}
          value={eur(purchases)}
          meta={`${bought.reduce((a, i) => a + qtyOf(i), 0)} article${bought.length > 1 ? "s" : ""} entrés`}
          tone="info"
        />
        <Kpi
          label={`Ventes — ${range.label}`}
          value={eur(sales)}
          meta={`${soldInRange.length} vente${soldInRange.length > 1 ? "s" : ""} sur la période`}
          tone="ok"
        />
        <Kpi
          label="Dettes fournisseurs"
          value={eur(debt)}
          meta={debtCount ? `${debtCount} achat${debtCount > 1 ? "s" : ""} non réglé${debtCount > 1 ? "s" : ""}` : "Tous les achats sont réglés"}
          tone={debt > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Créances clients"
          value={eur(receivables)}
          meta={receivables > 0 ? `${eur(clientDebt)} de ventes · ${eur(unpaidDocs)} de factures` : "Rien à encaisser"}
          tone={receivables > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Balance de la période</h3>
          <div className="spacer" />
          <span className="hint">{range.label} — du {dshort(range.from)} au {dshort(range.to)}</span>
        </div>
        <div className="card-b">
          <div className="totrow"><span>Achats (entrées de stock)</span><b className="num">−{eur2(purchases)}</b></div>
          <div className="totrow"><span>Ventes (sorties de stock)</span><b className="num">+{eur2(sales)}</b></div>
          <div className="totrow big">
            <span>Solde achats / ventes</span>
            <b className={`num ${sales - purchases >= 0 ? "pos" : "neg"}`}>{eur2(sales - purchases)}</b>
          </div>
          <hr className="sep" />
          <div className="totrow"><span>Reste dû aux fournisseurs</span><b className="num neg">{eur2(debt)}</b></div>
          <div className="totrow"><span>Reste à encaisser des clients</span><b className="num pos">{eur2(receivables)}</b></div>
          <div className="totrow big">
            <span>Position nette</span>
            <b className={`num ${receivables - debt >= 0 ? "pos" : "neg"}`}>{eur2(receivables - debt)}</b>
          </div>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="card">
          <Empty glyph="⇩" title="Aucun fournisseur">
            Le champ « Source » d’un article ou d’une commande alimente cette liste.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Fournisseurs</h3>
            <div className="spacer" />
            <Segmented<Sort>
              value={sort}
              onChange={setSort}
              options={[
                { value: "purchases", label: "Par achats" },
                { value: "margin", label: "Par marge" },
                { value: "debt", label: "Par dette" },
              ]}
            />
          </div>
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th className="r">Articles</th>
                  <th className="r">Achats</th>
                  <th className="r">Dette</th>
                  <th className="r">Revendu</th>
                  <th className="r">Marge</th>
                  <th className="r">ROI</th>
                  <th>Dernier achat</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const isOpen = open === s.key;
                  return [
                    <tr key={s.key} className="clickable" onClick={() => setOpen(isOpen ? "" : s.key)}>
                      <td>
                        <span className="linkish">{s.name}</span>
                        {s.inStock > 0 && (
                          <div className="hint">{s.inStock} en stock · {eur2(s.stockValue)}</div>
                        )}
                      </td>
                      <td className="r num">{s.pieces}</td>
                      <td className="r num">{eur2(s.purchases)}</td>
                      <td className={`r num ${s.debt > 0 ? "neg" : ""}`}>{s.debt > 0 ? eur2(s.debt) : "—"}</td>
                      <td className="r num">{s.sold ? eur2(s.sales) : "—"}</td>
                      <td className={`r num ${s.margin >= 0 ? "pos" : "neg"}`}>{s.sold ? eur2(s.margin) : "—"}</td>
                      <td className={`r num ${s.margin >= 0 ? "pos" : "neg"}`}>
                        {s.purchases > 0 && s.sold ? pct((s.margin / s.purchases) * 100) : "—"}
                      </td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(s.lastBuy)}</td>
                      <td className="r shrink"><span className="hint">{isOpen ? "▲" : "▼"}</span></td>
                    </tr>,
                    isOpen && (
                      <tr key={s.key + ":detail"} className="detail-row">
                        <td colSpan={9}>
                          <div className="client-detail">
                            <div className="hint">
                              Premier achat le {dshort(s.firstBuy)}
                              {s.debt > 0 && ` · ${eur2(s.debt)} encore dus`}
                            </div>
                            {s.items.map((i) => (
                              <div className="client-line" key={i.id}>
                                <Photo id={i.photoId} />
                                <button className="linkish" onClick={(e) => { e.stopPropagation(); setEditing(i); }}>
                                  {i.name || "Sans nom"}
                                </button>
                                <span className="hint">
                                  {i.brand || "—"}
                                  {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                                </span>
                                <span className="spacer" />
                                <span className={`pill ${i.purchasePaid ? "good" : "bad"}`}>
                                  {i.purchasePaid ? "Réglé" : "À régler"}
                                </span>
                                <span className="pill neutral">{STATUS_LABEL[i.status]}</span>
                                <span className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.buyDate)}</span>
                                <b className="num">{eur2(costOf(i))}</b>
                              </div>
                            ))}
                            {s.debt > 0 && (
                              <button
                                className="btn sm"
                                style={{ alignSelf: "flex-start" }}
                                onClick={(e) => { e.stopPropagation(); settleSupplier(s.key); }}
                              >
                                Marquer tout réglé ({eur2(s.debt)})
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
