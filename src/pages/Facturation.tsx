import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { caOfYear } from "../lib/calc";
import { dfr, eur2 } from "../lib/format";
import { docKindLabel, vatRegime } from "../lib/vat";
import { useQueryState } from "../lib/useQueryState";
import { useSecteur } from "../lib/useSecteur";
import { links } from "../lib/links";
import DocModal from "../modals/DocModal";
import DocPreview from "../modals/DocPreview";
import type { SalesDoc } from "../types";

export default function Facturation() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<string[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useQueryState("state", "all");
  const secteur = useSecteur();
  const [confirming, setConfirming] = useState<SalesDoc | null>(null);

  const year = new Date().getFullYear();
  const caYear = useMemo(() => caOfYear(state.items, year), [state.items, year]);
  const regime = useMemo(() => vatRegime(state.settings, caYear), [state.settings, caYear]);
  const s = state.settings;
  const previewDoc = previewId ? (state.docs.find((d) => d.id === previewId) ?? null) : null;

  /* Ouverture depuis une autre page : ?new=<itemId> ou ?doc=<id> */
  useEffect(() => {
    const nid = params.get("new");
    const did = params.get("doc");
    if (nid) {
      setCreating([nid]);
      params.delete("new");
      setParams(params, { replace: true });
    } else if (did) {
      const found = state.docs.find((d) => d.id === did);
      if (found) setPreviewId(found.id);
      params.delete("doc");
      setParams(params, { replace: true });
    }
  }, [params, setParams, state.docs]);

  // Le régime de TVA reste calculé sur l'activité entière : le seuil est légal, pas sectoriel.
  const scopedDocs = useMemo(
    () => state.docs.filter((d) => secteur.matchesLinked(d.itemIds)),
    [state.docs, secteur],
  );

  const unpaid = scopedDocs.filter((d) => !d.paid);

  const visibleDocs = [...scopedDocs]
    .filter((d) => docFilter === "all" || (docFilter === "paid" ? d.paid : !d.paid))
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <HeaderActions>
        <button className="btn ghost" onClick={() => navigate(links.reglages())}>⚙ Réglages</button>
        <button className="btn primary" onClick={() => setCreating([])}>+ Nouveau document</button>
      </HeaderActions>



      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}

      <div className="cols">
        <div className="card">
          <div className="card-h">
            <h3>Documents émis</h3>
            <div className="spacer" />
            <Segmented<string>
              value={docFilter}
              onChange={setDocFilter}
              options={[
                { value: "all", label: `Tous (${state.docs.length})` },
                { value: "unpaid", label: `Impayés (${unpaid.length})` },
                { value: "paid", label: `Payés (${state.docs.length - unpaid.length})` },
              ]}
            />
          </div>
          {visibleDocs.length === 0 ? (
            <Empty glyph="§" title={state.docs.length ? "Aucun document dans ce filtre" : "Aucun document"}>
              {state.docs.length ? (
                <button className="btn sm" onClick={() => setDocFilter("all")}>Voir tous les documents</button>
              ) : (
                <>Générez une facture ou un reçu depuis une vente, ou avec « Nouveau document ».</>
              )}
            </Empty>
          ) : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Date</th>
                    <th className="r">Total</th>
                    <th className="r">TVA</th>
                    <th>État</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleDocs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <a href="#" className="num" onClick={(e) => { e.preventDefault(); setPreviewId(d.id); }}>{d.number}</a>
                      </td>
                      <td>{docKindLabel(d.kind, s.legalStatus)}</td>
                      <td>
                        <div className="ellipsis">{d.clientName}</div>
                        {d.itemIds.length > 0 && (
                          <div className="hint">
                            {d.itemIds.length} article{d.itemIds.length > 1 ? "s" : ""} ·{" "}
                            <a href={`#${links.ventes()}`}>voir les ventes</a>
                          </div>
                        )}
                      </td>
                      <td className="num" style={{ fontSize: 12 }}>{dfr(d.date)}</td>
                      <td className="r num">{eur2(d.total)}</td>
                      <td className="r num">{d.vatSubject ? eur2(d.vatAmount) : "—"}</td>
                      <td>
                        <button
                          className={`pill ${d.paid ? "good" : "bad"}`}
                          style={{ border: 0, cursor: "pointer" }}
                          onClick={() =>
                            dispatch({
                              type: "patchDoc",
                              id: d.id,
                              patch: { paid: !d.paid, paidDate: !d.paid ? new Date().toISOString().slice(0, 10) : "" },
                            })
                          }
                        >
                          {d.paid ? "Payé" : "Impayé"}
                        </button>
                      </td>
                      <td className="r">
                        <div className="rowact">
                          <button className="iconbtn" title="Aperçu" onClick={() => setPreviewId(d.id)}>⎘</button>
                          <button className="iconbtn del" title="Supprimer" onClick={() => setConfirming(d)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <DocModal preselect={creating} onClose={() => setCreating(null)} onCreated={(d) => setPreviewId(d.id)} />
      )}
      {previewDoc && <DocPreview doc={previewDoc} onClose={() => setPreviewId(null)} />}
      {confirming && (
        <Confirm
          title="Supprimer ce document ?"
          body={<>{confirming.number} sera supprimé. La numérotation séquentielle n'est pas réattribuée.</>}
          onConfirm={() => { dispatch({ type: "removeDoc", id: confirming.id }); toast("Document supprimé"); }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
