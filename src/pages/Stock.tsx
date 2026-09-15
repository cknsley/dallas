import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, PhotoCover, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useClearQuery, useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { costOf, purchaseFeesOf, qtyOf } from "../lib/calc";
import { useSecteur } from "../lib/useSecteur";
import { dshortNoYear, eur, eur2 } from "../lib/format";
import { TCG_CATEGORIES, fieldLabels, getTcgCategory, itemAttr, type AttrKey, type TcgCategory } from "../lib/sectorFields";
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
  { key: "total", label: "Total", icon: "📊" },
  { key: "vetements", label: "Vêtements", icon: "👕" },
  { key: "chaussures", label: "Chaussures", icon: "👟" },
  { key: "sacs", label: "Sacs", icon: "👜" },
  { key: "accessoires", label: "Accessoires", icon: "🧢" },
];

/** Espace TCG : mêmes onglets, découpés par format de produit plutôt que par vêtement. */
const TCG_STOCK_TABS: { key: TcgCategory | "total"; label: string; icon: string }[] = [
  { key: "total", label: "Total", icon: "📊" },
  ...TCG_CATEGORIES,
];

type SortKey = "name" | "brand" | "type" | "size" | "condition" | "supplierLot" | "source" | "cost" | "fees" | "price" | "estimate" | "buyDate" | "quantity";

const COLUMNS: { key: SortKey | "photo" | "sell" | "actions"; label: string; sortable: boolean; right?: boolean }[] = [
  { key: "photo", label: "", sortable: false },
  { key: "name", label: "Article", sortable: true },
  { key: "quantity", label: "Qté", sortable: true, right: true },
  { key: "brand", label: "Marque", sortable: true },
  { key: "type", label: "Catégorie", sortable: true },
  { key: "size", label: "Taille", sortable: true },
  { key: "condition", label: "État", sortable: true },
  { key: "supplierLot", label: "Fournisseur / lot", sortable: true },
  { key: "cost", label: "Coût", sortable: true, right: true },
  { key: "fees", label: "Frais", sortable: true, right: true },
  { key: "price", label: "Prix", sortable: true, right: true },
  { key: "estimate", label: "Estim.", sortable: true, right: true },
  { key: "buyDate", label: "Achat", sortable: true },
  { key: "actions", label: "", sortable: false, right: true },
];

const TCG_COLUMN_LABELS: Record<AttrKey, string> = {
  brand: "Licence",
  type: "Set",
  size: "Grade",
  condition: "Format",
};

const sortValue = (i: Item, k: SortKey): string | number => {
  switch (k) {
    case "name": case "source":
      return (i[k] || "").toLowerCase();
    case "brand": case "type": case "size": case "condition":
      return itemAttr(i, k).toLowerCase();
    case "supplierLot": return `${i.source || ""} ${i.lotTag || ""}`.toLowerCase();
    case "quantity": return qtyOf(i);
    case "cost": return costOf(i);
    case "fees": return purchaseFeesOf(i);
    case "price": return i.price || 0;
    case "estimate": return i.estimatedPrice || 0;
    case "buyDate": return i.buyDate;
  }
};

