import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Kpi, Photo, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useQueryState } from "../lib/useQueryState";
import { buildClients } from "../lib/clients";
import { groupBy, marginOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, eur2, pct } from "../lib/format";
import { DELIVERY_LABEL } from "../lib/constants";
import { links } from "../lib/links";
import ItemModal from "../modals/ItemModal";
import type { Item } from "../types";

type Sort = "revenue" | "orders" | "recent";

export default function Clients() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [sort, setSort] = usePref<Sort>("clientSort", "revenue");
  const [q, setQ] = useQueryState("q");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  const clients = useMemo(() => buildClients(state.items), [state.items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = clients.filter(
      (c) => !needle || c.name.toLowerCase().includes(needle) || c.platforms.join(" ").toLowerCase().includes(needle),
    );
    return [...filtered].sort((a, b) =>
      sort === "orders" ? b.orders - a.orders
      : sort === "recent" ? b.lastSale.localeCompare(a.lastSale)
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
          placeholder="Rechercher un acheteur…"
          style={{ width: 220 }}
          onChange={(e) => setQ(e.target.value)}
        />
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
                  <span className="hint nowrap">{r.qty} pièce{r.qty > 1 ? "s" : ""}</span>
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
            Le champ « Acheteur » du formulaire de vente alimente cette liste — pseudo Vinted, nom, peu importe.
            Chaque acheteur retrouvé garde son historique d'achat ici.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="card-h">
            <h3>Acheteurs</h3>
            <div className="spacer" />
            <span className="hint">{list.length} sur {clients.length}</span>
          </div>
          <div className="twrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th>Acheteur</th>
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
                        {c.orders > 1 && <span className="qty-badge">fidèle</span>}
                        {c.unpaid > 0 && <div className="hint neg num">{eur2(c.unpaid)} non payés</div>}
                      </td>
                      <td>{c.platforms.length ? c.platforms.map((p) => <span key={p} className="pill neutral">{p}</span>) : <span className="hint">—</span>}</td>
                      <td className="r num">{c.orders}</td>
                      <td className="r num">{c.pieces}</td>
                      <td className="r num">{eur2(c.revenue)}</td>
                      <td className={`r num ${c.margin >= 0 ? "pos" : "neg"}`}>{eur2(c.margin)}</td>
                      <td className="num nowrap" style={{ fontSize: 12 }}>{dshort(c.lastSale)}</td>
                      <td className="r shrink"><span className="hint">{isOpen ? "▲" : "▼"}</span></td>
                    </tr>,
                    isOpen && (
                      <tr key={c.key + ":detail"} className="detail-row">
                        <td colSpan={8}>
                          <div className="client-detail">
                            <div className="hint">
                              Client depuis le {dshort(c.firstSale)}
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
                            <button
                              className="btn ghost sm"
                              style={{ alignSelf: "flex-start" }}
                              onClick={(e) => { e.stopPropagation(); navigate(links.ventes()); }}
                            >
                              Voir dans les ventes →
                            </button>
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
    </>
  );
}
