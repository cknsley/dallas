import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { buildSuppliers, looksLikeRetail, scoreOf, type Supplier } from "../lib/suppliers";
import { costOf, periodRange, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import ItemModal from "../modals/ItemModal";
import SupplierModal from "../modals/SupplierModal";
import OrderModal from "../modals/OrderModal";
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
  const [ordering, setOrdering] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const excluded = state.settings.nonSuppliers;
  const allSources = useMemo(() => buildSuppliers(state.items, state.suppliers), [state.items, state.suppliers]);

  // Un achat au détail n'est pas un approvisionnement : on l'écarte de cette page.
  const suppliers = useMemo(
    () => allSources.filter((s) => s.name !== "Source non renseignée" && !excluded.includes(s.key)),
    [allSources, excluded],
  );
  const hiddenSources = useMemo(
    () => allSources.filter((s) => excluded.includes(s.key)),
    [allSources, excluded],
  );
  // Sources encore listées mais qui ressemblent à du détail : on propose de les sortir.
  const retailCandidates = useMemo(
    () => suppliers.filter((s) => looksLikeRetail(s.name) && !s.record),
    [suppliers],
  );

  const setExcluded = (keys: string[]) =>
    dispatch({ type: "settings", patch: { nonSuppliers: keys } });
  const exclude = (s: Supplier) => {
    setExcluded([...excluded, s.key]);
    toast(`« ${s.name} » retiré des fournisseurs`);
  };
  const restore = (key: string) => setExcluded(excluded.filter((k) => k !== key));

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

  /* ---- balance de la période, fournisseurs seulement ---- */
  // Un article acheté au détail n'entre pas dans la balance d'approvisionnement.
  const supplierKeys = useMemo(() => new Set(suppliers.map((s) => s.key)), [suppliers]);
  const supplierItems = useMemo(
    () => state.items.filter((i) => supplierKeys.has((i.source.trim() || "Source non renseignée").toLowerCase())),
    [state.items, supplierKeys],
  );

  const bought = supplierItems.filter((i) => i.buyDate >= range.from && i.buyDate <= range.to);
  const purchases = bought.reduce((a, i) => a + costOf(i), 0);
  const paidTotal = bought.filter((i) => i.purchasePaid).reduce((a, i) => a + costOf(i), 0);
  const boughtPieces = bought.reduce((a, i) => a + qtyOf(i), 0);
  const waitingPieces = bought.filter((i) => i.status === "arrivage").reduce((a, i) => a + qtyOf(i), 0);
  const receivedPieces = boughtPieces - waitingPieces;

  const debt = suppliers.reduce((a, s) => a + s.debt, 0);
  const debtors = suppliers.filter((s) => s.debt > 0);
  const clientDebt = supplierItems
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
        <button className="btn" onClick={() => setRecordFor({ name: "", record: null })}>+ Nouveau fournisseur</button>
        <button className="btn primary" onClick={() => setOrdering("")}>+ Nouvelle commande</button>
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
          meta={`${boughtPieces} article${boughtPieces > 1 ? "s" : ""} venus de fournisseurs`}
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
          <h3>Vos approvisionnements</h3>
          <div className="spacer" />
          <span className="hint">
            {range.label}
            {range.bounded && ` — du ${dshort(range.from)} au ${dshort(range.to)}`}
          </span>
        </div>
        <div className="card-b">
          <div className="totrow">
            <span>Articles commandés</span>
            <b className="num">{boughtPieces}</b>
          </div>
          <div className="totrow">
            <span>Déjà réceptionnés</span>
            <b className="num">{receivedPieces}</b>
          </div>
          <div className="totrow">
            <span>Encore en route</span>
            <b className={`num ${waitingPieces ? "warn-text" : ""}`}>{waitingPieces}</b>
          </div>
          <hr className="sep" />
          <div className="totrow"><span>Montant commandé</span><b className="num">{eur2(purchases)}</b></div>
          <div className="totrow"><span>Déjà réglé</span><b className="num pos">{eur2(paidTotal)}</b></div>
          <div className="totrow big">
            <span>Reste dû aux fournisseurs</span>
            <b className={`num ${debt > 0 ? "neg" : "pos"}`}>{eur2(debt)}</b>
          </div>
        </div>
      </div>

      {retailCandidates.length > 0 && (
        <div className="note warn" style={{ marginBottom: 16 }}>
          <span className="glyph">⌂</span>
          <div>
            <b>Achats au détail dans la liste</b>
            <br />
            {retailCandidates.map((s) => s.name).join(", ")} ressemble{retailCandidates.length > 1 ? "nt" : ""} à
            des achats en magasin plutôt qu'à des fournisseurs.
            <div className="retail-actions">
              {retailCandidates.map((s) => (
                <button key={s.key} className="btn sm" onClick={() => exclude(s)}>
                  Retirer « {s.name} »
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hiddenSources.length > 0 && (
        <div className="hint hidden-sources">
          Sources écartées :
          {hiddenSources.map((s) => (
            <button key={s.key} className="btn ghost sm" onClick={() => restore(s.key)}>
              {s.name} ↺
            </button>
          ))}
        </div>
      )}

      {suppliers.length === 0 ? (
        <div className="card">
          <Empty glyph="⌂" title="Aucun fournisseur">
            Le champ « Source » d’un article ou d’une commande alimente cette liste — les achats au détail
            en sont écartés.
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
                    <div
                      className={`supplier-score ${score === null ? "pending" : score >= 66 ? "good" : score >= 33 ? "mid" : "low"}`}
                      title={score === null ? "Score disponible après la première revente" : undefined}
                    >
                      <b className="num">{score ?? "—"}</b>
                      <span>{score === null ? "à venir" : "score"}</span>
                    </div>
                  </button>

                  <div className="supplier-metrics">
                    <div>
                      <span>Articles</span>
                      <b className="num">{s.pieces}{s.waiting > 0 && <small className="hint"> · {s.waiting} en route</small>}</b>
                    </div>
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
                    <button className="btn sm" onClick={() => setOrdering(s.name)}>Commander</button>
                    <button
                      className="btn sm"
                      onClick={() => setRecordFor({ name: s.name, record: s.record })}
                    >
                      {s.record ? "Fiche" : "Créer la fiche"}
                    </button>
                    <button
                      className="btn sm ghost"
                      title="Retirer cette source des fournisseurs"
                      onClick={() => exclude(s)}
                    >
                      Pas un fournisseur
                    </button>
                  </div>

                  {isOpen && (
                    <div className="supplier-detail">
                      {s.record && (s.record.email || s.record.phone || s.record.url || s.record.notes || s.record.address) && (
                        <div className="supplier-contact" style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--card-bg-2)", padding: 10, borderRadius: 8 }}>
                          <b style={{ fontSize: 13 }}>👤 Compte & Contact Fournisseur</b>
                          {s.record.contact && <div><b>Contact :</b> {s.record.contact}</div>}
                          {s.record.email && <div><b>Email :</b> <a href={`mailto:${s.record.email}`}>{s.record.email}</a></div>}
                          {s.record.phone && <div><b>Tél :</b> {s.record.phone}</div>}
                          {s.record.address && <div><b>Adresse :</b> {s.record.address}</div>}
                          {s.record.url && (
                            <div><b>Site :</b> <a href={s.record.url} target="_blank" rel="noreferrer noopener">{s.record.url} ↗</a></div>
                          )}
                          {s.record.terms > 0 && <span className="hint">Paiement accordé à {s.record.terms} jours</span>}
                          {s.record.notes && <div className="hint" style={{ marginTop: 4 }}><b>Notes :</b> {s.record.notes}</div>}
                        </div>
                      )}

                      <div className="hint">
                        Premier achat le {dshort(s.firstBuy)} · panier moyen {eur2(s.avgOrder)} ·{" "}
                        {s.soldPieces ? `${eur2(s.marginPerPiece)} de marge par article revendu` : "aucune revente encore"}
                      </div>

                      {/* --- TÂCHES ASSOCIÉES AU FOURNISSEUR --- */}
                      {(() => {
                        const supplierTodos = state.todos.filter(
                          (t) => (t.supplierName || "").toLowerCase() === s.name.toLowerCase()
                        );
                        return (
                          <div className="supplier-tasks-section" style={{ margin: "8px 0", background: "var(--card-bg-2)", padding: 12, borderRadius: 10, border: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <b style={{ fontSize: 13 }}>📋 Tâches pour {s.name} ({supplierTodos.length})</b>
                            </div>

                            {supplierTodos.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                {supplierTodos.map((t) => (
                                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, background: "var(--bg)", padding: "5px 10px", borderRadius: 6 }}>
                                    <input
                                      type="checkbox"
                                      checked={t.col === "termine"}
                                      style={{ accentColor: "var(--accent)" }}
                                      onChange={(e) => dispatch({ type: "patchTodo", id: t.id, patch: { col: e.target.checked ? "termine" : "faire" } })}
                                    />
                                    <span style={{ flex: 1, textDecoration: t.col === "termine" ? "line-through" : "none" }}>{t.text}</span>
                                    {t.dueDate && <span className="hint" style={{ fontSize: 11 }}>📅 {t.dueDate}</span>}
                                    <button className="iconbtn del" title="Supprimer" onClick={() => dispatch({ type: "removeTodo", id: t.id })}>✕</button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="hint" style={{ marginBottom: 8 }}>Aucune tâche spécifique pour ce fournisseur.</div>
                            )}

                            <input
                              type="text"
                              placeholder="+ Ajouter une tâche pour ce fournisseur (Entrée)..."
                              style={{ fontSize: 12, padding: "6px 10px", width: "100%" }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const text = e.currentTarget.value.trim();
                                  if (text) {
                                    dispatch({
                                      type: "addTodo",
                                      todo: {
                                        id: uid(),
                                        text,
                                        col: "faire",
                                        order: 1,
                                        createdAt: Date.now(),
                                        supplierName: s.name,
                                      },
                                    });
                                    e.currentTarget.value = "";
                                    toast(`Tâche ajoutée pour ${s.name}`);
                                  }
                                }
                              }}
                            />
                          </div>
                        );
                      })()}

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

      {ordering !== null && (
        <OrderModal defaultSource={ordering} onClose={() => setOrdering(null)} />
      )}
      {recordFor && (
        <SupplierModal name={recordFor.name} record={recordFor.record} onClose={() => setRecordFor(null)} />
      )}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
