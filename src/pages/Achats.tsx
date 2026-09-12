import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { costOf, qtyOf } from "../lib/calc";
import { dshort, eur2, num, today } from "../lib/format";
import { REQUEST_LABEL } from "../lib/constants";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import OrderModal from "../modals/OrderModal";
import MenuButton from "../components/MenuButton";
import RequestModal from "../modals/RequestModal";
import ItemModal, { blankItem } from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import type { Item, ProductRequest } from "../types";

/**
 * Sourcing : ce qu'on cherche et ce qu'on a engagé. La réception des colis
 * commandés ici se fait dans Arrivage.
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

/**
   * Balance globale : les achats détaillés par catégorie, séparés de ce qui
   * est encore en chemin (arrivage) et de ce qui est déjà dans le stock —
   * une pièce en arrivage ne compte dans le stock total qu'une fois reçue.
   */
  const balance = useMemo(() => {
    let shipping = 0;
    const byType = new Map<string, number>();
    for (const i of state.items) {
      const c = costOf(i);
      const k = i.type.trim() || "Sans catégorie";
      byType.set(k, (byType.get(k) ?? 0) + c);
      shipping += num(i.fees) * qtyOf(i);
    }
    const categories = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const bought = categories.reduce((a, [, v]) => a + v, 0);
    const vatCollected = state.docs.reduce((a, d) => a + d.vatAmount, 0);
    return { categories, bought, shipping, vatCollected };
  }, [state.items, state.docs]);

  /** Colis en route, groupés par commande — la réception se fait dans Arrivage. */
  const incomingOrders = useMemo(() => {
    const incoming = state.items.filter((i) => i.status === "arrivage");
    const map = new Map<string, { id: string; tag: string; expectedDate: string; pieces: number; cost: number }>();
    for (const i of incoming) {
      const id = i.orderId || `solo:${i.id}`;
      const o = map.get(id) ?? { id, tag: i.lotTag || i.source || "Achat isolé", expectedDate: i.expectedDate, pieces: 0, cost: 0 };
      o.pieces += qtyOf(i);
      o.cost += costOf(i);
      if (i.expectedDate && (!o.expectedDate || i.expectedDate < o.expectedDate)) o.expectedDate = i.expectedDate;
      map.set(id, o);
    }
    return [...map.values()].sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999"));
  }, [state.items]);

  /* ---- demandes produit : un pense-bête, pas une négociation ---- */
  const requests = useMemo(
    () => [...state.requests].sort((a, b) => b.createdAt - a.createdAt),
    [state.requests],
  );
  const openRequests = requests.filter((r) => r.status === "en_cours");
  const shownRequests = requestFilter === "toutes" ? requests : openRequests;

  /** Une fois trouvé, l'article part directement en stock… */
  const resolveToStock = (r: ProductRequest) => {
    const item: Item = {
      ...blankItem(),
      name: r.name,
      brand: r.brand || "",
      size: r.size || "",
      gender: r.gender || "",
      quantity: Math.max(1, r.quantity || 1),
      cost: r.budget,
      status: "stock",
      receiveDate: today(),
      notes: r.notes,
    };
    dispatch({ type: "upsertItem", item });
    dispatch({ type: "upsertRequest", request: { ...r, status: "trouve", resolvedAs: "stock" } });
    toast(`« ${r.name} » ajouté au stock`, { label: "Voir le stock", onClick: () => navigate(links.stock()) });
  };

  const [pendingSaleRequest, setPendingSaleRequest] = useState<ProductRequest | null>(null);

  /** …ou en vente directe, quand elle répond à une demande client. */
  const resolveToSale = (r: ProductRequest) => {
    const item: Item = {
      ...blankItem(),
      name: r.name,
      brand: r.brand || "",
      size: r.size || "",
      gender: r.gender || "",
      quantity: Math.max(1, r.quantity || 1),
      cost: r.budget,
      status: "stock",
      receiveDate: today(),
      buyer: r.client,
      notes: r.notes,
    };
    setPendingSaleRequest(r);
    setSelling(item);
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

      <div className="achats-board two">
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
                <div className="hint ellipsis">
                  {[r.brand, r.size && `taille ${r.size}`, r.gender, (r.quantity || 1) > 1 && `x${r.quantity}`].filter(Boolean).join(" · ") || "Détails à préciser"}
                </div>
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
          <button className="totrow linked" onClick={() => navigate(links.livraison())}>
            <span>Livraison</span>
            <b className="num">{eur2(balance.shipping)}</b>
          </button>
          <button className="totrow linked" onClick={() => navigate(links.bilan())}>
            <span>Taxe</span>
            <b className="num">{eur2(balance.vatCollected)}</b>
          </button>
          <div className="totrow big">
            <span>Achat total</span>
            <b className="num">{eur2(balance.bought + balance.shipping + balance.vatCollected)}</b>
          </div>
        </div>
      </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Livraisons en cours</h3>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => navigate(links.arrivage())}>Voir Arrivage →</button>
        </div>
        {incomingOrders.length === 0 ? (
          <Empty glyph="⇩" title="Aucune livraison en cours">
            Les commandes passées apparaîtront ici jusqu'à leur réception dans Arrivage.
          </Empty>
        ) : (
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Commande</th>
                  <th className="r">Articles</th>
                  <th className="r">Engagé</th>
                  <th>Arrivée prévue</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {incomingOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.tag}</td>
                    <td className="r num">{o.pieces}</td>
                    <td className="r num">{eur2(o.cost)}</td>
                    <td>{o.expectedDate ? dshort(o.expectedDate) : "Date inconnue"}</td>
                    <td className="r">
                      <button className="btn sm" onClick={() => navigate(links.arrivage())}>Réceptionner →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
