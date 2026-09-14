import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Kpi, Photo } from "../components/ui";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { links } from "../lib/links";
import { costOf, qtyOf, revenueOf } from "../lib/calc";
import { useSecteur } from "../lib/useSecteur";
import { itemAttr, sizeTag } from "../lib/sectorFields";
import { dshort, eur, eur2, today } from "../lib/format";
import { SHIPPING_LABEL } from "../lib/constants";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import ShipmentModal from "../modals/ShipmentModal";
import DeliveryDetailModal from "../modals/DeliveryDetailModal";
import type { Item, Shipping } from "../types";

type DeliveryStage = "arrivage" | "a_livrer" | "livre";

const SHIPPING_COLS: { key: DeliveryStage; label: string; icon: string; shipping?: Shipping }[] = [
  { key: "arrivage", label: "Arrivage", icon: "📥" },
  { key: "a_livrer", label: "À livrer", icon: "📦", shipping: "en_preparation" },
  { key: "livre", label: "Livré", icon: "✓", shipping: "recu" },
];

export default function Livraison() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const items = useSecteur().items;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<DeliveryStage | null>(null);

  const [editing, setEditing] = useState<Item | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const now = today();

  /* --- OUTGOING (À PARTIR) — VENTES À EXPÉDIER --- */
  const outgoing = useMemo(
    () =>
      items
        .filter((i) => i.status === "vendu" && i.delivery === "commandee")
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate)),
    [items],
  );

  const shippingBoardItems = useMemo(
    () =>
      items
        .filter((i) => i.status === "vendu" && (i.delivery === "commandee" || i.delivery === "livree"))
        .sort((a, b) => (a.saleDate || "").localeCompare(b.saleDate || "")),
    [items],
  );

  const toShip = outgoing;
  const sleeping = toShip.reduce((a, i) => a + revenueOf(i), 0);
  const delivered = items.filter((i) => i.status === "vendu" && i.delivery === "livree");

  /* --- INCOMING (À VENIR) — ARRIVAGES CENTRALE D'ACHAT --- */
  const incomingItems = useMemo(
    () => items.filter((i) => i.status === "arrivage"),
    [items],
  );

  const incomingParcels = useMemo(() => {
    const map = new Map<string, {
      orderId: string; items: Item[]; supplier: string; tracking: string; carrier: string;
      expectedDate: string; buyDate: string; purchasePaid: boolean; qty: number; total: number;
    }>();
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

  const lateIncomingParcels = incomingParcels.filter((p) => p.expectedDate && p.expectedDate < now);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  const openLitige = (item: Item) => {
    patch(item.id, {
      litigeState: "en_cours",
      litigeCategory: item.litigeCategory || "Livraison",
      notes: [item.notes, "Litige signalé pendant la livraison"].filter(Boolean).join("\n"),
    });
    toast("Litige ouvert", { label: "Voir SAV", onClick: () => navigate(links.sav()) });
  };

  const setShipping = (i: Item, s: Shipping) => {
    if (i.shipping === s) return;
    if (s === "recu") {
      patch(i.id, { shipping: "recu", delivery: "livree", validationDate: i.validationDate || today(), shipDate: i.shipDate || today() });
      toast(`Vente bouclée pour « ${i.name || "Sans nom"} »`, {
        label: "Voir la vente",
        onClick: () => navigate(links.ventes()),
      });
      return;
    }
    patch(i.id, s === "livree" ? { shipping: "livree", shipDate: i.shipDate || today() } : { shipping: s });
    toast(`Envoi : ${SHIPPING_LABEL[s]}`);
  };

  const getShippingPriority = (i: Item) => {
    const deadline = i.shipDeadline || (i.saleDate ? new Date(new Date(i.saleDate).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : "");
    if (!i.saleDate) return { label: "NORMAL", color: "var(--ink-2)", bg: "var(--surface-sub)" };
    const nowStr = today();
    if (deadline && deadline < nowStr && (i.shipping === "en_preparation" || i.shipping === "a_deposer")) {
      return { label: `🚨 RETARD (${dshort(deadline)})`, color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" };
    }
    if (deadline && deadline === nowStr && (i.shipping === "en_preparation" || i.shipping === "a_deposer")) {
      return { label: `⚡ AUJOURD'HUI (${dshort(deadline)})`, color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
    }
    return { label: "✅ RECENT", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" };
  };

  const shippingStageOf = (i: Item): DeliveryStage => {
    if (i.delivery === "livree" || i.shipping === "recu" || i.shipping === "livree") return "livre";
    return "a_livrer";
  };

  const dropShipping = (targetCol: DeliveryStage) => {
    if (!dragId) return;
    const targetItem = state.items.find((i) => i.id === dragId);
    setDragId(null);
    setOverCol(null);
    const targetShipping = SHIPPING_COLS.find((col) => col.key === targetCol)?.shipping;
    if (targetItem && targetShipping) {
      setShipping(targetItem, targetShipping);
    }
  };

  const incomingParcelCard = (p: (typeof incomingParcels)[number]) => {
    const isLate = !!p.expectedDate && p.expectedDate < now;
    return (
      <div
        key={p.orderId}
        className="kcard"
        style={{
          borderLeft: `4px solid ${isLate ? "var(--bad)" : "var(--accent)"}`,
          background: "var(--surface)",
          padding: 12,
          borderRadius: 12,
          flexDirection: "column",
          alignItems: "stretch",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="kcard-inner">
          <div className="kcard-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <b className="tx">{p.supplier}</b>
            <span className={`pill ${isLate ? "bad" : "info"}`}>{isLate ? "Retard" : "Attendu"}</span>
          </div>
          <div className="kcard-meta">
            <span className="pill ghost">{p.qty} article{p.qty > 1 ? "s" : ""}</span>
            <span className={`pill ${p.purchasePaid ? "good" : "bad"}`}>{p.purchasePaid ? "Réglé" : "À régler"}</span>
            <span className="hint">{p.expectedDate ? `Arrivée ${dshort(p.expectedDate)}` : "Date inconnue"}</span>
          </div>
          <div className="kcard-meta">
            {p.carrier && <span className="pill info">{p.carrier}</span>}
            {p.tracking && <TrackingLink carrier={p.carrier} code={p.tracking} />}
          </div>
          <button className="btn sm ok" onClick={() => navigate(links.achats())}>
            Réceptionner ({eur2(p.total)})
          </button>
        </div>
      </div>
    );
  };

  const shippingCard = (i: Item) => {
    const prio = getShippingPriority(i);
    return (
      <div
        key={i.id}
        className={`kcard${dragId === i.id ? " dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", i.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(i.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverCol(null);
        }}
        style={{
          borderLeft: `4px solid ${prio.color}`,
          background: "var(--surface)",
          padding: "12px",
          borderRadius: 12,
          marginBottom: 10,
          flexDirection: "column",
          alignItems: "stretch",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div className="kcard-inner" style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 4 }}>
            <span
              className="pill"
              style={{
                background: prio.bg,
                color: prio.color,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              {prio.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {i.saleDate ? `Vendue le ${dshort(i.saleDate)}` : "Date —"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", minWidth: 0 }}>
            <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 8, overflow: "hidden" }}>
              <Photo id={i.photoId} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <button
                className="linkish ellipsis"
                style={{ fontWeight: 700, fontSize: 13, display: "block", width: "100%", textAlign: "left" }}
                onClick={() => setEditingDelivery(i)}
                title={i.name || "Sans nom"}
              >
                {i.name || "Sans nom"}
              </button>
              <div className="hint ellipsis" style={{ fontSize: 11, marginTop: 2 }}>
                {[itemAttr(i, "brand"), sizeTag(i), i.buyer && `👤 ${i.buyer}`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", width: "100%" }}>
            {i.platform && <span className="pill ghost" style={{ fontSize: 10, padding: "2px 6px" }}>🏷️ {i.platform}</span>}
            {i.carrier && <span className="pill info" style={{ fontSize: 10, padding: "2px 6px" }}>🚚 {i.carrier}</span>}
            {(i.shippingLabelUrl || i.buyerUrl) && (
              <a
                className="pill good"
                style={{ fontSize: 10, padding: "2px 6px", textDecoration: "none" }}
                href={i.shippingLabelUrl || i.buyerUrl}
                target="_blank"
                rel="noreferrer"
              >
                📄 Lien ↗
              </a>
            )}
            {i.tracking ? (
              <TrackingLink carrier={i.carrier} code={i.tracking} />
            ) : (
              <button className="btn sm ghost" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setEditingDelivery(i)}>
                + Code de suivi
              </button>
            )}
          </div>

          {/* Action buttons inside card */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", paddingTop: 8, borderTop: "1px solid var(--line-2)" }}>
            {i.shipping === "en_preparation" && (
              <button
                type="button"
                className="btn sm ok"
                style={{ width: "100%", justifyContent: "center", fontSize: 11, fontWeight: 600 }}
                onClick={() => setShipping(i, "a_deposer")}
              >
                🚚 Prêt à déposer →
              </button>
            )}
            {i.shipping === "a_deposer" && (
              <button
                type="button"
                className="btn sm primary"
                style={{ width: "100%", justifyContent: "center", fontSize: 11, fontWeight: 600 }}
                onClick={() => setShipping(i, "livree")}
              >
                📫 Marquer expédié →
              </button>
            )}
            {i.shipping === "livree" && (
              <button
                type="button"
                className="btn sm ok"
                style={{ width: "100%", justifyContent: "center", fontSize: 11, fontWeight: 600 }}
                onClick={() => setShipping(i, "recu")}
              >
                ✓ Valider réception →
              </button>
            )}
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <button
                type="button"
                className="btn sm ghost"
                style={{ flex: 1, justifyContent: "center", fontSize: 10 }}
                onClick={() => setEditingDelivery(i)}
              >
                ✎ Détails
              </button>
              <button
                type="button"
                className="btn sm ghost"
                style={{ flex: 1, justifyContent: "center", fontSize: 10, color: "var(--bad)" }}
                onClick={() => openLitige(i)}
              >
                ⚠ Litige
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="kpi-grid">
        <Kpi
          label="Arrivages"
          value={String(incomingParcels.length)}
          meta={`${incomingItems.reduce((a, i) => a + qtyOf(i), 0)} article(s) attendus`}
          tone={incomingParcels.length ? "info" : "ok"}
        />
        <Kpi
          label="À livrer"
          value={String(toShip.length)}
          meta={toShip.length ? `${eur(sleeping)} encaissés, colis pas encore parti` : "Rien en attente d'envoi"}
          tone={toShip.length ? "warn" : "ok"}
        />
        <Kpi
          label="En retard"
          value={String(lateIncomingParcels.length)}
          meta={lateIncomingParcels.length ? "Arrivage à vérifier" : "Aucun retard fournisseur"}
          tone={lateIncomingParcels.length ? "warn" : "ok"}
        />
        <Kpi
          label="Livrés"
          value={String(delivered.length)}
          meta="Colis reçus par l'acheteur"
          to={links.ventes({ delivery: "livree" })}
          hint="Ventes"
        />
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Suivi des livraisons</h3>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={() => navigate(links.sav())}>SAV</button>
          <button className="btn ghost sm" onClick={() => navigate(links.achats())}>Centrale</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle livraison</button>
        </div>
        <div className="card-b">
          <div className="kanban">
            {SHIPPING_COLS.map((col) => {
              const itemsInCol = col.key === "arrivage"
                ? incomingParcels
                : shippingBoardItems.filter((i) => shippingStageOf(i) === col.key);
              return (
                <section
                  key={col.key}
                  className={`kcol${overCol === col.key ? " over" : ""}`}
                  onDragOver={(e) => {
                    if (!col.shipping) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overCol !== col.key) setOverCol(col.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setOverCol((c) => (c === col.key ? null : c));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropShipping(col.key);
                  }}
                >
                  <div className="kcol-h">
                    <span className="t">{col.icon} {col.label}</span>
                    <span className="c">{itemsInCol.length}</span>
                  </div>
                  <div className="kcol-b">
                    {itemsInCol.length === 0 ? (
                      <div className="hint" style={{ padding: 8 }}>
                        {col.key === "arrivage" ? "Aucun colis fournisseur" : "Glissez un colis ici"}
                      </div>
                    ) : col.key === "arrivage" ? (
                      incomingParcels.map((p) => incomingParcelCard(p))
                    ) : (
                      (itemsInCol as Item[]).map((i) => shippingCard(i))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {creating && <ShipmentModal onClose={() => setCreating(false)} />}
      {editingDelivery && (
        <DeliveryDetailModal
          item={editingDelivery}
          onClose={() => setEditingDelivery(null)}
          onOpenProductDetail={() => setEditing(editingDelivery)}
          onOpenLitige={() => openLitige(editingDelivery)}
        />
      )}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} onSell={(i) => setSelling(i)} />}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => setSelling(null)}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
          onSold={(i) =>
            toast(`Vente enregistrée pour « ${i.name} »`, {
              label: "Voir les ventes",
              onClick: () => navigate(links.ventes()),
            })
          }
        />
      )}
    </>
  );
}
