import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, PhotoCover, Photo, Segmented, StatusPill } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useClearQuery, useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { costOf, qtyOf } from "../lib/calc";
import { useSecteur } from "../lib/useSecteur";
import { dshort, eur, eur2 } from "../lib/format";
import { STATUS_LABEL } from "../lib/constants";
import { downloadText, itemsToCSV, stockFilename } from "../lib/csv";
import { Download, Plus, Pencil, Trash2 } from "lucide-react";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import GradeRevealModal from "../modals/GradeRevealModal";
import type { Item } from "../types";

export type StockCategoryTab = "vetements" | "chaussures" | "sacs" | "accessoires" | "tcg" | "emballages" | "total";

export function getStockCategory(i: Item): "vetements" | "chaussures" | "sacs" | "accessoires" | "tcg" | "emballages" {
  if (i.isTcg) return "tcg";

  const t = (i.type || "").toLowerCase().trim();
  const n = (i.name || "").toLowerCase().trim();
  const c = ((i as any).category || "").toLowerCase().trim();

  // TCG Cards & Sealed
  if (
    c === "tcg" || t.includes("tcg") || t.includes("carte") || t.includes("booster") ||
    t.includes("display") || t.includes("etb") || t.includes("pokemon") ||
    t.includes("pokémon") || t.includes("lorcana") || t.includes("yugioh") ||
    t.includes("magic") || t.includes("one piece")
  ) {
    return "tcg";
  }

  // Emballages (Cartons, sachets, papier bulle, scotch, fournitures d'envoi)
  if (
    t.includes("emballage") || t.includes("carton") || t.includes("bulle") ||
    t.includes("sachet") || t.includes("pochette d'envoi") || t.includes("pochette d’envoi") ||
    t.includes("fourniture") || t.includes("consommable") || t.includes("scotch") ||
    n.includes("emballage") || n.includes("carton") || n.includes("sachet d'envoi") ||
    n.includes("papier bulle") || c.includes("emballage")
  ) {
    return "emballages";
  }

  // Chaussures & Sneakers
  if (
    t.includes("sneaker") || t.includes("chaussure") || t.includes("basket") ||
    t.includes("botte") || t.includes("claquette") || t.includes("sandale") ||
    t.includes("mule") || t.includes("crampon") ||
    n.includes("sneaker") || n.includes("jordan") || n.includes("dunk") || n.includes("yeezy")
  ) {
    return "chaussures";
  }

  // Sacs
  if (
    t.includes("sac") || t.includes("maroquinerie") || t.includes("sacoche") ||
    t.includes("cabas") || t.includes("valise") || t.includes("tote") ||
    n.includes("sacoche") || n.includes("backpack")
  ) {
    return "sacs";
  }

  // Accessoires
  if (
    t.includes("ceinture") || t.includes("casquette") || t.includes("bijou") ||
    t.includes("lunette") || t.includes("montre") || t.includes("accessoire") ||
    t.includes("bonnet") || t.includes("chapeau") || t.includes("echarpe") ||
    t.includes("écharpe") || t.includes("gant") || t.includes("bob") ||
    t.includes("portefeuille") || t.includes("porte-carte")
  ) {
    return "accessoires";
  }

  // Vêtements par défaut
  return "vetements";
}

const STOCK_TABS: { key: StockCategoryTab; label: string; icon: string }[] = [
  { key: "vetements", label: "Vêtements", icon: "👕" },
  { key: "chaussures", label: "Chaussures", icon: "👟" },
  { key: "sacs", label: "Sacs", icon: "👜" },
  { key: "accessoires", label: "Accessoires", icon: "🧢" },
  { key: "tcg", label: "TCG & Cartes", icon: "🃏" },
  { key: "emballages", label: "Emballages", icon: "📦" },
  { key: "total", label: "Total", icon: "📊" },
];

type SortKey = "name" | "brand" | "type" | "size" | "source" | "status" | "cost" | "buyDate" | "quantity";

