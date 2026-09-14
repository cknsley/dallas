import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Mail, Phone, MapPin, Pencil, Plus, ShoppingCart, FileText } from "lucide-react";
import { HeaderActions } from "../components/Layout";
import { Empty, Modal, RangePicker, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { useDateRange } from "../lib/useDateRange";
import { useQueryState } from "../lib/useQueryState";
import { useSecteur } from "../lib/useSecteur";
import { buildClients } from "../lib/clients";
import { marginOf, qtyOf, revenueOf } from "../lib/calc";
import { dshort, eur, pct } from "../lib/format";
import { links } from "../lib/links";
import ItemModal from "../modals/ItemModal";
import PickItemModal from "../modals/PickItemModal";
import SellModal from "../modals/SellModal";
import DocModal from "../modals/DocModal";
import DocPreview from "../modals/DocPreview";
import ClientModal from "../modals/ClientModal";
import type { Client } from "../lib/clients";
import type { ClientRecord, Item, SalesDoc } from "../types";

type Sort = "ltv" | "ca" | "orders" | "recent" | "margin" | "basket" | "name";

const SORT_LABELS: Record<Sort, string> = {
  ltv: "LTV la plus élevée",
  ca: "CA sur la période",
  margin: "Marge dégagée",
  orders: "Nombre de commandes",
  basket: "Panier moyen",
  recent: "Achat le plus récent",
  name: "Nom (A → Z)",
};

export default function Clients() {
  const { state } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const secteur = useSecteur();
  const { range, from: dateFrom, to: dateTo, setRange } = useDateRange("clients");

  const [sort, setSort] = usePref<Sort>("clientSort", "ltv");
  const [q, setQ] = useQueryState("q");
  const [ficheKey, setFicheKey] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [pickingForClient, setPickingForClient] = useState<Client | null>(null);
  const [sellingItem, setSellingItem] = useState<{ item: Item; client: Client } | null>(null);
  const [docForClient, setDocForClient] = useState<Client | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SalesDoc | null>(null);
  const [clientRecordModal, setClientRecordModal] = useState<{ record: ClientRecord | null; name: string } | null>(null);

  const clients = useMemo(
    () => buildClients(secteur.items, state.clients).map((c) => ({
      ...c,
      // Le CA ne compte que les ventes de la plage choisie ; la LTV reste sur toute la relation.
      periodCa: c.items
        .filter((i) => i.saleDate >= range.from && i.saleDate <= range.to)
        .reduce((a, i) => a + revenueOf(i), 0),
    })),
    [secteur.items, state.clients, range],
  );

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
    const basket = (c: Client) => (c.orders > 0 ? c.revenue / c.orders : 0);
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "ca": return b.periodCa - a.periodCa;
        case "orders": return b.orders - a.orders;
        case "margin": return b.margin - a.margin;
        case "basket": return basket(b) - basket(a);
        case "recent": return (b.lastSale || "").localeCompare(a.lastSale || "");
        case "name": return a.name.localeCompare(b.name);
        default: return b.revenue - a.revenue;
      }
    });
  }, [clients, q, sort]);

  const fiche = clients.find((c) => c.key === ficheKey) ?? null;

  /* ── Indicateurs ── */
  const buyers = clients.filter((c) => c.orders > 0);
  const totalLtv = buyers.reduce((a, c) => a + c.revenue, 0);
  const avgLtv = buyers.length ? totalLtv / buyers.length : 0;
  const repeat = buyers.filter((c) => c.orders > 1);
  const periodBuyers = clients.filter((c) => c.periodCa > 0);
  const periodCa = periodBuyers.reduce((a, c) => a + c.periodCa, 0);
  const anonymous = secteur.items.filter((i) => i.status === "vendu" && !i.buyer.trim()).length;

  return (
    <>
      <HeaderActions>
        <RangePicker from={dateFrom} to={dateTo} onChange={setRange} />
        <input
          type="search"
          value={q}
          placeholder="Rechercher un client…"
          style={{ width: 200, height: 32 }}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" style={{ height: 32 }} onClick={() => setClientRecordModal({ record: null, name: "" })}>
          <Plus size={14} /> Nouveau client
        </button>
      </HeaderActions>

      <div className="perf-kpis">
        <div className="perf-kpi">
          <span className="lbl">Clients</span>
          <b className="val">{clients.length}</b>
          <span className="meta">
            {buyers.length} acheteur(s){anonymous ? ` · ${anonymous} vente(s) anonyme(s)` : ""}
          </span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">LTV moyenne</span>
          <b className="val">{eur(avgLtv)}</b>
          <span className="meta">Encaissé moyen sur toute la relation</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">Taux de réachat</span>
          <b className={`val ${repeat.length ? "pos" : ""}`}>
            {pct(buyers.length ? (repeat.length / buyers.length) * 100 : 0)}
          </b>
          <span className="meta">{repeat.length} client(s) revenus au moins deux fois</span>
        </div>
        <div className="perf-kpi">
          <span className="lbl">CA moyen</span>
          <b className="val">{eur(periodBuyers.length ? periodCa / periodBuyers.length : 0)}</b>
          <span className="meta">Par client actif · {range.label}</span>
        </div>
      </div>

      <Section
        title={`Fichier clients (${list.length})`}
        right={
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: "auto" }}>
            {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
              <option key={k} value={k}>Trier : {SORT_LABELS[k]}</option>
            ))}
          </select>
        }
      >
        <div className="card-b">
          {list.length === 0 ? (
            <Empty glyph="👥" title="Aucun client">
              {q ? "Aucun client ne correspond à cette recherche." : "Créez une fiche ou renseignez l'acheteur lors d'une vente."}
            </Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Canal</th>
                    <th className="r">CA période</th>
                    <th className="r">LTV</th>
                    <th className="r">Marge</th>
                    <th className="r">Commandes</th>
                    <th className="r">Panier moyen</th>
                    <th className="r">Dernier achat</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.key} style={{ cursor: "pointer" }} onClick={() => setFicheKey(c.key)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div className="hint" style={{ fontSize: 11 }}>
                          {c.record?.email || c.record?.phone || (c.orders > 1 ? "Client fidèle" : "Fiche à compléter")}
                        </div>
                      </td>
                      <td>
                        {c.platforms.length ? (
                          <span className="pill ghost" style={{ fontSize: 11 }}>{c.platforms[0]}</span>
                        ) : <span className="hint">—</span>}
                      </td>
                      <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(c.periodCa)}</td>
                      <td className="r num" style={{ fontWeight: 600 }}>{eur(c.revenue)}</td>
                      <td className={`r num ${c.margin >= 0 ? "pos" : "neg"}`}>{eur(c.margin)}</td>
                      <td className="r num">{c.orders}</td>
                      <td className="r num">{eur(c.orders ? c.revenue / c.orders : 0)}</td>
                      <td className="r num nowrap">{c.lastSale ? dshort(c.lastSale) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {fiche && (
        <FicheClient
          client={fiche}
          onClose={() => setFicheKey("")}
          onEdit={() => setClientRecordModal({ record: fiche.record, name: fiche.name })}
          onNewSale={() => { setFicheKey(""); setPickingForClient(fiche); }}
          onInvoice={() => { setFicheKey(""); setDocForClient(fiche); }}
          onOpenItem={(i) => { setFicheKey(""); setEditing(i); }}
        />
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

      {previewDoc && <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />}

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

/** Fiche client : identité, valeur sur la durée et historique d'achat. */
function FicheClient({
  client, onClose, onEdit, onNewSale, onInvoice, onOpenItem,
}: {
  client: Client;
  onClose: () => void;
  onEdit: () => void;
  onNewSale: () => void;
  onInvoice: () => void;
  onOpenItem: (i: Item) => void;
}) {
  const r = client.record;
  const basket = client.orders ? client.revenue / client.orders : 0;
  const margePct = client.revenue > 0 ? (client.margin / client.revenue) * 100 : 0;
  // Ancienneté de la relation, utile pour juger la fréquence d'achat.
  const days = client.firstSale
    ? Math.max(1, Math.round((Date.now() - new Date(client.firstSale).getTime()) / 86400000))
    : 0;

  return (
    <Modal
      title={client.name}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onEdit}><Pencil size={14} /> Modifier la fiche</button>
          {client.items.length > 0 && (
            <button className="btn" onClick={onInvoice}><FileText size={14} /> Facturer</button>
          )}
          <button className="btn primary" onClick={onNewSale}><ShoppingCart size={14} /> Nouvelle vente</button>
        </>
      }
    >
      <div className="modal-b">
        {/* Valeur du client sur toute la relation */}
        <div className="perf-kpis">
          <div className="perf-kpi">
            <span className="lbl">LTV</span>
            <b className="val">{eur(client.revenue)}</b>
            <span className="meta">{client.orders} commande(s) · {client.pieces} pièce(s)</span>
          </div>
          <div className="perf-kpi">
            <span className="lbl">Marge dégagée</span>
            <b className={`val ${client.margin >= 0 ? "pos" : "neg"}`}>{eur(client.margin)}</b>
            <span className="meta">{pct(margePct)} de son chiffre</span>
          </div>
          <div className="perf-kpi">
            <span className="lbl">Panier moyen</span>
            <b className="val">{eur(basket)}</b>
            <span className="meta">{days ? `Client depuis ${days} jour(s)` : "Pas encore d'achat"}</span>
          </div>
        </div>

        {/* Coordonnées */}
        <div className="fiche-contact">
          {client.platforms.length > 0 && (
            <span className="pill ghost">{client.platforms.join(" · ")}</span>
          )}
          {r?.email && <span><Mail size={13} /> {r.email}</span>}
          {r?.phone && <span><Phone size={13} /> {r.phone}</span>}
          {r?.address && <span><MapPin size={13} /> {r.address}</span>}
          {client.profileUrl && (
            <a href={client.profileUrl} target="_blank" rel="noreferrer" className="linkish">
              <ExternalLink size={13} /> Profil
            </a>
          )}
          {!r?.email && !r?.phone && !r?.address && !client.profileUrl && (
            <span className="hint">Aucune coordonnée — complétez la fiche pour les retrouver ici.</span>
          )}
        </div>

        {r?.notes && <div className="note info" style={{ fontSize: 12.5 }}>{r.notes}</div>}

        {client.unpaid > 0 && (
          <div className="note warn" style={{ fontSize: 12.5 }}>
            {eur(client.unpaid)} encore à encaisser sur ce client.
          </div>
        )}

        {/* Historique d'achat */}
        <div>
          <div className="nav-group-label" style={{ marginBottom: 6 }}>Historique d'achat</div>
          {client.items.length === 0 ? (
            <Empty glyph="🧾" title="Aucun achat">Ce client n'a pas encore acheté.</Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Date</th>
                    <th>Canal</th>
                    <th className="r">Prix</th>
                    <th className="r">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {client.items.map((i) => (
                    <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => onOpenItem(i)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{i.name || "Sans nom"}</div>
                        <div className="hint" style={{ fontSize: 11 }}>
                          {i.brand || "—"}{i.size ? ` · ${i.size}` : ""}{qtyOf(i) > 1 ? ` · ×${qtyOf(i)}` : ""}
                        </div>
                      </td>
                      <td className="nowrap" style={{ fontSize: 12 }}>{dshort(i.saleDate)}</td>
                      <td><span className="pill ghost" style={{ fontSize: 11 }}>{i.platform || "Direct"}</span></td>
                      <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur(revenueOf(i))}</td>
                      <td className={`r num ${marginOf(i) >= 0 ? "pos" : "neg"}`}>{eur(marginOf(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
