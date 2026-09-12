import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Confirm, Empty, Kpi, Segmented } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useStore } from "../../store/StoreContext";
import { marginOf, soldItems } from "../../lib/calc";
import { links } from "../../lib/links";
import { dshort, eur, num, today } from "../../lib/format";
import ReturnModal, {
  CONDITION_LABEL, emptyReturn, KIND_LABEL, RESOLUTION_LABEL, STATUS_LABEL,
} from "../../modals/ReturnModal";
import type { ReturnCase, ReturnKind } from "../../types";

type ReturnFilter = "all" | ReturnKind;

/**
 * Onglet Retours de SAV : un dossier suit tout son cycle — ouverture du litige,
 * puis résolution (remis en stock, avoir/remboursement, perte, gardé).
 */
export default function RetoursTab() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ReturnFilter>("all");
  const [editing, setEditing] = useState<ReturnCase | null>(null);
  const [creating, setCreating] = useState<ReturnKind | null>(null);
  const [confirming, setConfirming] = useState<ReturnCase | null>(null);

  const sold = useMemo(() => soldItems(state.items), [state.items]);
  const supplierItems = useMemo(() => state.items.filter((i) => i.status !== "vendu"), [state.items]);
  const visible = useMemo(
    () =>
      state.returns
        .filter((r) => filter === "all" || r.kind === filter)
        .sort((a, b) => b.openedDate.localeCompare(a.openedDate) || b.createdAt - a.createdAt),
    [state.returns, filter],
  );

  const open = state.returns.filter((r) => !["rembourse", "clos"].includes(r.status));
  const late = open.filter((r) => r.dueDate && r.dueDate < today());
  const refunds = state.returns.reduce((a, r) => a + num(r.amount), 0);
  const feesLost = state.returns.reduce((a, r) => a + num(r.feesLost), 0);

  const candidates = creating === "fournisseur" || editing?.kind === "fournisseur" ? supplierItems : sold;
  const closeModal = () => {
    setCreating(null);
    setEditing(null);
  };

  const closeReturn = (r: ReturnCase) => {
    dispatch({ type: "patchReturn", id: r.id, patch: { status: "clos", closedDate: r.closedDate || today() } });
    toast("Retour clôturé");
  };

  const restock = (r: ReturnCase) => {
    if (!r.itemId) return;
    dispatch({
      type: "patchItem",
      id: r.itemId,
      patch: {
        status: "stock", delivery: "livree", shipping: "en_preparation",
        buyer: "", buyerUrl: "", platform: "", saleDate: "", tracking: "", shipDate: "",
      },
    });
    dispatch({
      type: "patchReturn",
      id: r.id,
      patch: { status: "clos", resolution: "remis_stock", closedDate: r.closedDate || today() },
    });
    toast("Article remis en stock", { label: "Voir", onClick: () => navigate(links.stock({ status: "stock" })) });
  };

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Dossiers ouverts" value={String(open.length)} meta={late.length ? `${late.length} en retard` : "Aucun retard"} tone={late.length ? "warn" : "ok"} />
        <Kpi label="Remboursements" value={eur(refunds)} meta={`${state.returns.length} dossier${state.returns.length > 1 ? "s" : ""}`} tone="info" />
        <Kpi label="Frais perdus" value={eur(feesLost)} meta="Port, commissions, frais non récupérés" tone={feesLost ? "warn" : "ok"} />
      </div>

      <div className="toolbar">
        <Segmented<ReturnFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Tous" },
            { value: "client", label: "Clients" },
            { value: "fournisseur", label: "Fournisseurs" },
          ]}
        />
        <div className="spacer" />
        <button className="btn" onClick={() => setCreating("fournisseur")}>+ Retour fournisseur</button>
        <button className="btn primary" onClick={() => setCreating("client")}>+ Retour client</button>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Retours & refunds</h3>
          <span className="hint">{visible.length} dossier{visible.length > 1 ? "s" : ""}</span>
        </div>
        <div className="card-b">
          {visible.length === 0 ? (
            <Empty glyph="↩" title="Aucun retour suivi">
              Ouvrez un dossier depuis un litige résolu en remboursement, ou directement ici.
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ouvert</th>
                  <th>Type</th>
                  <th>Article</th>
                  <th>Contact</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                  <th className="r">Refund</th>
                  <th className="r">Frais</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const item = r.itemId ? state.items.find((i) => i.id === r.itemId) : null;
                  const isLate = !["rembourse", "clos"].includes(r.status) && r.dueDate && r.dueDate < today();
                  return (
                    <tr key={r.id}>
                      <td>{dshort(r.openedDate)}</td>
                      <td><span className={`pill ${r.kind === "client" ? "vendu" : "stock"}`}>{KIND_LABEL[r.kind]}</span></td>
                      <td>
                        <button className="linkish" onClick={() => setEditing(r)}>{r.itemName}</button>
                        <div className="hint">
                          {r.itemCondition ? CONDITION_LABEL[r.itemCondition].label : "État non précisé"}
                          {r.reason ? ` · ${r.reason}` : ` · ${RESOLUTION_LABEL[r.resolution]}`}
                          {item && r.kind === "client" ? ` · marge vente ${eur(marginOf(item))}` : ""}
                        </div>
                      </td>
                      <td>
                        <div>{r.counterparty || "—"}</div>
                        <div className="hint">{r.platform || "—"}</div>
                      </td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td className={isLate ? "bad" : ""}>{dshort(r.dueDate)}</td>
                      <td className="r num">{eur(r.amount)}</td>
                      <td className="r num">{eur(r.feesLost)}</td>
                      <td className="r">
                        <div className="rowact">
                          {r.kind === "client" && r.itemId && r.resolution === "remis_stock" && r.status !== "clos" && (
                            <button className="btn sm" onClick={() => restock(r)}>Stock</button>
                          )}
                          {r.status !== "clos" && <button className="btn sm" onClick={() => closeReturn(r)}>Clore</button>}
                          <button className="iconbtn" title="Modifier" onClick={() => setEditing(r)}>✎</button>
                          <button className="iconbtn danger" title="Supprimer" onClick={() => setConfirming(r)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ReturnModal
          initial={editing ?? emptyReturn(creating ?? "client")}
          candidates={candidates}
          isEditing={!!editing}
          onClose={closeModal}
        />
      )}
      {confirming && (
        <Confirm
          title="Supprimer ce dossier retour ?"
          body={`Le suivi « ${confirming.itemName} » sera retiré. Les ventes et le stock liés ne seront pas modifiés.`}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            dispatch({ type: "removeReturn", id: confirming.id });
            toast("Dossier retour supprimé");
          }}
        />
      )}
    </>
  );
}