const COLUMNS: { key: SortKey | "photo" | "sell" | "actions"; label: string; sortable: boolean; right?: boolean }[] = [
  { key: "photo", label: "", sortable: false },
  { key: "name", label: "Article", sortable: true },
  { key: "quantity", label: "Qté", sortable: true, right: true },
  { key: "brand", label: "Marque", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "size", label: "Taille", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "cost", label: "Coût", sortable: true, right: true },
  { key: "buyDate", label: "Achat", sortable: true },
  { key: "status", label: "Statut", sortable: true, right: true },
  { key: "actions", label: "", sortable: false, right: true },
];

const sortValue = (i: Item, k: SortKey): string | number => {
  switch (k) {
    case "name": case "brand": case "type": case "size": case "source":
      return i[k].toLowerCase();
    case "status": return i.status;
    case "quantity": return qtyOf(i);
    case "cost": return costOf(i);
    case "buyDate": return i.buyDate;
  }
};

export default function Stock() {
  const { state, deleteItem } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [view, setView] = usePref<"table" | "grid">("stockView", "table");
  const [catRaw, setCatRaw] = useQueryState("cat", "total");
  const categoryTab = (catRaw as StockCategoryTab) || "total";
  const setCategoryTab = (val: StockCategoryTab) => setCatRaw(val);
  const secteur = useSecteur();
  const [q, setQ] = useQueryState("q");
  const [brand, setBrand] = useQueryState("brand");
  const [type, setType] = useQueryState("type");
  const [size, setSize] = useQueryState("size");
  const clearFilters = useClearQuery(["q", "brand", "type", "size"]);
  const [sortKey, setSortKey] = useState<SortKey>("buyDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [revealingItem, setRevealingItem] = useState<Item | null>(null);

  const held = useMemo(
    () => secteur.items.filter((i) => i.status === "stock"),
    [secteur.items],
  );

  const tabCounts = useMemo(() => {
    const counts = {
      vetements: 0,
      chaussures: 0,
      sacs: 0,
      accessoires: 0,
      tcg: 0,
      emballages: 0,
      total: 0,
    };
    for (const i of held) {
      const cat = getStockCategory(i);
      const qty = qtyOf(i);
      counts[cat] += qty;
      if (cat !== "emballages") {
        counts.total += qty;
      }
    }
    return counts;
  }, [held]);

  const uniq = (k: "brand" | "type" | "size") =>
    [...new Set(held.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = held.filter((i) => {
      const cat = getStockCategory(i);
      if (categoryTab === "total") {
        if (cat === "emballages") return false; // Emballage exclu du Total
      } else {
        if (cat !== categoryTab) return false;
      }
      if (brand && i.brand !== brand) return false;
      if (type && i.type !== type) return false;
      if (size && i.size !== size) return false;
      if (needle) {
        const hay = [i.name, i.brand, i.type, i.size, i.source, i.notes, i.sku, i.condition].join(" ").toLowerCase();
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
  }, [held, categoryTab, brand, type, size, q, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(["name", "brand", "type", "size", "source", "status"].includes(k) ? "asc" : "desc");
    }
  };

  const hasFilters = !!brand || !!type || !!size || !!q;
  const linkedDoc = (i: Item) => state.docs.find((d) => d.itemIds.includes(i.id));

  // Le capital immobilisé ne compte que les pièces encore en stock pour l'onglet actif.
  const heldCost = list.reduce((a, i) => a + costOf(i), 0);

  const actions = (i: Item) => {
    const isGrading = i.tcgCategory === "grading" || (i.tcgGrade && i.tcgGrade.toLowerCase().includes("gradation"));
    return (
      <div className={`rowact${view === "grid" ? " always" : ""}`}>
        {isGrading && (
          <button
            type="button"
            className="btn sm"
            onClick={() => setRevealingItem(i)}
            style={{
              background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)",
              color: "#fff",
              borderColor: "#ca8a04",
              fontWeight: 800,
              fontSize: 11,
              padding: "2px 8px",
            }}
            title="Révéler la note attribuée par PSA/BGS"
          >
            ✨ Révéler note
          </button>
        )}
        <button className="iconbtn" title="Éditer" onClick={() => setEditing({ item: i })}>
          <Pencil size={14} />
        </button>
        <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(i)}>
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  /** Toggle de statut : « Vendu » ouvre la vente. */
  const statusToggle = (i: Item) => (
    <div className="status-toggle" role="group" aria-label="Statut de l’article">
      {(["stock", "vendu"] as const).map((s) => (
        <button
          key={s}
          type="button"
          className={`st-${s}${i.status === s ? " on" : ""}`}
          aria-pressed={i.status === s}
          onClick={() => {
            if (i.status === s) return;
            if (s === "vendu") { setSelling(i); return; }
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
          <Download size={14} /> Export CSV
        </button>
        <button className="btn primary" onClick={() => setEditing({ item: null })}>
          <Plus size={14} /> Nouvel article
        </button>
      </HeaderActions>

      {/* Onglets de catégories du Stock */}
      <div className="stock-tabs-bar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {STOCK_TABS.map((tab) => {
          const active = categoryTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              className={`btn${active ? " primary" : " ghost"}`}
              onClick={() => setCategoryTab(tab.key)}
              style={{
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{tab.icon} {tab.label}</span>
              <span
                className="badge"
                style={{
                  background: active ? "rgba(255, 255, 255, 0.25)" : "var(--surface-sub)",
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
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
            placeholder="Rechercher par nom, marque, SKU, état…"
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
        {categoryTab === "total" && " (hors emballages)"}
        {categoryTab === "emballages" && " (fournitures & emballages)"}
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty glyph="◫" title="Aucun article ici">
            {held.length ? "Aucun résultat pour ces filtres ou cet onglet." : "Ajoutez votre premier article pour démarrer le suivi."}
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
                {list.map((i) => (
                  <tr key={i.id}>
                    <td className="shrink"><Photo id={i.photoId} /></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <button className="linkish ellipsis" title={i.name} onClick={() => setEditing({ item: i })}>
                          {i.name || "Sans nom"}
                        </button>
                        {i.sku && <span className="pill ghost" style={{ fontSize: 10, padding: "1px 6px" }}>SKU: {i.sku}</span>}
                      </div>
                      <div className="hint ellipsis" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                        {i.condition && <span style={{ color: "var(--accent)", fontWeight: 600 }}>{i.condition}</span>}
                        {i.notes && <span>{i.notes}</span>}
                      </div>
                    </td>
                    <td className="r num shrink">{qtyOf(i)}</td>
                    <td>{i.brand || "—"}</td>
                    <td>{i.type || "—"}</td>
                    <td>{i.size || "—"}</td>
                    <td>{i.source || "—"}</td>
                    <td className="r num">{eur2(costOf(i))}</td>
                    <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.buyDate)}</td>
                    <td className="r shrink">{statusToggle(i)}</td>
                    <td className="r shrink">{actions(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="gallery">
          {list.map((i) => (
            <article className="gcard" key={i.id}>
              <div className="ph">
                <PhotoCover id={i.photoId} />
                <StatusPill status={i.status} />
              </div>
              <div className="gb">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="brand-line">{i.brand || "—"}</div>
                    <button className="linkish" onClick={() => setEditing({ item: i })}>
                      {i.name || "Sans nom"}
                    </button>
                  </div>
                  <div style={{ flexShrink: 0, marginTop: -2 }}>{actions(i)}</div>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  {i.type || "—"}{i.size ? ` · ${i.size}` : ""}
                  {i.condition ? ` · ${i.condition}` : ""}
                  {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                </div>
                {i.sku && <div className="meta hint" style={{ fontSize: 11 }}>SKU: {i.sku}</div>}
                <div className="meta num">Coût {eur2(costOf(i))}</div>
              </div>
              <div className="gf">{statusToggle(i)}</div>
            </article>
          ))}
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
      {revealingItem && (
        <GradeRevealModal
          item={revealingItem}
          onClose={() => setRevealingItem(null)}
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
