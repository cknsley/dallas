import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Modal, Photo, RangePicker } from "../components/ui";
import InlineField from "../components/InlineField";
import { useStore } from "../store/StoreContext";
import { computeStats, costOf, isTcgItem, qtyOf } from "../lib/calc";
import { fieldLabels, itemAttr } from "../lib/sectorFields";
import { useDateRange } from "../lib/useDateRange";
import { useSecteur } from "../lib/useSecteur";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import { useToast } from "../components/Toast";
import type { Item, ProductGender } from "../types";
import TrackingLink from "../components/TrackingLink";
import ItemModal from "../modals/ItemModal";
import ScannerModal from "../components/ScannerModal";
import OrderModal from "../modals/OrderModal";
import ImportInvoiceModal from "../modals/ImportInvoiceModal";

type Dispatch = ReturnType<typeof useStore>["dispatch"];

/**
 * Réception d'une ligne d'arrivage. Un lot de N exemplaires éclate en N articles
 * individuels : chacun se vend, se photographie et se price séparément. Le tag du
 * lot garde le lien avec la commande d'origine.
 */
function receivedUnits(item: Item): Item[] {
  const qty = qtyOf(item);
  const received = {
    status: "stock" as const,
    receiveDate: today(),
    lotTag: item.lotTag || item.source || "",
  };
  if (qty <= 1) return [{ ...item, ...received }];
  return Array.from({ length: qty }, (_, n) => ({
    ...item,
    ...received,
    id: uid(),
    quantity: 1,
    createdAt: Date.now() + n,
  }));
}

/** Seule implémentation de la réception : toute l'app passe par ici. Renvoie le nombre d'unités entrées. */
function receiveInto(item: Item, dispatch: Dispatch): number {
  const units = receivedUnits(item);
  if (units.length > 1) dispatch({ type: "removeItem", id: item.id });
  units.forEach((unit) => dispatch({ type: "upsertItem", item: unit }));
  return units.length;
}

type ParcelDraft = {
  id: string; name: string; brand: string; type: string; size: string; gender: ProductGender;
  quantity: string; cost: string; fees: string; price: string; condition: string;
};

