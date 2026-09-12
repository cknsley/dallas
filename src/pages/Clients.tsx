import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { buildClients } from "../lib/clients";
import { groupBy, marginOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { DELIVERY_LABEL } from "../lib/constants";
import { links } from "../lib/links";
import ItemModal from "../modals/ItemModal";
import PickItemModal from "../modals/PickItemModal";
import SellModal from "../modals/SellModal";
import DocModal from "../modals/DocModal";
import DocPreview from "../modals/DocPreview";
import ClientModal from "../modals/ClientModal";
import { uid } from "../lib/id";
import type { Client } from "../lib/clients";
import type { ClientRecord, Item, SalesDoc } from "../types";

type Sort = "revenue" | "orders" | "recent";

export default function Clients() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [sort, setSort] = usePref<Sort>("clientSort", "revenue");
  const [q, setQ] = useQueryState("q");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  const [pickingForClient, setPickingForClient] = useState<Client | null>(null);
  const [sellingItem, setSellingItem] = useState<{ item: Item; client: Client } | null>(null);
  const [docForClient, setDocForClient] = useState<Client | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SalesDoc | null>(null);
  const [clientRecordModal, setClientRecordModal] = useState<{ record: ClientRecord | null; name: string } | null>(null);

  const clients = useMemo(() => buildClients(state.items, state.clients), [state.items, state.clients]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = clients.filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.platforms.join(" ").toLowerCase().includes(needle) ||
        (c.record?.email ?? "").toLowerCase().includes(needle) ||
        (c.record?.phone ?? "").toLowerCase().includes(needle),
    );
    return [...filtered].sort((a, b) =>
      sort === "orders" ? b.orders - a.orders
      : sort === "recent" ? (b.lastSale || "").localeCompare(a.lastSale || "")
      : b.revenue - a.revenue,
    );
  }, [clients, q, sort]);

  const totalRevenue = clients.reduce((a, c) => a + c.revenue, 0);
  const repeat = clients.filter((c) => c.orders > 1);
  const anonymous = state.items.filter((i) => i.status === "vendu" && !i.buyer.trim()).length;
  const best = clients[0];

  // Ce qui part le mieux auprès de ces acheteurs.
  const sold = useMemo(() => state.items.filter((i) => i.status === "vendu"), [state.items]);
  const topItems = useMemo(() => groupBy(sold, "item").slice(0, 3), [sold]);
  const topBrands = useMemo(() => groupBy(sold, "brand").slice(0, 3), [sold]);

  return (
    <>
      <HeaderActions>
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "revenue", label: "Par chiffre" },
            { value: "orders", label: "Par commandes" },
            { value: "recent", label: "Récents" },
          ]}
        />
        <input
          type="search"
          value={q}
          placeholder="Rechercher un client (nom, mail, tél)…"
          style={{ width: 240 }}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" onClick={() => setClientRecordModal({ record: null, name: "" })}>
          + Nouveau client
        </button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="Acheteurs"
          value={String(clients.length)}
          meta={anonymous ? `${anonymous} vente${anonymous > 1 ? "s" : ""} sans acheteur renseigné` : "Tous les acheteurs sont nommés"}
          tone="info"
        />
        <Kpi
          label="Clients fidèles"
          value={String(repeat.length)}
          meta={clients.length ? `${pct((repeat.length / clients.length) * 100)} ont acheté plus d'une fois` : "Aucune vente nominative"}
          tone={repeat.length ? "ok" : undefined}
        />
        <Kpi
          label="Meilleur client"
          value={best ? best.name : "—"}
          meta={best ? `${eur(best.revenue)} · ${best.orders} commande${best.orders > 1 ? "s" : ""}` : "Renseignez l'acheteur à la vente"}
        />
        <Kpi
          label="Panier moyen"
          value={eur(clients.length ? totalRevenue / clients.reduce((a, c) => a + c.orders, 0) : 0)}
          meta="Encaissé moyen par commande nominative"
        />
      </div>

      {sold.length > 0 && (
        <div className="cols two" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-h">
              <h3>Top 3 best-sellers</h3>
              <div className="spacer" />
              <span className="hint">Articles qui rapportent le plus</span>
            </div>
            <div className="card-b podium">
              {topItems.map((r, ix) => (
                <div className="podium-row" key={r.key}>
                  <span className={`podium-rank r${ix + 1}`}>{ix + 1}</span>
                  <span className="podium-name ellipsis" title={r.key}>{r.key}</span>
                  <span className="hint nowrap">{r.qty} vendu{r.qty > 1 ? "s" : ""}</span>
                  <b className="num">{eur(r.ca)}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Marques phares</h3>
              <div className="spacer" />
              <span className="hint">Par chiffre d'affaires</span>
            </div>
            <div className="card-b podium">
              {topBrands.map((r, ix) => (
                <div className="podium-row" key={r.key}>
                  <span className={`podium-rank r${ix + 1}`}>{ix + 1}</span>
                  <span className="podium-name ellipsis" title={r.key}>{r.key}</span>
                  <span className="hint nowrap">{r.qty} article{r.qty > 1 ? "s" : ""}</span>
                  <b className={`num ${r.marge >= 0 ? "pos" : "neg"}`}>{eur(r.marge)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="card">
          <Empty glyph="☻" title="Aucun acheteur enregistré">
            Ajoutez un client via le bouton « + Nouveau client » ou renseignez le champ acheteur lors d'une vente.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Base de données Clients ({clients.length})</h3>
            <div className="spacer" />
            <span className="hint">{list.length} affiché{list.length > 1 ? "s" : ""}</span>
          </div>
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Client / Acheteur</th>
                  <th>Canal</th>
                  <th className="r">Commandes</th>
                  <th className="r">Articles</th>
                  <th className="r">Encaissé</th>
                  <th className="r">Marge</th>
                  <th>Dernier achat</th>
                  <th className="r shrink" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const isOpen = open === c.key;
                  return [
                    <tr key={c.key} className="clickable" onClick={() => setOpen(isOpen ? "" : c.key)}>
                      <td>
                        <span className="linkish">{c.name}</span>
                        {c.profileUrl && (
                          <a
                            className="profile-link"
                            href={c.profileUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Ouvrir le profil sur la plateforme"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ↗
                          </a>
                        )}
                        {c.record && <span className="pill ok" style={{ marginLeft: 6, fontSize: 10 }}>Fiche DB</span>}
                        {c.orders > 1 && <span className="qty-badge">fidèle</span>}
                        {c.unpaid > 0 && <div className="hint neg num">{eur2(c.unpaid)} non payés</div>}
                      </td>
                      <td>{c.platforms.length ? c.platforms.map((p) => <span key={p} className="pill neutral">{p}</span>) : <span className="hint">—</span>}</td>
                      <td className="r num">{c.orders}</td>
                      <td className="r num">{c.pieces}</td>
                      <td className="r num">{eur2(c.revenue)}</td>
                      <td className={`r num ${c.margin >= 0 ? "pos" : "neg"}`}>{eur2(c.margin)}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{c.lastSale ? dshort(c.lastSale) : "—"}</td>
                      <td className="r shrink"><span className="hint">{isOpen ? "▲" : "▼"}</span></td>
                    </tr>,
                    isOpen && (
                      <tr key={c.key + ":detail"} className="detail-row">
                        <td colSpan={8}>
                          <div className="client-detail">
                            {/* --- COMPTE / FICHE CLIENT --- */}
                            {c.record && (
                              <div style={{ background: "var(--card-bg-2)", padding: 10, borderRadius: 8, display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <b style={{ fontSize: 13 }}>👤 Fiche Client ({c.record.name})</b>
                                  <button
                                    className="btn sm"
                                    onClick={(e) => { e.stopPropagation(); setClientRecordModal({ record: c.record, name: c.name }); }}
                                  >
                                    Modifier la fiche
                                  </button>
                                </div>
                                {c.record.contact && <div><b>Contact :</b> {c.record.contact}</div>}
                                {c.record.email && <div><b>Email :</b> <a href={`mailto:${c.record.email}`}>{c.record.email}</a></div>}
                                {c.record.phone && <div><b>Tél :</b> {c.record.phone}</div>}
                                {c.record.address && <div><b>Adresse :</b> {c.record.address}</div>}
                                {c.record.vatNumber && <div><b>N° TVA :</b> {c.record.vatNumber}</div>}
                                {c.record.notes && <div className="hint"><b>Notes :</b> {c.record.notes}</div>}
                              </div>
                            )}

                            {!c.record && (
                              <div style={{ marginBottom: 8 }}>
                                <button
                                  className="btn sm"
                                  onClick={(e) => { e.stopPropagation(); setClientRecordModal({ record: null, name: c.name }); }}
                                >
                                  + Créer la fiche client pour {c.name}
                                </button>
                              </div>
                            )}

                            <div className="hint">
                              {c.firstSale ? `Client depuis le ${dshort(c.firstSale)}` : "Fiche créée — aucune commande pour l'instant"}
                              {c.pendingDelivery > 0 && ` · ${c.pendingDelivery} commande${c.pendingDelivery > 1 ? "s" : ""} à livrer`}
                            </div>
                            {c.items.map((i) => (
                              <div className="client-line" key={i.id}>
                                <Photo id={i.photoId} />
                                <button className="linkish" onClick={(e) => { e.stopPropagation(); setEditing(i); }}>
                                  {i.name || "Sans nom"}
                                </button>
                                <span className="hint">
                                  {i.brand || "—"}{i.size ? ` · ${i.size}` : ""}
                                  {qtyOf(i) > 1 && <span className="qty-badge">×{qtyOf(i)}</span>}
                                </span>
                                <span className="spacer" />
                                <span className="pill neutral">{DELIVERY_LABEL[i.delivery]}</span>
                                <span className="num nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</span>
                                <b className="num">{eur2(revenueOf(i))}</b>
                                <b className={`num ${marginOf(i) >= 0 ? "pos" : "neg"}`}>{eur2(marginOf(i))}</b>
                              </div>
                            ))}

                            {/* --- TÂCHES CLIENT --- */}
                            {(() => {
                              const clientTodos = state.todos.filter(
                                (t) => (t.clientName || "").toLowerCase() === c.name.toLowerCase()
                              );
                              return (
                                <div className="client-tasks-section" style={{ margin: "10px 0", background: "var(--card-bg-2)", padding: 12, borderRadius: 10, border: "1px solid var(--line)" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <b style={{ fontSize: 13 }}>📋 Tâches pour {c.name} ({clientTodos.length})</b>
                                  </div>

                                  {clientTodos.length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                                      {clientTodos.map((t) => (
                                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, background: "var(--bg)", padding: "5px 10px", borderRadius: 6 }}>
                                          <input
                                            type="checkbox"
                                            checked={t.col === "termine"}
                                            style={{ accentColor: "var(--accent)" }}
                                            onChange={(e) => dispatch({ type: "patchTodo", id: t.id, patch: { col: e.target.checked ? "termine" : "faire" } })}
                                          />
                                          <span style={{ flex: 1, textDecoration: t.col === "termine" ? "line-through" : "none" }}>{t.text}</span>
                                          {t.dueDate && <span className="hint" style={{ fontSize: 11 }}>📅 {t.dueDate}</span>}
                                          <button className="iconbtn del" title="Supprimer" onClick={() => dispatch({ type: "removeTodo", id: t.id })}>✕</button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="hint" style={{ marginBottom: 8 }}>Aucune tâche spécifique pour ce client.</div>
                                  )}

                                  <input
                                    type="text"
                                    placeholder="+ Ajouter une tâche pour ce client (Entrée)..."
                                    style={{ fontSize: 12, padding: "6px 10px", width: "100%" }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const text = e.currentTarget.value.trim();
                                        if (text) {
                                          dispatch({
                                            type: "addTodo",
                                            todo: {
                                              id: uid(),
                                              text,
                                              col: "faire",
                                              order: 1,
                                              createdAt: Date.now(),
                                              clientName: c.name,
                                            },
                                          });
                                          e.currentTarget.value = "";
                                          toast(`Tâche ajoutée pour ${c.name}`);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              );
                            })()}

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                              <button
                                className="btn sm primary"
                                onClick={(e) => { e.stopPropagation(); setPickingForClient(c); }}
                              >
                                + Nouvelle vente pour {c.name}
                              </button>
                              <button
                                className="btn sm"
                                onClick={(e) => { e.stopPropagation(); setDocForClient(c); }}
                              >
                                § Générer facture / reçu
                              </button>
                              <button
                                className="btn ghost sm"
                                onClick={(e) => { e.stopPropagation(); navigate(links.ventes()); }}
                              >
                                Voir dans les ventes →
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} />}

      {pickingForClient && (
        <PickItemModal
          title={`Nouvelle vente pour « ${pickingForClient.name} »`}
          emptyHint="Ajoutez d'abord un article en stock."
          onClose={() => setPickingForClient(null)}
          onPick={(item) => {
            const client = pickingForClient;
            setPickingForClient(null);
            setSellingItem({ item, client });
          }}
        />
      )}

      {sellingItem && (
        <SellModal
          item={sellingItem.item}
          initialBuyer={sellingItem.client.name}
          initialBuyerUrl={sellingItem.client.profileUrl}
          onClose={() => setSellingItem(null)}
          onSold={(i) => toast(`Vente enregistrée pour ${i.buyer || "l'acheteur"}`)}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
        />
      )}

      {docForClient && (
        <DocModal
          preselect={docForClient.items.map((i) => i.id)}
          onClose={() => setDocForClient(null)}
          onCreated={(doc) => setPreviewDoc(doc)}
        />
      )}

      {previewDoc && (
        <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {clientRecordModal && (
        <ClientModal
          record={clientRecordModal.record}
          defaultName={clientRecordModal.name}
          onClose={() => setClientRecordModal(null)}
        />
      )}
    </>
  );
}
