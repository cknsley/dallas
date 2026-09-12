import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Photo, Segmented } from "../components/ui";
import InlineField from "../components/InlineField";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { REQUEST_LABEL } from "../lib/constants";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import OrderModal from "../modals/OrderModal";
import MenuButton from "../components/MenuButton";
import RequestModal from "../modals/RequestModal";
import ItemModal, { blankItem } from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import type { Item, ProductRequest } from "../types";

/**
 * Sourcing : tout ce qui entre, du colis commandé jusqu'au stock.
 * Une pièce arrive en « Arrivage » avec son suivi, puis bascule en stock à la
 * réception.
 */
export default function Achats() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"lot" | "supplier" | null>(null);
  const [newItem, setNewItem] = useState(false);
  const [requestFor, setRequestFor] = useState<{ request: ProductRequest | null } | null>(null);
  const [requestFilter, setRequestFilter] = useQueryState("demandes", "ouvertes");
  const [editing, setEditing] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [openOrder, setOpenOrder] = useState("");

  const now = today();

  const incoming = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "arrivage")
        .sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999")),
    [state.items],
  );

/**
   * Balance globale : les achats détaillés par catégorie, séparés de ce qui
   * est encore en chemin (arrivage) et de ce qui est déjà dans le stock —
   * une pièce en arrivage ne compte dans le stock total qu'une fois reçue.
   */
  const balance = useMemo(() => {
    let sold = 0, arrivage = 0, stockTotal = 0;
    const byType = new Map<string, number>();
    for (const i of state.items) {
      const c = costOf(i);
      const k = i.type.trim() || "Sans catégorie";
      byType.set(k, (byType.get(k) ?? 0) + c);
      if (i.status === "vendu") sold += revenueOf(i);
      else if (i.status === "arrivage") arrivage += c;
      else stockTotal += c;
    }
    const categories = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const bought = categories.reduce((a, [, v]) => a + v, 0);
    return { sold, arrivage, stockTotal, categories, bought };
  }, [state.items]);

  const late = incoming.filter((i) => i.expectedDate && i.expectedDate < now);
  const inTransit = incoming.reduce((a, i) => a + costOf(i), 0);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  /* ---- demandes produit : un pense-bête, pas une négociation ---- */
  const requests = useMemo(
    () => [...state.requests].sort((a, b) => b.createdAt - a.createdAt),
    [state.requests],
  );
  const openRequests = requests.filter((r) => r.status === "en_cours");
  const shownRequests = requestFilter === "toutes" ? requests : openRequests;

  /** Une fois trouvé, l'article part directement en stock… */
  const resolveToStock = (r: ProductRequest) => {
    const item: Item = { ...blankItem(), name: r.name, cost: r.budget, status: "stock", receiveDate: today(), notes: r.notes };
    dispatch({ type: "upsertItem", item });
    dispatch({ type: "upsertRequest", request: { ...r, status: "trouve", resolvedAs: "stock" } });
    toast(`« ${r.name} » ajouté au stock`, { label: "Voir le stock", onClick: () => navigate(links.stock()) });
  };

  const [pendingSaleRequest, setPendingSaleRequest] = useState<ProductRequest | null>(null);

  /** …ou en vente directe, quand elle répond à une demande client. */
  const resolveToSale = (r: ProductRequest) => {
    const item: Item = {
      ...blankItem(), name: r.name, cost: r.budget, status: "stock", receiveDate: today(),
      buyer: r.client, notes: r.notes,
    };
    setPendingSaleRequest(r);
    setSelling(item);
  };

  /**
   * À la réception, une ligne de plusieurs exemplaires éclate en articles
   * individuels : chacun se vend, se photographie et se price séparément.
   * Le tag du lot est conservé pour garder le lien avec la commande.
   */
  const receiveItem = (i: Item) => {
    const qty = qtyOf(i);
    const tag = i.lotTag || i.source || "";
    if (qty <= 1) {
      patch(i.id, { status: "stock", receiveDate: today(), lotTag: tag });
      return 1;
    }
    dispatch({ type: "removeItem", id: i.id });
    for (let n = 0; n < qty; n++) {
      dispatch({
        type: "upsertItem",
        item: {
          ...i,
          id: uid(),
          quantity: 1,
          status: "stock",
          receiveDate: today(),
          lotTag: tag,
          createdAt: Date.now() + n,
        },
      });
    }
    return qty;
  };

  const receive = (i: Item) => {
    const units = receiveItem(i);
    toast(
      units > 1
        ? `${units} exemplaires de « ${i.name || "Sans nom"} » entrés à l'unité`
        : `« ${i.name || "Sans nom"} » est en stock`,
      { label: "Voir le stock", onClick: () => navigate(links.stock({ status: "stock" })) },
    );
  };

  /**
   * Les commandes encore en route, dans l'ordre où elles doivent arriver.
   * Les frais d'approche ont été répartis sur chaque article à la commande :
   * on les recompose ici pour montrer ce que chaque lot a coûté à faire venir.
   */
  const incomingOrders = useMemo(() => {
    const map = new Map<string, {
      id: string; tag: string; source: string; expectedDate: string; buyDate: string;
      carrier: string; tracking: string; pieces: number; goods: number; landed: number; paid: boolean;
    }>();
    for (const i of incoming) {
      const id = i.orderId || `solo:${i.id}`;
      const o = map.get(id) ?? {
        id,
        tag: i.lotTag || i.source || "Achat isolé",
        source: i.source,
        expectedDate: i.expectedDate,
        buyDate: i.buyDate,
        carrier: i.carrier,
        tracking: i.tracking,
        pieces: 0, goods: 0, landed: 0, paid: true,
      };
      o.pieces += qtyOf(i);
      o.goods += num(i.cost) * qtyOf(i);
      o.landed += num(i.fees) * qtyOf(i);
      if (!i.purchasePaid) o.paid = false;
      if (i.expectedDate && (!o.expectedDate || i.expectedDate < o.expectedDate)) o.expectedDate = i.expectedDate;
      if (!o.carrier && i.carrier) o.carrier = i.carrier;
      if (!o.tracking && i.tracking) o.tracking = i.tracking;
      map.set(id, o);
    }
    // Sans date annoncée, la commande passe en fin de file.
    return [...map.values()].sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999"));
  }, [incoming]);

  const receiveOrder = (orderId: string) => {
    const lines = incoming.filter((i) => i.orderId === orderId);
    const units = lines.reduce((a, i) => a + receiveItem(i), 0);
    toast(`${units} article${units > 1 ? "s" : ""} entré${units > 1 ? "s" : ""} en stock à l'unité`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
  };

  return (
    <>
      <HeaderActions>
        <MenuButton
          label="+ Nouvelle commande"
          options={[
            { value: "item", label: "Article seul", note: "Une pièce achetée à l'unité" },
            { value: "lot", label: "Lot", note: "Plusieurs articles, port réparti" },
            { value: "supplier", label: "Commande fournisseur", note: "Rattachée à un fournisseur suivi" },
          ]}
          onSelect={(v) => (v === "item" ? setNewItem(true) : setCreating(v as "lot" | "supplier"))}
        />
      </HeaderActions>

      <div className="achats-board">
      <div className="card achats-col">
        <div className="card-h">
          <h3>Stock en arrivage</h3>
        </div>
        <div className="hint" style={{ padding: "14px 16px 10px" }}>
          {incoming.length
            ? `${incomingOrders.length} commande${incomingOrders.length > 1 ? "s" : ""} · ${eur(inTransit)} engagés${late.length ? ` · ${late.length} en retard` : ""}`
            : "Rien en chemin"}
        </div>
        {incomingOrders.length === 0 ? (
          <Empty glyph="⇩" title="Aucune commande en route">
            Enregistrez une commande : elle prendra sa place dans la file d'arrivée, avec ses frais.
          </Empty>
        ) : (
          <div className="arrival-queue">
            {incomingOrders.map((o) => {
              const isLate = !!o.expectedDate && o.expectedDate < now;
              const days = o.expectedDate
                ? Math.round((new Date(o.expectedDate + "T12:00:00").getTime() - Date.now()) / 864e5)
                : null;
              return (
                <article className={`arrival-row${isLate ? " late" : ""}`} key={o.id}>
                  <div className="arrival-id">
                    <b>{o.tag}</b>
                    <span className="hint">
                      {o.pieces} article{o.pieces > 1 ? "s" : ""}
                      {o.carrier ? ` · ${o.carrier}` : ""}
                    </span>
                  </div>
                  <div className="arrival-when">
                    {o.expectedDate ? (
                      <>
                        <b className="num">{dshort(o.expectedDate)}</b>
                        <span className={`hint${isLate ? " neg" : ""}`}>
                          {isLate
                            ? `${Math.abs(days ?? 0)} j de retard`
                            : days === 0
                              ? "aujourd'hui"
                              : `dans ${days} j`}
                        </span>
                      </>
                    ) : (
                      <span className="hint">Date inconnue</span>
                    )}
                  </div>
                  <div className="arrival-costs">
                    <b className="num">{eur2(o.goods + o.landed)}</b>
                    <span className={`pill ${o.paid ? "good" : "bad"}`}>{o.paid ? "Réglé" : "À régler"}</span>
                  </div>
                  <div className="arrival-actions">
                    <button
                      className="btn sm"
                      onClick={() => (o.id.startsWith("solo:")
                        ? receive(incoming.find((i) => `solo:${i.id}` === o.id)!)
                        : receiveOrder(o.id))}
                    >
                      ⇩ Réceptionner
                    </button>
                    <button
                      className="iconbtn"
                      title={openOrder === o.id ? "Replier" : "Voir les articles"}
                      onClick={() => setOpenOrder(openOrder === o.id ? "" : o.id)}
                    >
                      {openOrder === o.id ? "▲" : "▼"}
                    </button>
                  </div>

                  {openOrder === o.id && (
                    <div className="arrival-detail">
                      {incoming
                        .filter((i) => (i.orderId || `solo:${i.id}`) === o.id)
                        .map((i) => (
                          <div className="arrival-item" key={i.id}>
                            <Photo id={i.photoId} />
                            <button className="linkish ellipsis" onClick={() => setEditing(i)}>
                              {i.name || "Sans nom"}
                            </button>
                            <span className="hint nowrap">
                              {i.brand || "—"}
                              {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                            </span>
                            <span className="spacer" />
                            <InlineField
                              value={i.carrier}
                              placeholder="Transporteur"
                              onCommit={(v) => patch(i.id, { carrier: v })}
                              width={120}
                            />
                            <InlineField
                              value={i.tracking}
                              placeholder="Code de suivi"
                              onCommit={(v) => patch(i.id, { tracking: v })}
                              width={130}
                            />
                            <InlineField
                              value={i.expectedDate}
                              type="date"
                              placeholder=""
                              onCommit={(v) => patch(i.id, { expectedDate: v })}
                              width={128}
                            />
                            <b className="num nowrap">{eur2(costOf(i))}</b>
                            <button className="btn sm" onClick={() => receive(i)}>⇩</button>
                          </div>
                        ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- demandes produit ---------- */}
      <div className="card achats-col">
        <div className="card-h">
          <h3>Demande produit</h3>
          <div className="spacer" />
          <button className="btn sm primary" onClick={() => setRequestFor({ request: null })}>
            + Nouvelle
          </button>
        </div>
        <div style={{ padding: "14px 16px 12px" }}>
          <Segmented<string>
            value={requestFilter}
            onChange={setRequestFilter}
            options={[
              { value: "ouvertes", label: `En cours (${openRequests.length})` },
              { value: "toutes", label: `Toutes (${requests.length})` },
            ]}
          />
        </div>
        {shownRequests.length === 0 ? (
          <Empty glyph="≡" title={requests.length ? "Aucune demande en cours" : "Aucune demande"}>
            Notez ce qu'un client demande, ou ce que vous cherchez pour le stock.
          </Empty>
        ) : (
          <div className="request-list">
            {shownRequests.map((r) => (
              <article className={`request-card st-${r.status}`} key={r.id}>
                <header className="request-head">
                  <span className={`pill req-${r.status}`}>
                    {r.status === "trouve"
                      ? `${REQUEST_LABEL.trouve}${r.resolvedAs === "vente" ? " · vendu" : r.resolvedAs === "stock" ? " · en stock" : ""}`
                      : r.for === "client" ? "Client" : "Stock"}
                  </span>
                  <b className="num">{eur2(r.budget)}</b>
                </header>
                <button className="request-supplier linkish ellipsis" onClick={() => setRequestFor({ request: r })}>
                  {r.name || "Article non précisé"}
                </button>
                {r.for === "client" && <div className="hint ellipsis">{r.client || "Client non précisé"}</div>}
                {r.status === "en_cours" && (
                  <div className="request-actions">
                    <button className="btn sm" onClick={() => resolveToStock(r)}>→ Stock</button>
                    <button className="btn sm ghost" onClick={() => resolveToSale(r)}>→ Vente directe</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ---------- balance ---------- */}
      <div className="card achats-col">
        <div className="card-h">
          <h3>Balance</h3>
        </div>
        <div style={{ padding: "14px 16px 16px" }}>
          <div className="totrow big">
            <span>Achats</span>
            <b className="num">{eur2(balance.bought)}</b>
          </div>
          {balance.categories.map(([type, total]) => (
            <button
              key={type}
              className="totrow linked sub"
              onClick={() => navigate(links.stock(type === "Sans catégorie" ? {} : { type }))}
            >
              <span>{type}</span>
              <b className="num">{eur2(total)}</b>
            </button>
          ))}
          <hr className="sep" />
          <button className="totrow linked" onClick={() => navigate("/arrivage")}>
            <span>Achats à venir</span>
            <b className="num">{eur2(balance.arrivage)}</b>
          </button>
          <button className="totrow linked" onClick={() => navigate(links.stock())}>
            <span>Stock total</span>
            <b className="num">{eur2(balance.stockTotal)}</b>
          </button>
          <button className="totrow linked" onClick={() => navigate(links.ventes())}>
            <span>Ventes</span>
            <b className="num">{eur2(balance.sold)}</b>
          </button>
        </div>
      </div>
      </div>

      {creating && <OrderModal mode={creating} onClose={() => setCreating(null)} />}
      {newItem && <ItemModal item={null} onClose={() => setNewItem(false)} />}
      {requestFor && (
        <RequestModal request={requestFor.request} onClose={() => setRequestFor(null)} />
      )}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => { setSelling(null); setPendingSaleRequest(null); }}
          onSold={(i) => {
            if (pendingSaleRequest) {
              dispatch({ type: "upsertRequest", request: { ...pendingSaleRequest, status: "trouve", resolvedAs: "vente" } });
              setPendingSaleRequest(null);
            }
            toast(`« ${i.name} » est passée en Ventes`);
            navigate(links.ventes({ platform: i.platform || undefined }));
          }}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
        />
      )}
    </>
  );
}