function ReceiveParcelModal({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const isTcg = useSecteur().domain === "tcg";
  const labels = fieldLabels(isTcg ? "tcg" : "fashion");
  const [drafts, setDrafts] = useState<ParcelDraft[]>(() =>
    items.map((i) => ({
      id: i.id, name: i.name, brand: itemAttr(i, "brand"), type: isTcgItem(i) ? itemAttr(i, "type") : i.type, size: itemAttr(i, "size"), gender: i.gender || "",
      quantity: String(qtyOf(i)), cost: i.cost ? String(i.cost) : "", fees: i.fees ? String(i.fees) : "",
      price: i.price ? String(i.price) : "", condition: i.condition || "Neuf avec étiquette",
    })),
  );

  const patch = <K extends keyof ParcelDraft>(id: string, key: K, value: ParcelDraft[K]) =>
    setDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const saveAll = () => {
    let total = 0;
    for (const d of drafts) {
      const original = items.find((i) => i.id === d.id);
      if (!original) continue;
      total += receiveInto(
        {
          ...original,
          name: d.name.trim() || original.name,
          brand: d.brand.trim(),
          type: d.type.trim(),
          size: d.size.trim(),
          gender: d.gender,
          quantity: Math.max(1, Math.round(num(d.quantity)) || 1),
          cost: num(d.cost),
          fees: num(d.fees),
          price: num(d.price),
          estimatedPrice: num(d.price) || original.estimatedPrice,
          condition: d.condition.trim() || original.condition || "Neuf avec étiquette",
          // En TCG, la colonne « Set » du déballage alimente tcgSet, pas le type d'article.
          ...(isTcgItem(original)
            ? { type: original.type, tcgGame: d.brand.trim() || undefined, tcgSet: d.type.trim() || undefined, tcgGrade: d.size.trim() || undefined }
            : {}),
        },
        dispatch,
      );
    }
    toast(`${total} article${total > 1 ? "s" : ""} réceptionné${total > 1 ? "s" : ""} en stock`, {
      label: "Voir Stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
    onClose();
  };

  return (
    <Modal
      title="Déballage du colis"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={saveAll}>Réceptionner tout</button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 12 }}>
        Corrigez ce que le colis contient réellement, puis validez : une ligne de plusieurs
        exemplaires entre en stock à l'unité.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {drafts.map((d) => (
          <div className="calc-line" key={d.id}>
            <div className="calc-line-grid">
              <label><span>Article</span><input value={d.name} onChange={(e) => patch(d.id, "name", e.target.value)} /></label>
              <label><span>{labels.brand}</span><input value={d.brand} onChange={(e) => patch(d.id, "brand", e.target.value)} /></label>
              <label><span>{labels.type}</span><input value={d.type} onChange={(e) => patch(d.id, "type", e.target.value)} /></label>
              <label><span>{labels.size}</span><input value={d.size} onChange={(e) => patch(d.id, "size", e.target.value)} /></label>
              {!isTcg && (
                <label>
                  <span>Sexe</span>
                  <select value={d.gender} onChange={(e) => patch(d.id, "gender", e.target.value as ProductGender)}>
                    <option value="">Non précisé</option>
                    <option value="homme">Homme</option>
                    <option value="femme">Femme</option>
                    <option value="mixte">Mixte</option>
                    <option value="enfant">Enfant</option>
                  </select>
                </label>
              )}
              <label><span>Quantité</span><input type="number" min="1" step="1" value={d.quantity} onChange={(e) => patch(d.id, "quantity", e.target.value)} /></label>
              <label><span>Coût</span><input type="number" step="0.01" value={d.cost} onChange={(e) => patch(d.id, "cost", e.target.value)} /></label>
              <label><span>Frais</span><input type="number" step="0.01" value={d.fees} onChange={(e) => patch(d.id, "fees", e.target.value)} /></label>
              <label><span>Prix estimé</span><input type="number" step="0.01" value={d.price} onChange={(e) => patch(d.id, "price", e.target.value)} /></label>
              <label>
                <span>État</span>
                <select value={d.condition} onChange={(e) => patch(d.id, "condition", e.target.value)}>
                  <option value="Neuf avec étiquette">✨ Neuf avec étiquette</option>
                  <option value="Neuf sans étiquette">🏷️ Neuf sans étiquette</option>
                  <option value="Très bon état">⭐ Très bon état</option>
                  <option value="Bon état">👍 Bon état</option>
                  <option value="Satisfaisant">👌 Satisfaisant</option>
                  <option value="Grade A">Grade A</option>
                  <option value="Grade B">Grade B</option>
                  <option value="Grade C">Grade C</option>
                  <option value="Grade D">Grade D</option>
                  <option value="Grade E">Grade E</option>
                  <option value="Grade F">Grade F</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

type Parcel = {
  orderId: string; items: Item[]; supplier: string; tracking: string; carrier: string;
  expectedDate: string; buyDate: string; purchasePaid: boolean; qty: number; total: number;
};

/** Une carte de colis, réutilisée dans chaque groupe d'urgence. */
function ParcelCard({ p, now, onReceiveAll, onReceiveOne, onLitige, onEdit, onPatch }: {
  p: Parcel; now: string;
  onReceiveAll: (items: Item[]) => void;
  onReceiveOne: (item: Item) => void;
  onLitige: (i: Item) => void;
  onEdit: (i: Item) => void;
  onPatch: (items: Item[], patch: Partial<Item>) => void;
}) {
  const isLate = !!p.expectedDate && p.expectedDate < now;
  const labels = fieldLabels(useSecteur().domain);
  return (
    <article className={`parcel-card${isLate ? " late" : ""}`}>
      <header className="parcel-head">
        <div className="parcel-id">
          <b>📦 {p.supplier}</b>
          <span className="pill info">{p.qty} article{p.qty > 1 ? "s" : ""}</span>
          <span className={`pill ${p.purchasePaid ? "good" : "bad"}`}>{p.purchasePaid ? "Réglé" : "À régler"}</span>
          {isLate && <span className="pill bad">Retard</span>}
        </div>
        <button className="btn ok" onClick={() => onReceiveAll(p.items)}>✓ Déballer tout ({eur2(p.total)})</button>
      </header>

      <div className="parcel-meta">
        <InlineField value={p.carrier} placeholder="Transporteur" onCommit={(v) => onPatch(p.items, { carrier: v })} width={130} />
        {p.tracking ? (
          <TrackingLink carrier={p.carrier} code={p.tracking} />
        ) : (
          <InlineField value={p.tracking} placeholder="Code de suivi" onCommit={(v) => onPatch(p.items, { tracking: v })} width={140} />
        )}
        <InlineField value={p.expectedDate} type="date" placeholder="" onCommit={(v) => onPatch(p.items, { expectedDate: v })} width={132} />
        <span className="hint">
          {p.expectedDate ? `Arrivée ${dshort(p.expectedDate)}` : "Date inconnue"}
          {p.buyDate ? ` · commandé le ${dshort(p.buyDate)}` : ""}
        </span>
      </div>

      <div className="twrap">
        <table className="table-compact">
          <thead>
            <tr><th>Article</th><th>{labels.brand}</th><th>{labels.size}</th><th className="r">Qté</th><th className="r">Coût</th><th className="r">Action</th></tr>
          </thead>
          <tbody>
            {p.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="cell-item">
                    <Photo id={i.photoId} />
                    <div className="cell-item-text">
                      <button className="linkish ellipsis" onClick={() => onEdit(i)}>{i.name || "Sans nom"}</button>
                      {(i.sku || i.condition) && (
                        <div className="cell-item-tags">
                          {i.sku && <span className="pill ghost">{i.sku}</span>}
                          {i.condition && <span className="accent">{i.condition}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>{itemAttr(i, "brand") || "—"}</td>
                <td>{itemAttr(i, "size") || "—"}</td>
                <td className="r num">{qtyOf(i)}</td>
                <td className="r num">{eur2(costOf(i))}</td>
                <td className="r">
                  <div className="rowact always">
                    <button className="btn sm ok" onClick={() => onReceiveOne(i)}>⇩ Stock</button>
                    <button className="btn sm ghost" onClick={() => onLitige(i)}>Litige</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

/**
 * Arrivage : la file d'attente des colis, du fournisseur jusqu'au stock.
 * Regroupée par urgence (retard, cette semaine, plus tard) pour aller droit au but.
 */
export default function Arrivage() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const secteur = useSecteur();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("arrivage");
  const [q, setQ] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [receivingParcel, setReceivingParcel] = useState<Item[] | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState<{ mode: "lot" | "supplier"; defaultSource?: string; initialLines?: import("../modals/OrderModal").OrderPresetLine[] } | null>(null);

  const now = today();
  const weekLimit = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const incomingItems = useMemo(
    () => secteur.items.filter((i) => i.status === "arrivage"),
    [secteur.items],
  );

  /** Un colis = une commande. Les lignes isolées forment leur propre colis. */
  const parcels = useMemo(() => {
    const map = new Map<string, Parcel>();
    incomingItems.forEach((item) => {
      const key = item.orderId || `solo-${item.id}`;
      if (!map.has(key)) {
        const sup = state.suppliers.find((s) => s.id === item.source || s.name === item.source);
        map.set(key, {
          orderId: key, items: [], supplier: sup?.name || item.source || "Fournisseur direct",
          tracking: item.tracking, carrier: item.carrier, expectedDate: item.expectedDate,
          buyDate: item.buyDate, purchasePaid: true, qty: 0, total: 0,
        });
      }
      const parcel = map.get(key)!;
      parcel.items.push(item);
      parcel.qty += qtyOf(item);
      parcel.total += costOf(item);
      if (!item.purchasePaid) parcel.purchasePaid = false;
      if (item.expectedDate && (!parcel.expectedDate || item.expectedDate < parcel.expectedDate)) {
        parcel.expectedDate = item.expectedDate;
      }
      if (!parcel.tracking && item.tracking) parcel.tracking = item.tracking;
      if (!parcel.carrier && item.carrier) parcel.carrier = item.carrier;
    });
    return [...map.values()].sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999"));
  }, [incomingItems, state.suppliers]);

  const filteredParcels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return parcels;
    return parcels.filter((p) => p.supplier.toLowerCase().includes(needle) || p.items.some((i) => (i.name || "").toLowerCase().includes(needle) || (i.brand || "").toLowerCase().includes(needle)));
  }, [parcels, q]);

  const totalValue = useMemo(() => incomingItems.reduce((a, i) => a + costOf(i), 0), [incomingItems]);
  const lateParcels = filteredParcels.filter((p) => p.expectedDate && p.expectedDate < now);
  const soonParcels = filteredParcels.filter((p) => !lateParcels.includes(p) && p.expectedDate && p.expectedDate <= weekLimit);
  const laterParcels = filteredParcels.filter((p) => !lateParcels.includes(p) && !soonParcels.includes(p));

  const allLateParcels = parcels.filter((p) => p.expectedDate && p.expectedDate < now);

  const stats = useMemo(() => computeStats(state, range), [state, range]);

  const patchParcel = (items: Item[], patch: Partial<Item>) =>
    items.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch }));

  const receiveOne = (item: Item) => {
    const units = receiveInto(item, dispatch);
    toast(
      units > 1 ? `${units} exemplaires de « ${item.name || "Sans nom"} » entrés à l'unité` : `« ${item.name || "Sans nom"} » est en stock`,
      { label: "Voir le stock", onClick: () => navigate(links.stock({ status: "stock" })) },
    );
  };

  const openLitige = (item: Item) => {
    dispatch({
      type: "patchItem", id: item.id,
      patch: {
        litigeState: "en_cours",
        litigeCategory: item.litigeCategory || "Arrivage",
        notes: [item.notes, "Litige signalé à l'arrivage"].filter(Boolean).join("\n"),
      },
    });
    toast("Litige ouvert sur cette ligne", { label: "Voir SAV", onClick: () => navigate(links.sav()) });
  };

  const group = (title: string, glyph: string, list: Parcel[]) => (
    <div className="card" key={title}>
      <div className="card-h">
        <h3>{glyph} {title} ({list.length})</h3>
      </div>
      {list.length === 0 ? (
        <div className="card-b" style={{ padding: 20, textAlign: "center" }}>
          <p className="hint" style={{ margin: 0 }}>Rien ici pour le moment.</p>
        </div>
      ) : (
        <div className="parcel-grid" style={{ padding: 16 }}>
          {list.map((p) => (
            <ParcelCard key={p.orderId} p={p} now={now} onReceiveAll={setReceivingParcel} onReceiveOne={receiveOne} onLitige={openLitige} onEdit={setEditingItem} onPatch={patchParcel} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <HeaderActions>
        <input type="search" value={q} placeholder="Rechercher un colis, un article…" style={{ width: 220 }} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setShowScanner(true)}>📷 Scanner un colis</button>
        <button className="btn" onClick={() => setImportingInvoice(true)}>📄 Importer facture</button>
        <button className="btn primary" onClick={() => setCreatingOrder({ mode: "supplier" })}>+ Commande fournisseur</button>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
      </HeaderActions>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi label="Colis attendus" value={String(parcels.length)} meta={`${incomingItems.reduce((a, i) => a + qtyOf(i), 0)} article(s) en chemin`} tone="info" />
        <Kpi label="Capital en transit" value={eur(totalValue)} meta="Engagé, pas encore en stock" tone="warn" to={links.bilan()} hint="Bilan" />
        <Kpi label="En retard" value={String(allLateParcels.length)} meta={allLateParcels.length ? "Arrivée prévue dépassée" : "Aucun retard"} tone={allLateParcels.length ? "warn" : "ok"} />
        <Kpi
          label="CA total"
          value={eur(stats.ca)}
          meta={`Chiffre d'affaires · ${range.label}`}
          tone="ok"
          to={links.ventes()}
          hint="Ventes"
        />
      </div>

      {parcels.length === 0 ? (
        <div className="card">
          <div className="card-b" style={{ padding: 32, textAlign: "center" }}>
            <Empty glyph="📥" title="Aucun colis en attente">Tous vos colis ont été déballés et réceptionnés en stock.</Empty>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {group("En retard", "🔴", lateParcels)}
          {group("Cette semaine (J-7)", "🟡", soonParcels)}
          {group("Plus tard", "⚪", laterParcels)}
        </div>
      )}

      {editingItem && (
        <ItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onDelete={(i) => { dispatch({ type: "removeItem", id: i.id }); toast("Article supprimé"); setEditingItem(null); }}
          onSell={() => { setEditingItem(null); navigate(links.stock()); }}
        />
      )}
      {receivingParcel && <ReceiveParcelModal items={receivingParcel} onClose={() => setReceivingParcel(null)} />}
      {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}
      {creatingOrder && (
        <OrderModal
          mode={creatingOrder.mode}
          defaultSource={creatingOrder.defaultSource}
          initialLines={creatingOrder.initialLines}
          onClose={() => setCreatingOrder(null)}
        />
      )}
      {importingInvoice && (
        <ImportInvoiceModal
          onClose={() => setImportingInvoice(false)}
          onConfirm={(source, lines) => {
            setImportingInvoice(false);
            setCreatingOrder({ mode: "supplier", defaultSource: source, initialLines: lines });
          }}
        />
      )}
    </>
  );
}
