import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import InlineField from "../components/InlineField";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { costOf, periodRange, qtyOf } from "../lib/calc";
import { dshort, eur, eur2, num, today } from "../lib/format";
import { REQUEST_LABEL } from "../lib/constants";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import OrderModal from "../modals/OrderModal";
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
  const [creating, setCreating] = useState(false);
  const [requestFor, setRequestFor] = useState<{ request: ProductRequest | null } | null>(null);
  const [ordering, setOrdering] = useState<ProductRequest | null>(null);
  const [requestFilter, setRequestFilter] = useQueryState("demandes", "ouvertes");
  const [editing, setEditing] = useState<Item | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const now = today();
  const month = useMemo(() => periodRange("month"), []);

  const incoming = useMemo(
    () =>
      state.items
        .filter((i) => i.status === "arrivage")
        .sort((a, b) => (a.expectedDate || "9999").localeCompare(b.expectedDate || "9999")),
    [state.items],
  );

  // Reçu récemment : ce qui est entré en stock dans les 30 derniers jours.
  const recentLimit = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const received = useMemo(
    () =>
      state.items
        .filter((i) => i.status !== "arrivage" && i.receiveDate && i.receiveDate >= recentLimit)
        .sort((a, b) => b.receiveDate.localeCompare(a.receiveDate)),
    [state.items, recentLimit],
  );

  const archive = useMemo(
    () =>
      state.items
        .filter((i) => i.status !== "arrivage" && (!i.receiveDate || i.receiveDate < recentLimit))
        .sort((a, b) => b.buyDate.localeCompare(a.buyDate)),
    [state.items, recentLimit],
  );

  const late = incoming.filter((i) => i.expectedDate && i.expectedDate < now);
  const inTransit = incoming.reduce((a, i) => a + costOf(i), 0);
  const monthPurchases = state.items
    .filter((i) => i.buyDate >= month.from && i.buyDate <= month.to)
    .reduce((a, i) => a + costOf(i), 0);
  const debt = state.items.filter((i) => !i.purchasePaid).reduce((a, i) => a + costOf(i), 0);

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

  const receive = (i: Item) => {
    patch(i.id, { status: "stock", receiveDate: today() });
    toast(`« ${i.name || "Sans nom"} » est en stock`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
  };

  /** Les commandes groupées encore complètes en arrivage. */
  const orderGroups = Array.from(
    incoming.reduce((m, i) => {
      if (!i.orderId) return m;
      m.set(i.orderId, (m.get(i.orderId) ?? 0) + 1);
      return m;
    }, new Map<string, number>()),
  ).filter(([, n]) => n > 1);

  const receiveOrder = (orderId: string) => {
    const pieces = incoming.filter((i) => i.orderId === orderId);
    pieces.forEach((i) => patch(i.id, { status: "stock", receiveDate: today() }));
    toast(`${pieces.length} article${pieces.length > 1 ? "s" : ""} passée${pieces.length > 1 ? "s" : ""} en stock`, {
      label: "Voir le stock",
      onClick: () => navigate(links.stock({ status: "stock" })),
    });
  };

  const row = (i: Item, mode: "arrivage" | "recu") => (
    <tr key={i.id}>
      <td className="shrink"><Photo id={i.photoId} /></td>
      <td>
        <button className="linkish ellipsis" title={i.name} onClick={() => setEditing(i)}>
          {i.name || "Sans nom"}
        </button>
        <div className="hint nowrap">
          {i.brand || "—"}{i.size ? ` · ${i.size}` : ""}
          {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
        </div>
      </td>
      <td>{i.source || <span className="hint">—</span>}</td>
      <td className="r num">{eur2(costOf(i))}</td>
      <td className="shrink">
        <span className={`pill ${i.purchasePaid ? "good" : "bad"}`}>
          {i.purchasePaid ? "Réglé" : "À régler"}
        </span>
      </td>
      {mode === "arrivage" ? (
        <>
          <td>
            <InlineField value={i.carrier} placeholder="Transporteur" onCommit={(v) => patch(i.id, { carrier: v })} width={120} />
          </td>
          <td>
            <div className="tracking-cell">
              <InlineField value={i.tracking} placeholder="Code de suivi" onCommit={(v) => patch(i.id, { tracking: v })} width={130} />
              {i.tracking && <TrackingLink carrier={i.carrier} code={i.tracking} />}
            </div>
          </td>
          <td>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <InlineField value={i.expectedDate} type="date" placeholder="" onCommit={(v) => patch(i.id, { expectedDate: v })} width={128} />
              {i.expectedDate && i.expectedDate < now && <span className="pill bad">Retard</span>}
            </span>
          </td>
          <td className="r shrink">
            <button className="btn sm" onClick={() => receive(i)}>⇩ Réceptionner</button>
          </td>
        </>
      ) : (
        <>
          <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.buyDate)}</td>
          <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.receiveDate)}</td>
          <td className="shrink">
            <span className={`pill ${i.status === "vendu" ? "vendu" : "stock"}`}>
              {i.status === "vendu" ? "Vendu" : "En stock"}
            </span>
          </td>
          <td className="r shrink">
            <div className="rowact">
              <button className="iconbtn" title="Éditer" onClick={() => setEditing(i)}>✎</button>
            </div>
          </td>
        </>
      )}
    </tr>
  );

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Nouvelle commande</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="Colis en route"
          value={String(incoming.length)}
          meta={incoming.length ? `${eur(inTransit)} en transit` : "Rien en chemin"}
          tone={incoming.length ? "info" : "ok"}
        />
        <Kpi
          label="En retard"
          value={String(late.length)}
          meta={late.length ? "Arrivée prévue dépassée" : "Aucun retard"}
          tone={late.length ? "warn" : "ok"}
        />
        <Kpi label={`Achats — ${month.label}`} value={eur(monthPurchases)} meta="Entrées de stock du mois" />
        <Kpi
          label="Dettes fournisseurs"
          value={eur(debt)}
          meta={debt > 0 ? "Achats non encore réglés" : "Tout est réglé"}
          tone={debt > 0 ? "warn" : "ok"}
          to={links.fournisseurs()}
          hint="Fournisseurs"
        />
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
                <ul className="request-lines">
                  {r.lines.slice(0, 3).map((l) => (
                    <li key={l.key}>
                      <span className="ellipsis">{l.name || "Article"}</span>
                      <span className="hint num">×{Math.max(1, l.quantity)}</span>
                    </li>
                  ))}
                  {r.lines.length > 3 && <li className="hint">+ {r.lines.length - 3} autre{r.lines.length - 3 > 1 ? "s" : ""}</li>}
                </ul>
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

      {/* ---------- en arrivage ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>En arrivage</h3>
          <div className="spacer" />
          <span className="hint">Renseignez le suivi, réceptionnez pour passer en stock</span>
        </div>
        {orderGroups.length > 0 && (
          <div className="card-b" style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 0 }}>
            {orderGroups.map(([orderId, n]) => {
              const first = incoming.find((i) => i.orderId === orderId);
              return (
                <button key={orderId} className="btn sm" onClick={() => receiveOrder(orderId)}>
                  ⇩ Réceptionner la commande {first?.source ? `« ${first.source} »` : ""} ({n})
                </button>
              );
            })}
          </div>
        )}
        {incoming.length === 0 ? (
          <Empty glyph="⇩" title="Aucun colis en route">
            Enregistrez une commande : ses articles arrivent ici avec leur suivi, puis rejoignent le stock.
          </Empty>
        ) : (
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th className="shrink" />
                  <th>Article</th>
                  <th>Fournisseur</th>
                  <th className="r">Coût</th>
                  <th className="shrink">Règlement</th>
                  <th>Transporteur</th>
                  <th>Code de suivi</th>
                  <th>Arrivée prévue</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>{incoming.map((i) => row(i, "arrivage"))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- reçu récemment ---------- */}
      {received.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>Reçu récemment</h3>
            <div className="spacer" />
            <span className="hint">Entré en stock depuis moins de 30 jours</span>
          </div>
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th className="shrink" />
                  <th>Article</th>
                  <th>Fournisseur</th>
                  <th className="r">Coût</th>
                  <th className="shrink">Règlement</th>
                  <th>Acheté</th>
                  <th>Reçu</th>
                  <th className="shrink">Statut</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>{received.map((i) => row(i, "recu"))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- archive ---------- */}
      {archive.length > 0 && (
        <div className="card">
          <button className="card-h archive-toggle" onClick={() => setShowArchive((v) => !v)}>
            <h3>Archive des achats</h3>
            <span className="hint">
              {archive.length} achat{archive.length > 1 ? "s" : ""} plus ancien{archive.length > 1 ? "s" : ""} ·{" "}
              {eur(archive.reduce((a, i) => a + costOf(i), 0))}
            </span>
            <div className="spacer" />
            <span className="hint">{showArchive ? "Masquer ▲" : "Afficher ▼"}</span>
          </button>
          {showArchive && (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th className="shrink" />
                    <th>Article</th>
                    <th>Fournisseur</th>
                    <th className="r">Coût</th>
                    <th className="shrink">Règlement</th>
                    <th>Acheté</th>
                    <th>Reçu</th>
                    <th className="shrink">Statut</th>
                    <th className="r shrink" />
                  </tr>
                </thead>
                <tbody>{archive.map((i) => row(i, "recu"))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {creating && <OrderModal onClose={() => setCreating(false)} />}
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
