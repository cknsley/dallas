import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import InlineField from "../components/InlineField";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { links } from "../lib/links";
import { costOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, today } from "../lib/format";
import { SHIPPING_LABEL } from "../lib/constants";
import { useQueryState } from "../lib/useQueryState";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import ShipmentModal from "../modals/ShipmentModal";
import DeliveryDetailModal from "../modals/DeliveryDetailModal";
import type { Item, Shipping } from "../types";

const SHIPPING_COLS: { key: Shipping; label: string; icon: string }[] = [
  { key: "en_preparation", label: "À emballer / Préparation", icon: "📦" },
  { key: "a_deposer", label: "À déposer / Expédier", icon: "🚚" },
  { key: "livree", label: "En transit / Livrée", icon: "📫" },
  { key: "recu", label: "Reçu / Bouclée", icon: "✓" },
];

type DeliveryTab = "a_partir" | "a_venir" | "retours";

export default function Livraison() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useQueryState("tab", "a_partir");
  const [viewMode, setViewMode] = usePref<"kanban" | "table">("livraisonView", "kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Shipping | null>(null);

  const [editing, setEditing] = useState<Item | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);

  const now = today();

  /* --- OUTGOING (À PARTIR) — VENTES À EXPÉDIER --- */
  const outgoing = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "vendu" && i.delivery === "commandee")
        .sort((a, b) => a.saleDate.localeCompare(b.saleDate)),
    [state.items],
  );

  const toShip = outgoing;
  const sleeping = toShip.reduce((a, i) => a + revenueOf(i), 0);
  const unpaid = state.items.filter((i) => i.status === "vendu" && i.delivery === "non_payee");
  const delivered = state.items.filter((i) => i.status === "vendu" && i.delivery === "livree");

  /* --- INCOMING (À VENIR) — ARRIVAGES CENTRALE D'ACHAT --- */
  const incomingItems = useMemo(
    () => state.items.filter((i) => i.status === "arrivage"),
    [state.items],
  );

  /* --- RETURNS (RETOURS & LITIGES SAV) --- */
  const returnItems = useMemo(
    () => state.items.filter((i) => Boolean(i.litigeState)),
    [state.items],
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

  const totalIncomingValue = useMemo(() => incomingItems.reduce((a, i) => a + costOf(i), 0), [incomingItems]);
  const lateIncomingParcels = incomingParcels.filter((p) => p.expectedDate && p.expectedDate < now);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });
  const patchParcel = (items: Item[], p: Partial<Item>) => items.forEach((i) => dispatch({ type: "patchItem", id: i.id, patch: p }));

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
      patch(i.id, { shipping: "recu", delivery: "livree", shipDate: i.shipDate || today() });
      toast(`Vente bouclée pour « ${i.name || "Sans nom"} »`, {
        label: "Voir la vente",
        onClick: () => navigate(links.ventes()),
      });
      return;
    }
    patch(i.id, s === "livree" ? { shipping: "livree", shipDate: i.shipDate || today() } : { shipping: s });
    toast(`Envoi : ${SHIPPING_LABEL[s]}`);
  };

  const receiveItem = (item: Item) => {
    patch(item.id, { status: "stock", receiveDate: today() });
    toast(`« ${item.name || "Sans nom"} » est entré en stock`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
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

  const dropShipping = (targetCol: Shipping) => {
    if (!dragId) return;
    const targetItem = state.items.find((i) => i.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (targetItem) {
      setShipping(targetItem, targetCol);
    }
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
                {[i.brand, i.size && `T.${i.size}`, i.buyer && `👤 ${i.buyer}`].filter(Boolean).join(" · ")}
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
      <HeaderActions>
        <Segmented<DeliveryTab>
          value={tab as DeliveryTab}
          onChange={(v) => setTab(v)}
          options={[
            { value: "a_partir", label: `📤 À partir (${toShip.length})` },
            { value: "a_venir", label: `📥 À venir (${incomingParcels.length})` },
            { value: "retours", label: `↩️ Retours (${returnItems.length})` },
          ]}
        />
        {(tab === "a_partir" || tab === "retours") && (
          <Segmented<"kanban" | "table">
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "kanban", label: "Kanban" },
              { value: "table", label: "Tableau" },
            ]}
          />
        )}
        {tab === "a_partir" ? (
          <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle livraison</button>
        ) : tab === "a_venir" ? (
          <button className="btn primary" onClick={() => navigate(links.achats())}>🏬 Centrale d'achat</button>
        ) : (
          <button className="btn primary" onClick={() => navigate(links.sav())}>💬 Ouvrir le SAV</button>
        )}
      </HeaderActions>

      {/* ── BARRE DE CONTRÔLE D'ONGLETS ET VUES DANS LA PAGE (AU-DESSUS DE LA ZONE DE CONTENU) ── */}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Segmented<DeliveryTab>
          value={tab as DeliveryTab}
          onChange={(v) => setTab(v)}
          options={[
            { value: "a_partir", label: `📤 À partir (${toShip.length})` },
            { value: "a_venir", label: `📥 À venir (${incomingParcels.length})` },
            { value: "retours", label: `↩️ Retours (${returnItems.length})` },
          ]}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(tab === "a_partir" || tab === "retours") && (
            <Segmented<"kanban" | "table">
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "kanban", label: "Kanban" },
                { value: "table", label: "Tableau" },
              ]}
            />
          )}
          {tab === "a_partir" ? (
            <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle livraison</button>
          ) : tab === "a_venir" ? (
            <button className="btn primary" onClick={() => navigate(links.achats())}>🏬 Centrale d'achat</button>
          ) : (
            <button className="btn primary" onClick={() => navigate(links.sav())}>💬 Ouvrir le SAV</button>
          )}
        </div>
      </div>

      {tab === "a_partir" && (
        /* ================= TAB 1: À PARTIR (VENTES À EXPÉDIER) ================= */
        <>
          <div className="kpi-grid">
            <Kpi
              label="Colis à envoyer"
              value={String(toShip.length)}
              meta={toShip.length ? `${eur(sleeping)} encaissés, colis pas encore parti` : "Rien en attente d'envoi"}
              tone={toShip.length ? "warn" : "ok"}
            />
            <Kpi
              label="Ventes non payées"
              value={String(unpaid.length)}
              meta={unpaid.length ? "En attente de règlement" : "Tout est réglé"}
              tone={unpaid.length ? "warn" : "ok"}
              to={links.ventes({ delivery: "non_payee" })}
              hint="Ventes"
            />
            <Kpi
              label="Ventes bouclées"
              value={String(delivered.length)}
              meta="Colis reçus par l'acheteur"
              to={links.ventes({ delivery: "livree" })}
              hint="Ventes"
            />
          </div>

          {outgoing.length === 0 ? (
            <div className="card">
              <Empty glyph="↗" title="Rien à livrer">
                {unpaid.length
                  ? `${unpaid.length} vente${unpaid.length > 1 ? "s" : ""} encore non payée${unpaid.length > 1 ? "s" : ""} — elle${unpaid.length > 1 ? "s" : ""} arrivera${unpaid.length > 1 ? "ont" : ""} ici une fois passée${unpaid.length > 1 ? "s" : ""} en « Commandée ».`
                  : "Toutes les commandes payées sont livrées."}{" "}
                <Link to={links.ventes()}>Voir l'historique des ventes</Link>
              </Empty>
            </div>
          ) : viewMode === "kanban" ? (
            /* VUE KANBAN PRIORISÉE */
            <div className="kanban">
              {SHIPPING_COLS.map((col) => {
                const itemsInCol = outgoing.filter((i) => i.shipping === col.key);
                return (
                  <section
                    key={col.key}
                    className={`kcol${overCol === col.key ? " over" : ""}`}
                    onDragOver={(e) => {
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
                    <header className="kcol-head">
                      <span>{col.icon} {col.label}</span>
                      <b className="num">{itemsInCol.length}</b>
                    </header>
                    <div className="kcol-list">
                      {itemsInCol.length === 0 ? (
                        <div className="hint-drop">Glissez un colis ici</div>
                      ) : (
                        itemsInCol.map((i) => shippingCard(i))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            /* VUE TABLEAU COMPACT */
            <div className="card">
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Article</th>
                      <th>Destinataire</th>
                      <th>Délai Envoi</th>
                      <th>Moyen transport</th>
                      <th>Étiquette / Suivi</th>
                      <th>Statut Expédition</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outgoing.map((i) => (
                      <tr key={i.id}>
                        <td className="shrink"><Photo id={i.photoId} /></td>
                        <td>
                          <button className="linkish ellipsis" style={{ fontWeight: 600 }} onClick={() => setEditingDelivery(i)}>
                            {i.name || "Sans nom"}
                          </button>
                          <div className="hint">{i.brand || "—"}{i.size ? ` · T.${i.size}` : ""}</div>
                        </td>
                        <td>{i.buyer || "—"}</td>
                        <td>
                          {(() => {
                            const p = getShippingPriority(i);
                            return <span className="pill" style={{ background: p.bg, color: p.color, fontSize: 10, fontWeight: 700 }}>{p.label}</span>;
                          })()}
                        </td>
                        <td><InlineField value={i.carrier} placeholder="Transporteur" onCommit={(v) => patch(i.id, { carrier: v })} width={110} /></td>
                        <td><InlineField value={i.tracking} placeholder="N° de suivi" onCommit={(v) => patch(i.id, { tracking: v })} width={130} /></td>
                        <td>
                          <select
                            value={i.shipping || "en_preparation"}
                            onChange={(e) => setShipping(i, e.target.value as Shipping)}
                            style={{ fontSize: 12, padding: "2px 6px" }}
                          >
                            {SHIPPING_COLS.map((c) => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="r">
                          <button className="btn sm ghost" onClick={() => openLitige(i)}>Litige</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "a_venir" && (
        /* ================= TAB 2: À VENIR (CENTRALE D'ACHAT - ARRIVAGES) ================= */
        <>
          <div className="kpi-grid">
            <Kpi
              label="Colis attendus"
              value={String(incomingParcels.length)}
              meta={`${incomingItems.reduce((a, i) => a + qtyOf(i), 0)} article(s) en transit`}
              tone="info"
            />
            <Kpi
              label="Capital en transit"
              value={eur(totalIncomingValue)}
              meta="Total achats en cours d'acheminement"
              tone="warn"
              to={links.achats()}
              hint="Centrale"
            />
            <Kpi
              label="En retard"
              value={String(lateIncomingParcels.length)}
              meta={lateIncomingParcels.length ? "Date d'arrivée estimée dépassée" : "Aucun retard sur les livraisons"}
              tone={lateIncomingParcels.length ? "warn" : "ok"}
            />
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Colis & Livraisons à venir (Centrale d'achat)</h3>
              <div className="spacer" />
              <Link to={links.achats()} className="hint-link">Gérer dans la Centrale d'achat →</Link>
            </div>

            {incomingParcels.length === 0 ? (
              <Empty glyph="📥" title="Aucun colis à venir">
                Aucune commande fournisseur en attente d'arrivée.
                <div style={{ marginTop: 12 }}>
                  <button className="btn primary" onClick={() => navigate(links.achats())}>
                    🏬 Ouvrir la Centrale d'achat
                  </button>
                </div>
              </Empty>
            ) : (
              <div className="parcel-grid">
                {incomingParcels.map((p) => {
                  const isLate = !!p.expectedDate && p.expectedDate < now;
                  return (
                    <article className={`parcel-card${isLate ? " late" : ""}`} key={p.orderId}>
                      <header className="parcel-head">
                        <div className="parcel-id">
                          <b>📦 {p.supplier}</b>
                          <span className="pill info">{p.qty} article{p.qty > 1 ? "s" : ""}</span>
                          <span className={`pill ${p.purchasePaid ? "good" : "bad"}`}>{p.purchasePaid ? "Réglé" : "À régler"}</span>
                          {isLate && <span className="pill bad">Retard</span>}
                        </div>
                        <button className="btn ok" onClick={() => navigate(links.achats())}>
                          ✓ Réceptionner dans la Centrale ({eur2(p.total)})
                        </button>
                      </header>

                      <div className="parcel-meta">
                        <InlineField value={p.carrier} placeholder="Transporteur" onCommit={(v) => patchParcel(p.items, { carrier: v })} width={130} />
                        {p.tracking ? (
                          <TrackingLink carrier={p.carrier} code={p.tracking} />
                        ) : (
                          <InlineField value={p.tracking} placeholder="Code de suivi" onCommit={(v) => patchParcel(p.items, { tracking: v })} width={140} />
                        )}
                        <InlineField value={p.expectedDate} type="date" placeholder="" onCommit={(v) => patchParcel(p.items, { expectedDate: v })} width={132} />
                        <span className="hint">
                          {p.expectedDate ? `Arrivée ${dshort(p.expectedDate)}` : "Date inconnue"}
                          {p.buyDate ? ` · commandé le ${dshort(p.buyDate)}` : ""}
                        </span>
                      </div>

                      <div className="twrap">
                        <table className="table-compact">
                          <thead>
                            <tr><th>Article</th><th>Marque</th><th>Taille</th><th className="r">Qté</th><th className="r">Coût</th><th className="r">Action</th></tr>
                          </thead>
                          <tbody>
                            {p.items.map((i) => (
                              <tr key={i.id}>
                                <td>
                                  <div className="cell-item">
                                    <Photo id={i.photoId} />
                                    <div className="cell-item-text">
                                      <button className="linkish ellipsis" onClick={() => setEditing(i)}>{i.name || "Sans nom"}</button>
                                      {(i.sku || i.condition) && (
                                        <div className="cell-item-tags">
                                          {i.sku && <span className="pill ghost">{i.sku}</span>}
                                          {i.condition && <span className="accent">{i.condition}</span>}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>{i.brand || "—"}</td>
                                <td>{i.size || "—"}</td>
                                <td className="r num">{qtyOf(i)}</td>
                                <td className="r num">{eur2(costOf(i))}</td>
                                <td className="r">
                                  <div className="rowact always">
                                    <button className="btn sm ok" onClick={() => receiveItem(i)}>⇩ Stock</button>
                                    <button className="btn sm ghost" onClick={() => openLitige(i)}>Litige</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "retours" && (
        /* ================= TAB 3: RETOURS & LITIGES SAV ================= */
        <>
          <div className="kpi-grid" style={{ marginBottom: 18 }}>
            <Kpi
              label="Retours & Litiges"
              value={String(returnItems.length)}
              meta="Dossiers de retour ou litiges client"
              tone={returnItems.length ? "warn" : "ok"}
            />
            <Kpi
              label="Litiges en cours"
              value={String(returnItems.filter((i) => i.litigeState === "en_cours").length)}
              meta="En investigation ou négociation"
              tone="warn"
            />
            <Kpi
              label="Résolus & Clôturés"
              value={String(returnItems.filter((i) => i.litigeState === "resolu").length)}
              meta="Dossiers résolus"
              tone="ok"
              to={links.sav()}
              hint="SAV"
            />
          </div>

          <div className="card">
            <div className="card-h">
              <h3>↩️ Colis de Retours & Litiges SAV ({returnItems.length})</h3>
              <div className="spacer" />
              <button className="btn ghost sm" onClick={() => navigate(links.sav())}>Gérer dans le SAV →</button>
            </div>

            {returnItems.length === 0 ? (
              <Empty glyph="↩️" title="Aucun retour en cours">
                Aucun colis de retour client ou litige SAV signalé.
              </Empty>
            ) : viewMode === "kanban" ? (
              <div className="kanban">
                {[
                  { key: "en_cours", label: "🚨 Litige Déclaré", icon: "⚠️" },
                  { key: "attente", label: "🚚 En Attente de Réponse", icon: "📦" },
                  { key: "resolu", label: "✅ Litige Résolu", icon: "✓" },
                ].map((col) => {
                  const itemsInCol = returnItems.filter((i) => (i.litigeState || "en_cours") === col.key);
                  return (
                    <section key={col.key} className="kcol">
                      <header className="kcol-head">
                        <span>{col.icon} {col.label}</span>
                        <b className="num">{itemsInCol.length}</b>
                      </header>
                      <div className="kcol-list">
                        {itemsInCol.length === 0 ? (
                          <div className="hint-drop" style={{ borderStyle: "solid", opacity: 0.5 }}>Aucun dossier</div>
                        ) : (
                          itemsInCol.map((i) => (
                            <div key={i.id} className="kcard" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", borderRadius: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span className="pill warn" style={{ fontSize: 10 }}>{i.litigeCategory || "Retour"}</span>
                                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{i.buyer || "Client"}</span>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{i.name || "Article"}</div>
                              <div className="hint" style={{ fontSize: 11 }}>{i.brand || "—"}{i.size ? ` · T.${i.size}` : ""} · {eur(revenueOf(i))}</div>
                              <button className="btn sm primary" onClick={() => navigate(links.sav())}>Voir détails SAV →</button>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Photo</th>
                      <th>Article</th>
                      <th>Client / Acheteur</th>
                      <th>Catégorie Litige</th>
                      <th>Statut Litige</th>
                      <th className="r">Prix Vente</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((i) => (
                      <tr key={i.id}>
                        <td className="shrink"><Photo id={i.photoId} /></td>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{i.name || "Article"}</div>
                          <div className="hint" style={{ fontSize: 11 }}>{i.brand || "—"}{i.size ? ` · T.${i.size}` : ""}</div>
                        </td>
                        <td>{i.buyer || "—"}</td>
                        <td><span className="pill warn" style={{ fontSize: 11 }}>{i.litigeCategory || "Retour"}</span></td>
                        <td><span className="pill info" style={{ fontSize: 11 }}>{i.litigeState || "En cours"}</span></td>
                        <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(revenueOf(i))}</td>
                        <td className="r">
                          <button className="btn sm primary" onClick={() => navigate(links.sav())}>Gérer au SAV →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

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
