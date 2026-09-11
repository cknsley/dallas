import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, PhotoCover, Photo, Segmented, StatusPill } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useClearQuery, useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { costOf, marginOf, qtyOf, roiOf } from "../lib/calc";
import { dshort, eur, eur2, today } from "../lib/format";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/constants";
import { downloadText, itemsToCSV, stockFilename } from "../lib/csv";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import type { Item, ItemStatus } from "../types";

type SortKey =
  | "name" | "brand" | "type" | "size" | "source" | "status"
  | "cost" | "price" | "margin" | "roi" | "buyDate" | "saleDate" | "quantity";

const COLUMNS: { key: SortKey | "photo" | "sell" | "actions"; label: string; sortable: boolean; right?: boolean }[] = [
  { key: "photo", label: "", sortable: false },
  { key: "name", label: "Article", sortable: true },
  { key: "quantity", label: "Qté", sortable: true, right: true },
  { key: "brand", label: "Marque", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "size", label: "Taille", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "cost", label: "Coût", sortable: true, right: true },
  { key: "price", label: "Prix vente", sortable: true, right: true },
  { key: "margin", label: "Marge", sortable: true, right: true },
  { key: "buyDate", label: "Achat", sortable: true },
  { key: "saleDate", label: "Vente", sortable: true },
  { key: "status", label: "Statut", sortable: true, right: true },
  { key: "actions", label: "", sortable: false, right: true },
];

const sortValue = (i: Item, k: SortKey): string | number => {
  switch (k) {
    case "name": case "brand": case "type": case "size": case "source":
      return i[k].toLowerCase();
    case "status": return STATUS_ORDER.indexOf(i.status);
    case "quantity": return qtyOf(i);
    case "cost": return costOf(i);
    case "price": return i.price;
    case "margin": return marginOf(i);
    case "roi": return roiOf(i);
    case "buyDate": return i.buyDate;
    case "saleDate": return i.saleDate;
  }
};

