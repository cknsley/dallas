import { useMemo, useState } from "react";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, RangePicker, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { useDateRange } from "../lib/useDateRange";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { useSecteur } from "../lib/useSecteur";
import { buildSuppliers, blankSupplierRecord, looksLikeRetail, type Supplier } from "../lib/suppliers";
import { costOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2 } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import ItemModal from "../modals/ItemModal";
import SupplierModal from "../modals/SupplierModal";
import OrderModal from "../modals/OrderModal";
import ExpenseModal from "../modals/ExpenseModal";
import type { Item, SupplierRecord } from "../types";

type Sort = "name" | "rating" | "purchases" | "debt" | "leadTime";

const SORTS: { value: Sort; label: string }[] = [
  { value: "rating", label: "Étoiles" },
  { value: "purchases", label: "Volume" },
  { value: "debt", label: "Dette" },
  { value: "leadTime", label: "Délai" },
  { value: "name", label: "Nom" },
];

const Stars = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <span className="rating">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" className={`star${value >= n ? " on" : ""}`} title={`${n} / 5`} onClick={() => onChange(value === n ? 0 : n)}>
        ★
      </button>
    ))}
  </span>
);

/** Fournisseurs : un tableau, léger, avec fiche prestataire, délais et dette. */
export default function Fournisseurs() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("fourn");
  const [sort, setSort] = usePref<Sort>("supplierSort", "rating");
  const [q, setQ] = useQueryState("q");
  const secteur = useSecteur();
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [recordFor, setRecordFor] = useState<{ name: string; record: SupplierRecord | null } | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);

  const excluded = state.settings.nonSuppliers;
  const allSources = useMemo(
    () => buildSuppliers(secteur.items, state.suppliers),
    [secteur.items, state.suppliers],
  );

  const suppliers = useMemo(
    () => allSources.filter((s) => s.name !== "Source non renseignée" && !excluded.includes(s.key)),
    [allSources, excluded],
  );
  const hiddenSources = useMemo(() => allSources.filter((s) => excluded.includes(s.key)), [allSources, excluded]);
  const retailCandidates = useMemo(() => suppliers.filter((s) => looksLikeRetail(s.name) && !s.record), [suppliers]);

  const setExcluded = (keys: string[]) => dispatch({ type: "settings", patch: { nonSuppliers: keys } });
  const exclude = (s: Supplier) => {
    setExcluded([...excluded, s.key]);
    toast(`« ${s.name} » retiré des fournisseurs`);
  };
  const restore = (key: string) => setExcluded(excluded.filter((k) => k !== key));

  const rate = (s: Supplier, n: number) => {
    const rec = s.record ? { ...s.record, tags: s.record.tags ?? [] } : blankSupplierRecord(s.name, uid());
    dispatch({ type: "upsertSupplier", supplier: { ...rec, rating: n } });
  };

  const allTags = useMemo(
    () => [...new Set(suppliers.flatMap((s) => s.record?.tags ?? []))].sort((a, b) => a.localeCompare(b, "fr")),
    [suppliers],
  );
  const toggleTag = (t: string) => setActiveTags((tags) => (tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = suppliers
      .filter((s) => !needle || s.name.toLowerCase().includes(needle))
      .filter((s) => activeTags.length === 0 || activeTags.every((t) => (s.record?.tags ?? []).includes(t)));
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "rating": return (b.record?.rating ?? 0) - (a.record?.rating ?? 0) || b.purchases - a.purchases;
        case "debt": return b.debt - a.debt;
        case "leadTime": return (a.leadTime ?? 9999) - (b.leadTime ?? 9999);
        case "name": return a.name.localeCompare(b.name, "fr");
        default: return b.purchases - a.purchases;
      }
    });
  }, [suppliers, q, activeTags, sort]);

  const supplierKeys = useMemo(() => new Set(suppliers.map((s) => s.key)), [suppliers]);
  const bought = useMemo(
    () => secteur.items.filter((i) => supplierKeys.has((i.source.trim() || "Source non renseignée").toLowerCase()) && i.buyDate >= range.from && i.buyDate <= range.to),
    [secteur.items, supplierKeys, range],
  );

  const debt = suppliers.reduce((a, s) => a + s.debt, 0);
  const debtors = suppliers.filter((s) => s.debt > 0);
  const clientDebt = secteur.items
    .filter((i) => i.status === "vendu" && i.delivery === "non_payee")
    .reduce((a, i) => a + revenueOf(i), 0);
  const unpaidDocs = state.docs.filter((d) => !d.paid && secteur.matchesLinked(d.itemIds));
  const unpaidTotal = unpaidDocs.reduce((a, d) => a + d.total, 0);
  const receivables = clientDebt + unpaidTotal;

  const settle = (s: Supplier) => {
    const due = s.items.filter((i) => !i.purchasePaid);
    due.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch: { purchasePaid: true } }));
    toast(`${due.length} achat${due.length > 1 ? "s" : ""} réglé${due.length > 1 ? "s" : ""} chez ${s.name}`);
  };

  const markPaid = (docId: string) =>
    dispatch({ type: "patchDoc", id: docId, patch: { paid: true, paidDate: new Date().toISOString().slice(0, 10) } });

  return (
    <>
      <HeaderActions>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
        <input type="search" value={q} placeholder="Rechercher un prestataire…" style={{ width: 190 }} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setRecordFor({ name: "", record: null })}>+ Nouveau fournisseur</button>
        <button className="btn primary" onClick={() => setOrdering("")}>+ Commande fournisseur</button>
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
          meta={receivables > 0 ? `${eur(clientDebt)} de ventes · ${eur(unpaidTotal)} de factures` : "Rien à encaisser"}
          tone={receivables > 0 ? "warn" : "ok"}
          to={links.facturation({ state: "unpaid" })}
          hint="Factures"
        />
        <Kpi
          label={`Achats — ${range.label}`}
          value={eur(bought.reduce((a, i) => a + costOf(i), 0))}
          meta={`${bought.length} article${bought.length > 1 ? "s" : ""} entrés sur la période`}
          tone="info"
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Factures clients impayées</h3>
          <div className="spacer" />
          <a className="btn sm ghost" href={`#${links.facturation()}`}>Toutes les factures →</a>
        </div>
        {unpaidDocs.length === 0 ? (
          <Empty glyph="§" title="Rien à encaisser">Toutes les factures émises sont réglées.</Empty>
        ) : (
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr><th>Client</th><th>N°</th><th>Échéance</th><th className="r">Montant</th><th className="r" /></tr>
              </thead>
              <tbody>
                {unpaidDocs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.clientName || "Client non renseigné"}</td>
                    <td className="num">{d.number}</td>
                    <td className={d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10) ? "bad" : ""}>{dshort(d.dueDate)}</td>
                    <td className="r num">{eur2(d.total)}</td>
                    <td className="r"><button className="btn sm" onClick={() => markPaid(d.id)}>Marquer payée</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="toolbar">
          <span className="hint">Spécialités :</span>
          {allTags.map((t) => (
            <button key={t} className={`pill pill-btn ${activeTags.includes(t) ? "info" : "neutral"}`} onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
          {activeTags.length > 0 && <button className="btn ghost sm" onClick={() => setActiveTags([])}>Effacer ✕</button>}
        </div>
      )}

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
                <button key={s.key} className="btn sm" onClick={() => exclude(s)}>Retirer « {s.name} »</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hiddenSources.length > 0 && (
        <div className="hint hidden-sources">
          Sources écartées :
          {hiddenSources.map((s) => (
            <button key={s.key} className="btn ghost sm" onClick={() => restore(s.key)}>{s.name} ↺</button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>Fournisseurs</h3>
          <div className="spacer" />
          <span className="hint">Trier par</span>
          <Segmented<Sort> value={sort} onChange={setSort} options={SORTS} />
        </div>
        {list.length === 0 ? (
          <Empty glyph="⌂" title="Aucun fournisseur">
            Le champ « Source » d’un article ou d’une commande alimente cette liste — les achats au détail
            en sont écartés.
          </Empty>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th>Étoiles</th>
                  <th>Délai</th>
                  <th className="r">Achats</th>
                  <th className="r">Dette</th>
                  <th>Dernier achat</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const tags = s.record?.tags ?? [];
                  return (
                    <tr key={s.key}>
                      <td>
                        <button className="linkish" onClick={() => setRecordFor({ name: s.name, record: s.record })}>{s.name}</button>
                        {tags.length > 0 && (
                          <div className="hint" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                            {tags.map((t) => <span key={t} className="pill neutral tag-pill">{t}</span>)}
                          </div>
                        )}
                      </td>
                      <td><Stars value={s.record?.rating ?? 0} onChange={(n) => rate(s, n)} /></td>
                      <td className="num">{s.leadTime === null ? "—" : `${s.leadTime} j`}</td>
                      <td className="r num">{eur(s.purchases)}</td>
                      <td className="r num">
                        {s.debt > 0 ? <span className="pill bad">{eur2(s.debt)}</span> : <span className="pill good">À jour</span>}
                      </td>
                      <td className="num">{dshort(s.lastBuy)}</td>
                      <td className="r">
                        <div className="rowact always">
                          {s.debt > 0 && <button className="btn sm ghost" title="Tout régler" onClick={() => settle(s)}>Régler</button>}
                          <button className="btn sm" onClick={() => setOrdering(s.name)}>Commander</button>
                          <button className="iconbtn" title="Fiche prestataire" onClick={() => setRecordFor({ name: s.name, record: s.record })}>👤</button>
                          <button className="iconbtn del" title="Retirer des fournisseurs" onClick={() => exclude(s)}>✕</button>
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

      {ordering !== null && <OrderModal defaultSource={ordering} onClose={() => setOrdering(null)} />}
      {addingExpense && <ExpenseModal expense={null} onClose={() => setAddingExpense(false)} />}
      {recordFor && <SupplierModal name={recordFor.name} record={recordFor.record} onClose={() => setRecordFor(null)} />}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