export default function Stock() {
  const { state, deleteItem } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [view, setView] = usePref<"table" | "grid">("stockView", "table");
  const [catRaw, setCatRaw] = useQueryState("cat", "total");
  const secteur = useSecteur();
  // Dans l'espace TCG comme dans un univers personnalisé, tout appartient déjà à ce
  // secteur : les catégories vêtement n'ont plus lieu d'être. L'onglet TCG, lui, ne
  // sort que dans la vue générale et dans l'espace Vêtements.
  const isBuiltinFashionOrAll = secteur.domain === "all" || secteur.domain === "fashion";
  const isTcg = secteur.domain === "tcg";
  const labels = fieldLabels(secteur.domain);
  const visibleTabs: { key: string; label: string; icon: string }[] = isTcg
    ? TCG_STOCK_TABS
    : isBuiltinFashionOrAll
    ? STOCK_TABS.filter((t) => secteur.domain === "all" || t.key !== "tcg")
    : [];
  const categoryTab: string =
    visibleTabs.some((t) => t.key === catRaw) || (isBuiltinFashionOrAll && catRaw === "emballages") ? catRaw : "total";
  const setCategoryTab = (val: string) => setCatRaw(val);
  const columns = isTcg
    ? COLUMNS.filter((c) => c.key !== "condition" && c.key !== "supplierLot").map((c) =>
        c.key in TCG_COLUMN_LABELS ? { ...c, label: TCG_COLUMN_LABELS[c.key as AttrKey] } : c,
      )
    : COLUMNS;
  const [q, setQ] = useQueryState("q");
  const [brand, setBrand] = useQueryState("brand");
  const [type, setType] = useQueryState("type");
  const [size, setSize] = useQueryState("size");
  const [sealed, setSealed] = useQueryState("sealed");
  const clearFilters = useClearQuery(["q", "brand", "type", "size", "sealed"]);
  const [sortKey, setSortKey] = useState<SortKey>("buyDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item[] | null>(null);
  const [revealingItem, setRevealingItem] = useState<Item | null>(null);

  const held = useMemo(
    () => secteur.items.filter((i) => i.status === "stock"),
    [secteur.items],
  );

  /** Onglet d'un article : son format en TCG, sa catégorie vêtement partout ailleurs. */
  const tabOf = (i: Item): string => (isTcg ? getTcgCategory(i) : getStockCategory(i));

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { total: 0 };
    for (const i of held) {
      const cat = tabOf(i);
      const qty = qtyOf(i);
      counts[cat] = (counts[cat] ?? 0) + qty;
      if (cat !== "emballages") {
        counts.total += qty;
      }
    }
    return counts;
  }, [held, isTcg]);

  const uniq = (k: "brand" | "type" | "size") =>
    [...new Set(held.map((i) => itemAttr(i, k)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = held.filter((i) => {
      const cat = tabOf(i);
      if (categoryTab === "total") {
        if (cat === "emballages") return false; // Emballage exclu du Total
      } else {
        if (cat !== categoryTab) return false;
      }
      if (brand && itemAttr(i, "brand") !== brand) return false;
      if (type && itemAttr(i, "type") !== type) return false;
      if (size && itemAttr(i, "size") !== size) return false;
      if (sealed && isTcg) {
        const isSealed = i.tcgSealed !== false;
        if (sealed === "scelle" && !isSealed) return false;
        if (sealed === "ouvert" && isSealed) return false;
      }
      if (needle) {
        const hay = [i.name, i.brand, i.type, i.size, i.source, i.notes, i.sku, i.condition, i.tcgGame, i.tcgSet, i.tcgGrade].join(" ").toLowerCase();
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
  }, [held, categoryTab, brand, type, size, sealed, q, sortKey, sortDir, isTcg]);

  /** Clé de regroupement : même SKU, ou à défaut même fiche produit (nom/marque/type/taille/coût/prix). */
  const groupKeyOf = (i: Item): string =>
    i.sku?.trim()
      ? `sku:${i.sku.trim().toLowerCase()}`
      : [i.name, i.brand, i.type, i.size, i.tcgGrade, i.tcgSet, i.condition, i.cost, i.price, i.source, i.lotTag]
          .map((v) => String(v ?? "").toLowerCase())
          .join("|");

  const groupedList = useMemo(() => {
    const map = new Map<string, { key: string; rep: Item; items: Item[]; qty: number }>();
    for (const i of list) {
      const key = groupKeyOf(i);
      const existing = map.get(key);
      if (existing) {
        existing.items.push(i);
        existing.qty += qtyOf(i);
      } else {
        map.set(key, { key, rep: i, items: [i], qty: qtyOf(i) });
      }
    }
    return [...map.values()];
  }, [list]);

  const TAG_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#3b82f6", "#eab308"];
  const tagColor = (label: string): string => {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    return TAG_COLORS[h % TAG_COLORS.length];
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(["name", "brand", "type", "size", "condition", "supplierLot", "source"].includes(k) ? "asc" : "desc");
    }
  };

  const hasFilters = !!brand || !!type || !!size || !!sealed || !!q;
  const linkedDoc = (i: Item) => state.docs.find((d) => d.itemIds.includes(i.id));
  const supplierNameOf = (i: Item) =>
    state.suppliers.find((supplier) => supplier.id === i.supplierId || supplier.id === i.source || supplier.name === i.source)?.name
    || i.source
    || "—";

  // Le capital immobilisé ne compte que les pièces encore en stock pour l'onglet actif.
  const heldCost = list.reduce((a, i) => a + costOf(i), 0);

  const actions = (i: Item, group?: Item[]) => {
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
        <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(group && group.length > 1 ? group : [i])}>
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

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
      {categoryTab === "emballages" ? (
        <div className="stock-packaging-heading">
          <div>
            <h2>Emballages</h2>
            <span className="hint">Cartons, protections et fournitures d'envoi</span>
          </div>
          <button className="btn ghost sm" onClick={() => setCategoryTab("total")}>Retour au stock</button>
        </div>
      ) : visibleTabs.length > 0 && (
      <div className="stock-tabs-bar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {visibleTabs.map((tab) => {
          const active = categoryTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              className={`btn stock-tab${active ? " primary" : " ghost"}`}
              onClick={() => setCategoryTab(tab.key)}
            >
              <span>{tab.icon} {tab.label}</span>
              <span className={`badge stock-tab-badge${active ? " active" : ""}`}>{count ?? 0}</span>
            </button>
          );
        })}
      </div>
      )}

      <div className="toolbar">
        <button className="btn primary sm" onClick={() => setEditing({ item: null })}>
          <Plus size={14} /> Nouveau
        </button>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">{labels.brandAll}</option>
          {uniq("brand").map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
          <option value="">{labels.typeAll}</option>
          {uniq("type").map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} style={{ width: "auto", minWidth: 110 }}>
          <option value="">{labels.sizeAll}</option>
          {uniq("size").map((b) => <option key={b}>{b}</option>)}
        </select>
        {isTcg && (
          <select value={sealed} onChange={(e) => setSealed(e.target.value)} style={{ width: "auto", minWidth: 110 }}>
            <option value="">Scellé ou non</option>
            <option value="scelle">Scellé</option>
            <option value="ouvert">Ouvert</option>
          </select>
        )}
        <div className="grow">
          <input
            type="search"
            value={q}
            placeholder={isTcg ? "Rechercher par carte, licence, set, grade, SKU…" : "Rechercher par nom, marque, SKU, état…"}
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
            <table className={`table-compact stock-table${isTcg ? " tcg" : ""}`}>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = c.sortable && sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={`${c.sortable ? "sortable" : ""}${c.right ? " r" : ""}${active ? " active" : ""}${c.right || c.key === "photo" || c.key === "buyDate" || c.key === "condition" ? " shrink" : ""}`}
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
                {groupedList.map(({ key, rep: i, items, qty }) => (
                  <tr key={key}>
                    <td className="shrink"><Photo id={i.photoId} /></td>
                    <td className="stock-name-cell">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button className="linkish ellipsis" title={i.name} onClick={() => setEditing({ item: i })}>
                          {i.name || "Sans nom"}
                        </button>
                      </div>
                      <div className="hint ellipsis stock-sku" title={i.sku || "SKU non renseigné"}>
                        SKU · {i.sku || "—"}
                      </div>
                    </td>
                    <td className="r num shrink">
                      <span
                        style={{
                          display: "inline-flex", minWidth: 22, padding: "2px 7px", borderRadius: 8,
                          fontWeight: 700, fontSize: 12, justifyContent: "center",
                          background: qty > 1 ? "rgba(139,92,246,0.18)" : "transparent",
                          color: qty > 1 ? "#c4b5fd" : "inherit",
                        }}
                      >
                        {qty}
                      </span>
                    </td>
                    <td>{itemAttr(i, "brand") || "—"}</td>
                    <td>{itemAttr(i, "type") || "—"}</td>
                    <td>{itemAttr(i, "size") || "—"}</td>
                    {!isTcg && (
                      <td className="shrink">
                        {itemAttr(i, "condition") ? (
                          <span
                            className="stock-condition"
                            style={{
                              background: `${tagColor(itemAttr(i, "condition"))}26`,
                              color: tagColor(itemAttr(i, "condition")),
                              padding: "3px 8px",
                              borderRadius: 999,
                            }}
                          >
                            {itemAttr(i, "condition")}
                          </span>
                        ) : "—"}
                      </td>
                    )}
                    {!isTcg && (
                      <td className="stock-supplier-cell">
                        <div className="ellipsis" title={supplierNameOf(i)}>{supplierNameOf(i)}</div>
                        {i.lotTag && <div className="hint ellipsis" title={i.lotTag}>Lot · {i.lotTag}</div>}
                      </td>
                    )}
                    <td className="r num">{eur2(costOf(i))}</td>
                    <td className="r num">{purchaseFeesOf(i) ? eur2(purchaseFeesOf(i)) : "—"}</td>
                    <td className="r num">{i.price ? eur2(i.price) : "—"}</td>
                    <td className={`r num shrink stock-estimate-cell${i.estimatedPrice ? "" : " empty"}`}>
                      {i.estimatedPrice ? (
                        <span style={{ color: "#4ade80", fontWeight: 700 }}>{eur2(i.estimatedPrice)}</span>
                      ) : "—"}
                    </td>
                    <td className="num nowrap" style={{ fontSize: 12 }}>{dshortNoYear(i.buyDate)}</td>
                    <td className="r shrink">{actions(i, items)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="gallery">
          {groupedList.map(({ key, rep: i, items, qty }) => (
            <article className="gcard" key={key}>
              <div className="ph">
                <PhotoCover id={i.photoId} />
              </div>
              <div className="gb">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="brand-line">{itemAttr(i, "brand") || "—"}</div>
                    <button className="linkish" onClick={() => setEditing({ item: i })}>
                      {i.name || "Sans nom"}
                    </button>
                  </div>
                  <div style={{ flexShrink: 0, marginTop: -2 }}>{actions(i, items)}</div>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  {itemAttr(i, "type") || "—"}{itemAttr(i, "size") ? ` · ${itemAttr(i, "size")}` : ""}
                  {itemAttr(i, "condition") ? ` · ${itemAttr(i, "condition")}` : ""}
                  {qty > 1 && <span className="qty-badge">×{qty}</span>}
                </div>
                {i.sku && <div className="meta hint" style={{ fontSize: 11 }}>SKU: {i.sku}</div>}
                <div className="meta hint">
                  {supplierNameOf(i)}{i.lotTag ? ` · Lot ${i.lotTag}` : ""}
                </div>
                <div className="meta num">Coût {eur2(costOf(i))}</div>
              </div>
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
          title={confirming.length > 1 ? `Supprimer ces ${confirming.length} fiches ?` : "Supprimer cet article ?"}
          body={
            <>
              {confirming.length > 1 ? (
                <>« {confirming[0].name || "Sans nom"} » ({confirming.reduce((a, i) => a + qtyOf(i), 0)} unités regroupées) sera définitivement retirée du stock, photo comprise.</>
              ) : (
                <>« {confirming[0].name || "Sans nom"} » sera définitivement retirée du stock, photo comprise.</>
              )}
              {confirming.some((i) => linkedDoc(i)) && (
                <div className="note warn" style={{ marginTop: 12 }}>
                  <span className="glyph">⚠</span>
                  <div>
                    Elle figure sur un document déjà émis, qui restera émis avec son montant d'origine.
                  </div>
                </div>
              )}
            </>
          }
          onConfirm={() => { confirming.forEach((i) => deleteItem(i)); toast(confirming.length > 1 ? "Fiches supprimées" : "Article supprimé"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
