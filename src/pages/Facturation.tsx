import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Confirm, Empty, Field, Kpi, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { caOfYear } from "../lib/calc";
import { dfr, eur, eur2, num, pct } from "../lib/format";
import { COUNTRIES, VAT_BY_COUNTRY, vatRegime } from "../lib/vat";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import DocModal from "../modals/DocModal";
import DocPreview from "../modals/DocPreview";
import type { LegalStatus, SalesDoc } from "../types";

const LEGAL: { value: LegalStatus; label: string }[] = [
  { value: "particulier", label: "Particulier" },
  { value: "micro", label: "Micro-entreprise" },
  { value: "societe", label: "Société (SARL / SAS)" },
];

export default function Facturation() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<string[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useQueryState("state", "all");
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

  const unpaid = state.docs.filter((d) => !d.paid);
  const unpaidTotal = unpaid.reduce((a, d) => a + d.total, 0);
  const vatCollected = state.docs
    .filter((d) => d.date.slice(0, 4) === String(year))
    .reduce((a, d) => a + d.vatAmount, 0);

  const visibleDocs = [...state.docs]
    .filter((d) => docFilter === "all" || (docFilter === "paid" ? d.paid : !d.paid))
    .sort((a, b) => b.createdAt - a.createdAt);

  const setSetting = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) =>
    dispatch({ type: "settings", patch: { [k]: v } as Partial<typeof s> });

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setCreating([])}>+ Nouveau document</button>
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi label={`CA ${year}`} value={eur(caYear)} meta={regime.label} to={links.ventes()} hint="Ventes" />
        <Kpi
          label={s.vatEnabled ? "Seuil de franchise" : "Facture pro"}
          value={!s.vatEnabled ? "Désactivé" : s.legalStatus === "societe" ? "—" : eur(regime.threshold)}
          meta={
            !s.vatEnabled
              ? "Activez-la ci-dessous si vous facturez avec TVA"
              : s.legalStatus === "societe"
              ? "Société assujettie dès le 1er euro"
              : regime.threshold
                ? `${pct((caYear / regime.threshold) * 100)} atteint`
                : "Aucun seuil défini"
          }
          tone={regime.alert ? (regime.alert.level === "bad" ? "warn" : "warn") : "ok"}
        />
        <Kpi
          label="TVA collectée"
          value={eur(vatCollected)}
          meta={regime.subject ? `Sur documents ${year}` : "Non assujetti"}
          to={links.bilan()}
          hint="Bilan"
        />
        <Kpi
          label="Impayés"
          value={eur(unpaidTotal)}
          meta={`${unpaid.length} document${unpaid.length > 1 ? "s" : ""} en attente`}
          tone={unpaid.length ? "warn" : "ok"}
          to={unpaid.length ? links.facturation({ state: "unpaid" }) : undefined}
          hint="Filtrer"
        />
      </div>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}

      <div className="cols two">
        <div className="card">
          <div className="card-h"><h3>Compte et facturation</h3></div>
          <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className={`mode-switch${s.vatEnabled ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={s.vatEnabled}
                onChange={(e) => setSetting("vatEnabled", e.target.checked)}
              />
              <div>
                <b>Facture pro</b>
                <div className="hint">
                  {s.vatEnabled
                    ? "TVA calculée sur les ventes, le bilan et les documents émis."
                    : "Éteint : reçus simples, aucune TVA nulle part dans l'app."}
                </div>
              </div>
            </label>

            <div className="fgrid">
              <Field label="Nom / raison sociale" span>
                <input type="text" value={s.business} placeholder="Votre nom commercial" onChange={(e) => setSetting("business", e.target.value)} />
              </Field>
              <Field label="Statut juridique">
                <select value={s.legalStatus} onChange={(e) => setSetting("legalStatus", e.target.value as LegalStatus)}>
                  {LEGAL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Pays">
                <select
                  value={s.country}
                  onChange={(e) => {
                    setSetting("country", e.target.value);
                    setSetting("vatRate", VAT_BY_COUNTRY[e.target.value] ?? 20);
                  }}
                >
                  {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </Field>
              {s.vatEnabled && (
                <>
                  <Field label="N° de TVA intracommunautaire">
                    <input type="text" value={s.vatNumber} placeholder="FR00123456789" onChange={(e) => setSetting("vatNumber", e.target.value)} />
                  </Field>
                  <Field label="Taux de TVA (%)">
                    <input type="number" step="0.1" value={s.vatRate} onChange={(e) => setSetting("vatRate", num(e.target.value))} />
                  </Field>
                  <Field label="Seuil de franchise (€)">
                    <input
                      type="number"
                      step="100"
                      value={s.threshold}
                      disabled={s.legalStatus === "societe"}
                      onChange={(e) => setSetting("threshold", num(e.target.value))}
                    />
                  </Field>
                </>
              )}
              <Field label="Délai de paiement (jours)">
                <input type="number" step="1" value={s.paymentTerms} onChange={(e) => setSetting("paymentTerms", num(e.target.value))} />
              </Field>
            </div>
            {s.vatEnabled && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.marginScheme}
                  onChange={(e) => setSetting("marginScheme", e.target.checked)}
                />
                Régime de la marge (biens d'occasion) — la TVA porte sur la marge, pas sur le prix de vente
              </label>
            )}
            {s.vatEnabled && (
              <div className={`note ${regime.subject ? "info" : "ok"}`}>
                <span className="glyph">§</span>
                <div><b>{regime.label}</b><br />{regime.mention}</div>
              </div>
            )}
            <hr className="sep" />
            <div className="fgrid">
              <Field label="Adresse" span>
                <textarea rows={2} value={s.address} onChange={(e) => setSetting("address", e.target.value)} />
              </Field>
              <Field label="E-mail">
                <input type="email" value={s.email} onChange={(e) => setSetting("email", e.target.value)} />
              </Field>
              <Field label="Téléphone">
                <input type="text" value={s.phone} onChange={(e) => setSetting("phone", e.target.value)} />
              </Field>
              <Field label="IBAN" span>
                <input type="text" value={s.iban} onChange={(e) => setSetting("iban", e.target.value)} />
              </Field>
              <Field label="Pied de page des documents" span>
                <textarea rows={2} value={s.footer} placeholder="Mentions légales, conditions de retour…" onChange={(e) => setSetting("footer", e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

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
                      <td>{d.kind === "facture" ? "Facture" : "Reçu"}</td>
                      <td>
                        <div className="ellipsis">{d.clientName}</div>
                        {d.itemIds.length > 0 && (
                          <div className="hint">
                            {d.itemIds.length} pièce{d.itemIds.length > 1 ? "s" : ""} ·{" "}
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
