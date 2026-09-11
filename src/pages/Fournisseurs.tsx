import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { buildSuppliers, scoreOf, type Supplier } from "../lib/suppliers";
import { costOf, periodRange, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { links } from "../lib/links";
import ItemModal from "../modals/ItemModal";
import SupplierModal from "../modals/SupplierModal";
import type { Item, Period, SupplierRecord } from "../types";

type Sort = "purchases" | "roi" | "debt" | "sellThrough" | "leadTime";

const SORTS: { value: Sort; label: string }[] = [
  { value: "purchases", label: "Volume" },
  { value: "roi", label: "Rentabilité" },
  { value: "sellThrough", label: "Écoulement" },
  { value: "leadTime", label: "Délai" },
  { value: "debt", label: "Dette" },
];

export default function Fournisseurs() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [period, setPeriod] = usePref<Period>("period", "month");
  const [sort, setSort] = usePref<Sort>("supplierSort", "purchases");
  const [q, setQ] = useQueryState("q");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [recordFor, setRecordFor] = useState<{ name: string; record: SupplierRecord | null } | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const suppliers = useMemo(() => buildSuppliers(state.items, state.suppliers), [state.items, state.suppliers]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = suppliers.filter(
      (s) => !needle || s.name.toLowerCase().includes(needle) || (s.record?.contact ?? "").toLowerCase().includes(needle),
    );
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "roi": return b.roi - a.roi;
        case "debt": return b.debt - a.debt;
        case "sellThrough": return b.sellThrough - a.sellThrough;
        // Un fournisseur sans délai mesuré passe en dernier.
        case "leadTime": return (a.leadTime ?? 9999) - (b.leadTime ?? 9999);
        default: return b.purchases - a.purchases;
      }
    });
  }, [suppliers, q, sort]);

  /* ---- balance de la période ---- */
  const bought = state.items.filter((i) => i.buyDate >= range.from && i.buyDate <= range.to);
  const purchases = bought.reduce((a, i) => a + costOf(i), 0);
  const soldInRange = state.items.filter(
    (i) => i.status === "vendu" && i.saleDate >= range.from && i.saleDate <= range.to,
  );
  const sales = soldInRange.reduce((a, i) => a + revenueOf(i), 0);

  const debt = suppliers.reduce((a, s) => a + s.debt, 0);
  const debtors = suppliers.filter((s) => s.debt > 0);
  const clientDebt = state.items
    .filter((i) => i.status === "vendu" && i.delivery === "non_payee")
    .reduce((a, i) => a + revenueOf(i), 0);
  const unpaidDocs = state.docs.filter((d) => !d.paid).reduce((a, d) => a + d.total, 0);
  const receivables = clientDebt + unpaidDocs;

  const best = [...suppliers].filter((s) => s.soldPieces > 0).sort((a, b) => b.roi - a.roi)[0];

  const settle = (s: Supplier) => {
    const due = s.items.filter((i) => !i.purchasePaid);
    due.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch: { purchasePaid: true } }));
    toast(`${due.length} achat${due.length > 1 ? "s" : ""} réglé${due.length > 1 ? "s" : ""} chez ${s.name}`);
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
          label="Dettes fournisseurs"
          value={eur(debt)}
          meta={debtors.length ? `${debtors.length} fournisseur${debtors.length > 1 ? "s" : ""} à régler` : "Tout est réglé"}
          tone={debt > 0 ? "warn" : "ok"}
        />
        <Kpi
          label="Créances clients"
          value={eur(receivables)}
          meta={receivables > 0 ? `${eur(clientDebt)} de ventes · ${eur(unpaidDocs)} de factures` : "Rien à encaisser"}
          tone={receivables > 0 ? "warn" : "ok"}
        />
        <Kpi
          label={`Achats — ${range.label}`}
          value={eur(purchases)}
          meta={`${bought.reduce((a, i) => a + qtyOf(i), 0)} article${bought.length > 1 ? "s" : ""} entrés`}
          tone="info"
        />
        <Kpi
          label="Meilleure source"
          value={best ? best.name : "—"}
          meta={best ? `${pct(best.roi)} de ROI · ${eur(best.margin)} de marge` : "Pas encore de revente"}
          tone={best ? "ok" : undefined}
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
          <Empty glyph="⌂" title="Aucun fournisseur">
            Le champ « Source » d’un article ou d’une commande alimente cette liste.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Fournisseurs</h3>
            <div className="spacer" />
            <span className="hint">Trier par</span>
            <Segmented<Sort> value={sort} onChange={setSort} options={SORTS} />
          </div>

          <div className="supplier-grid">
            {list.map((s) => {
              const isOpen = open === s.key;
              const score = scoreOf(s);
              return (
                <article className={`supplier-card${isOpen ? " open" : ""}`} key={s.key}>
                  <button className="supplier-head" onClick={() => setOpen(isOpen ? "" : s.key)}>
                    <div className="supplier-id">
                      <div className="supplier-name">
                        {s.name}
                        {s.record?.rating ? (
                          <span className="stars" title={`${s.record.rating} / 5`}>
                            {"★".repeat(s.record.rating)}
                          </span>
                        ) : null}
                      </div>
                      <div className="hint">
                        {s.record?.contact || s.record?.email || `${s.orders.length} commande${s.orders.length > 1 ? "s" : ""}`}
                        {" · "}dernier achat {dshort(s.lastBuy)}
                      </div>
                    </div>
                    <div className={`supplier-score ${score >= 66 ? "good" : score >= 33 ? "mid" : "low"}`}>
                      <b className="num">{score}</b>
                      <span>score</span>
                    </div>
                  </button>

                  <div className="supplier-metrics">
                    <div><span>Achats</span><b className="num">{eur(s.purchases)}</b></div>
                    <div><span>Marge</span><b className={`num ${s.margin >= 0 ? "pos" : "neg"}`}>{eur(s.margin)}</b></div>
                    <div><span>ROI</span><b className={`num ${s.roi >= 0 ? "pos" : "neg"}`}>{s.soldPieces ? pct(s.roi) : "—"}</b></div>
                    <div><span>Écoulé</span><b className="num">{pct(s.sellThrough)}</b></div>
                    <div><span>Délai</span><b className="num">{s.leadTime === null ? "—" : `${s.leadTime} j`}</b></div>
                    <div>
                      <span>Ponctualité</span>
                      <b className={`num ${s.onTimeRate !== null && s.onTimeRate < 80 ? "neg" : ""}`}>
                        {s.onTimeRate === null ? "—" : pct(s.onTimeRate)}
                      </b>
                    </div>
                  </div>

                  <div className="supplier-foot">
                    {s.debt > 0 ? (
                      <span className="pill bad">{eur2(s.debt)} à régler</span>
                    ) : (
                      <span className="pill good">À jour</span>
                    )}
                    {s.waiting > 0 && <span className="pill arrivage">{s.waiting} en route</span>}
                    {s.inStockPieces > 0 && (
                      <span className="pill stock">{s.inStockPieces} non vendus · {eur2(s.stockValue)}</span>
                    )}
                    <div className="spacer" />
                    {s.debt > 0 && (
                      <button className="btn sm" onClick={() => settle(s)}>Tout régler</button>
                    )}
                    <button
                      className="btn sm"
                      onClick={() => setRecordFor({ name: s.name, record: s.record })}
                    >
                      {s.record ? "Fiche" : "Créer la fiche"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="supplier-detail">
                      {s.record && (s.record.email || s.record.phone || s.record.url || s.record.notes) && (
                        <div className="supplier-contact">
                          {s.record.email && <a href={`mailto:${s.record.email}`}>{s.record.email}</a>}
                          {s.record.phone && <span>{s.record.phone}</span>}
                          {s.record.url && (
                            <a href={s.record.url} target="_blank" rel="noreferrer noopener">Voir le profil ↗</a>
                          )}
                          {s.record.terms > 0 && <span className="hint">Paiement à {s.record.terms} jours</span>}
                          {s.record.notes && <div className="hint">{s.record.notes}</div>}
                        </div>
                      )}

                      <div className="hint">
                        Premier achat le {dshort(s.firstBuy)} · panier moyen {eur2(s.avgOrder)} ·{" "}
                        {s.soldPieces ? `${eur2(s.marginPerPiece)} de marge par article revendu` : "aucune revente encore"}
                      </div>

                      {s.orders.map((o) => (
                        <div className="supplier-order" key={o.id}>
                          <div className="supplier-order-h">
                            <b>{dshort(o.date)}</b>
                            <span className="hint">
                              {o.pieces} article{o.pieces > 1 ? "s" : ""} · {eur2(o.total)}
                            </span>
                            {o.received < o.pieces && (
                              <span className={`pill ${o.late ? "bad" : "arrivage"}`}>
                                {o.late ? "En retard" : `${o.pieces - o.received} en route`}
                              </span>
                            )}
                            {o.expectedDate && o.received < o.pieces && (
                              <span className="hint">prévu {dshort(o.expectedDate)}</span>
                            )}
                          </div>
                          {o.items.map((i) => (
                            <div className="client-line" key={i.id}>
                              <Photo id={i.photoId} />
                              <button className="linkish" onClick={() => setEditing(i)}>{i.name || "Sans nom"}</button>
                              <span className="hint">
                                {i.brand || "—"}
                                {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                              </span>
                              <span className="spacer" />
                              <span className={`pill ${i.purchasePaid ? "good" : "bad"}`}>
                                {i.purchasePaid ? "Réglé" : "À régler"}
                              </span>
                              <span className="pill neutral">{STATUS_LABEL[i.status]}</span>
                              <b className="num">{eur2(costOf(i))}</b>
                            </div>
                          ))}
                        </div>
                      ))}

                      <a className="btn sm" href={`#${links.stock({ q: s.name })}`} style={{ alignSelf: "flex-start" }}>
                        Voir ses articles en stock →
                      </a>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {recordFor && (
        <SupplierModal name={recordFor.name} record={recordFor.record} onClose={() => setRecordFor(null)} />
      )}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
