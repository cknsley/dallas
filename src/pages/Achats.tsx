import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Photo, Segmented } from "../components/ui";
import InlineField from "../components/InlineField";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { REQUEST_LABEL } from "../lib/constants";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import OrderModal from "../modals/OrderModal";
import MenuButton from "../components/MenuButton";
import RequestModal from "../modals/RequestModal";
import ItemModal from "../modals/ItemModal";
import type { Item, ProductRequest } from "../types";

/**
 * Centrale d'achat : tout ce qui entre, du colis commandé jusqu'au stock.
 * Une pièce arrive en « Arrivage » avec son suivi, puis bascule en stock à la
 * réception. Les achats plus anciens restent consultables dans l'archive.
 */
export default function Achats() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"lot" | "supplier" | null>(null);
  const [newItem, setNewItem] = useState(false);
  const [requestFor, setRequestFor] = useState<{ request: ProductRequest | null } | null>(null);
  const [ordering, setOrdering] = useState<ProductRequest | null>(null);
  const [requestFilter, setRequestFilter] = useQueryState("demandes", "ouvertes");
  const [editing, setEditing] = useState<Item | null>(null);
  const [openOrder, setOpenOrder] = useState("");

  const now = today();

  const incoming = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "arrivage")
        .sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999")),
    [state.items],
  );

  const archiveCount = useMemo(
    () => state.items.filter((i) => i.status !== "arrivage").length,
    [state.items],
  );

  const late = incoming.filter((i) => i.expectedDate && i.expectedDate < now);
  const inTransit = incoming.reduce((a, i) => a + costOf(i), 0);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  /* ---- demandes produit ---- */
  const requests = useMemo(
    () => [...state.requests].sort((a, b) => b.date.localeCompare(a.date)),
    [state.requests],
  );
  const openRequests = requests.filter((r) => r.status === "brouillon" || r.status === "envoyee");
  const shownRequests = requestFilter === "toutes" ? requests : openRequests;
  const requestBudget = (r: ProductRequest) =>
    r.lines.reduce((a, l) => a + num(l.targetPrice) * Math.max(1, l.quantity), 0);
  const requestPieces = (r: ProductRequest) => r.lines.reduce((a, l) => a + Math.max(1, l.quantity), 0);

  const advance = (r: ProductRequest, status: ProductRequest["status"]) => {
    dispatch({ type: "upsertRequest", request: { ...r, status } });
    toast(`Demande ${REQUEST_LABEL[status].toLowerCase()}`);
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Prochaines arrivées</h3>
          <div className="spacer" />
          <span className="hint">
            {incoming.length
              ? `${incomingOrders.length} commande${incomingOrders.length > 1 ? "s" : ""} en route · ${eur(inTransit)} engagés${late.length ? ` · ${late.length} en retard` : ""} — dépliez pour renseigner le suivi`
              : "Rien en chemin"}
          </span>
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
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Demandes produit</h3>
          <div className="spacer" />
          <Segmented<string>
            value={requestFilter}
            onChange={setRequestFilter}
            options={[
              { value: "ouvertes", label: `En cours (${openRequests.length})` },
              { value: "toutes", label: `Toutes (${requests.length})` },
            ]}
          />
          <button className="btn" onClick={() => setRequestFor({ request: null })}>+ Nouvelle demande</button>
        </div>
        {shownRequests.length === 0 ? (
          <Empty glyph="≡" title={requests.length ? "Aucune demande en cours" : "Aucune demande"}>
            Décrivez ce que vous cherchez et à quel prix ; une fois la demande acceptée, convertissez-la en
            commande et ses articles entreront en arrivage.
          </Empty>
        ) : (
          <div className="request-grid">
            {shownRequests.map((r) => (
              <article className={`request-card st-${r.status}`} key={r.id}>
                <header className="request-head">
                  <span className={`pill req-${r.status}`}>{REQUEST_LABEL[r.status]}</span>
                  <span className="hint num">{dshort(r.date)}</span>
                </header>
                <button className="request-supplier linkish" onClick={() => setRequestFor({ request: r })}>
                  {r.supplier || "Fournisseur non précisé"}
                </button>
                <div className="request-foot">
                  <span className="hint">{requestPieces(r)} article{requestPieces(r) > 1 ? "s" : ""}</span>
                  <b className="num">{eur2(requestBudget(r))}</b>
                </div>
                <div className="request-actions">
                  {r.status === "brouillon" && (
                    <button className="btn sm" onClick={() => advance(r, "envoyee")}>Marquer envoyée</button>
                  )}
                  {r.status === "envoyee" && (
                    <>
                      <button className="btn sm" onClick={() => setOrdering(r)}>Convertir</button>
                      <button className="btn sm ghost" onClick={() => advance(r, "refusee")}>Refusée</button>
                    </>
                  )}
                  {r.status === "acceptee" && !r.orderId && (
                    <button className="btn sm" onClick={() => setOrdering(r)}>Convertir</button>
                  )}
                  {r.orderId && <span className="hint">Commande passée</span>}
                  {r.status === "refusee" && (
                    <button className="btn sm ghost" onClick={() => advance(r, "envoyee")}>Relancer</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ---------- archive ---------- */}
      {archiveCount > 0 && (
        <button className="card archive-link" onClick={() => navigate(links.stock())}>
          <span>Historique des achats</span>
          <span className="hint">{archiveCount} article{archiveCount > 1 ? "s" : ""} déjà reçus · voir dans le Stock →</span>
        </button>
      )}

      {creating && <OrderModal mode={creating} onClose={() => setCreating(null)} />}
      {newItem && <ItemModal item={null} onClose={() => setNewItem(false)} />}
      {ordering && (
        <OrderModal fromRequest={ordering} onClose={() => setOrdering(null)} />
      )}
      {requestFor && (
        <RequestModal request={requestFor.request} onClose={() => setRequestFor(null)} />
      )}
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