export default function Stock() {
  const { state, dispatch, deleteItem } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [view, setView] = usePref<"table" | "grid">("stockView", "table");
  const [statusParam, setStatus] = useQueryState("status", "all");
  const status = statusParam as ItemStatus | "all";
  const [q, setQ] = useQueryState("q");
  const [brand, setBrand] = useQueryState("brand");
  const [type, setType] = useQueryState("type");
  const [size, setSize] = useQueryState("size");
  const clearFilters = useClearQuery(["status", "q", "brand", "type", "size"]);
  const [sortKey, setSortKey] = useState<SortKey>("buyDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);

  const uniq = (k: "brand" | "type" | "size") =>
    [...new Set(held.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  const held = useMemo(() => state.items.filter((i) => i.status !== "vendu"), [state.items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = held.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (brand && i.brand !== brand) return false;
      if (type && i.type !== type) return false;
      if (size && i.size !== size) return false;
      if (needle) {
        const hay = [i.name, i.brand, i.type, i.size, i.source, i.notes].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const x = sortValue(a, sortKey);
      const y = sortValue(b, sortKey);
      if (x === y) return b.createdAt - a.createdAt;
      return (x > y ? 1 : -1) * dir;
    });
  }, [held, status, brand, type, size, q, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(["name", "brand", "type", "size", "source", "status"].includes(k) ? "asc" : "desc");
    }
  };

  const hasFilters = status !== "all" || !!brand || !!type || !!size || !!q;
  const linkedDoc = (i: Item) => state.docs.find((d) => d.itemIds.includes(i.id));
  // Le capital immobilisé ne compte que les pièces encore en stock : une pièce vendue
  // n'immobilise plus rien, l'additionner gonflerait artificiellement le total.
  const heldCost = list.reduce((a, i) => a + costOf(i), 0);

  const actions = (i: Item) => (
    <div className={`rowact${view === "grid" ? " always" : ""}`}>
      <button className="iconbtn" title="Éditer" onClick={() => setEditing({ item: i })}>✎</button>
      <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(i)}>✕</button>
    </div>
  );

  /** Toggle de statut : changer de cran déplace la pièce, et « Vendu » ouvre la vente. */
  const statusToggle = (i: Item) => (
    <div className="status-toggle" role="group" aria-label="Statut de l’article">
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          type="button"
          className={`st-${s}${i.status === s ? " on" : ""}`}
          aria-pressed={i.status === s}
          onClick={() => {
            if (i.status === s) return;
            if (s === "vendu") { setSelling(i); return; }
            dispatch({
              type: "patchItem",
              id: i.id,
              patch: s === "stock"
                ? { status: "stock", receiveDate: i.receiveDate || today() }
                : { status: "arrivage" },
            });
            toast(`« ${i.name || "Sans nom"} » → ${STATUS_LABEL[s]}`);
          }}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <HeaderActions>
        <Segmented<"table" | "grid">
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Tableau" },
            { value: "grid", label: "Grille photo" },
          ]}
        />
        <button className="btn" onClick={() => downloadText(stockFilename(), itemsToCSV(list))}>
          ↓ Export CSV
        </button>
        <button className="btn primary" onClick={() => setEditing({ item: null })}>+ Nouvel article</button>
      </HeaderActions>

      <div className="toolbar">
        <Segmented<ItemStatus | "all">
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: `Tout (${held.length})` },
            // En stock d'abord : c'est la vue de travail la plus fréquente.
            ...(["stock", "arrivage"] as ItemStatus[]).map((s) => ({
              value: s,
              label: `${STATUS_LABEL[s]} (${held.filter((i) => i.status === s).length})`,
            })),
          ]}
        />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">Toutes marques</option>
          {uniq("brand").map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">Tous types</option>
          {uniq("type").map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} style={{ width: "auto", minWidth: 110 }}>
          <option value="">Toutes tailles</option>
          {uniq("size").map((b) => <option key={b}>{b}</option>)}
        </select>
        <div className="grow">
          <input
            type="search"
            value={q}
            placeholder="Rechercher un produit…"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {hasFilters && (
          <button className="btn ghost sm" onClick={clearFilters}>Réinitialiser</button>
        )}
      </div>
      <div className="hint num" style={{ margin: "-6px 0 16px" }}>
        {list.reduce((a, i) => a + qtyOf(i), 0)} article
        {list.reduce((a, i) => a + qtyOf(i), 0) > 1 ? "s" : ""} sur {list.length} ligne{list.length > 1 ? "s" : ""} ·{" "}
        {eur(heldCost)} immobilisés
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty glyph="◫" title="Aucun article ici">
            {held.length ? "Aucun résultat pour ces filtres." : "Ajoutez votre premier article pour démarrer le suivi."}
          </Empty>
        </div>
      ) : view === "table" ? (
        <div className="card">
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = c.sortable && sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={`${c.sortable ? "sortable" : ""}${c.right ? " r" : ""}${active ? " active" : ""}${c.key === "status" || c.key === "actions" || c.key === "photo" ? " shrink" : ""}`}
                        onClick={c.sortable ? () => toggleSort(c.key as SortKey) : undefined}
                      >
                        {c.label}
                        {c.sortable && (
                          <span className="arrow">{active ? (sortDir === "asc" ? "▲" : "▼") : "◆"}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {list.map((i) => {
                  const m = marginOf(i);
                  return (
                    <tr key={i.id}>
                      <td className="shrink"><Photo id={i.photoId} /></td>
                      <td>
                        <button className="linkish ellipsis" title={i.name} onClick={() => setEditing({ item: i })}>
                          {i.name || "Sans nom"}
                        </button>
                        {i.lotTag && <span className="lot-tag" title="Lot d'origine">{i.lotTag}</span>}
                        {i.notes && <div className="hint ellipsis">{i.notes}</div>}
                      </td>
                      <td className="r num shrink">{qtyOf(i)}</td>
                      <td>{i.brand || "—"}</td>
                      <td>{i.type || "—"}</td>
                      <td>{i.size || "—"}</td>
                      <td>{i.source || "—"}</td>
                      <td className="r num">{eur2(costOf(i))}</td>
                      <td className="r num">{i.price ? eur2(i.price) : "—"}</td>
                      <td className={`r num ${m >= 0 ? "pos" : "neg"}`}>{i.price ? eur2(m) : "—"}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.buyDate)}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</td>
                      <td className="r shrink">{statusToggle(i)}</td>
                      <td className="r shrink">{actions(i)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="gallery">
          {list.map((i) => {
            const m = marginOf(i);
            return (
              <article className="gcard" key={i.id}>
                <div className="ph">
                  <PhotoCover id={i.photoId} />
                  <StatusPill status={i.status} />
                </div>
                <div className="gb">
                  <div className="brand-line">{i.brand || "—"}</div>
                  <button className="linkish" onClick={() => setEditing({ item: i })}>
                    {i.name || "Sans nom"}
                  </button>
                  <div className="meta">
                    {i.type || "—"}{i.size ? ` · ${i.size}` : ""}
                    {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                  </div>
                  <div className="meta num">
                    Coût {eur2(costOf(i))}
                    {i.price ? (
                      <> → {eur2(i.price)} <span className={m >= 0 ? "pos" : "neg"}>({m >= 0 ? "+" : ""}{eur2(m)})</span></>
                    ) : null}
                  </div>
                </div>
                <div className="gf">{statusToggle(i)}<div className="spacer" />{actions(i)}</div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing.item}
          onClose={() => setEditing(null)}
          onDelete={(i) => { deleteItem(i); toast("Article supprimé"); }}
          onSell={(i) => setSelling(i)}
        />
      )}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => setSelling(null)}
          onSold={(i) => {
            toast(`« ${i.name} » est passée en Ventes`);
            navigate(links.ventes({ platform: i.platform || undefined }));
          }}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer cet article ?"
          body={
            <>
              « {confirming.name || "Sans nom"} » sera définitivement retirée du stock, photo comprise.
              {linkedDoc(confirming) && (
                <div className="note warn" style={{ marginTop: 12 }}>
                  <span className="glyph">⚠</span>
                  <div>
                    Elle figure sur le document <b>{linkedDoc(confirming)?.number}</b>, qui restera émis avec
                    son montant d'origine.
                  </div>
                </div>
              )}
            </>
          }
          onConfirm={() => { deleteItem(confirming); toast("Article supprimé"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
