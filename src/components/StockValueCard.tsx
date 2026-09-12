import { useState } from "react";
import { Link } from "react-router-dom";
import type { AppState } from "../types";
import { costOf, qtyOf } from "../lib/calc";
import { eur, num, pct } from "../lib/format";
import { links } from "../lib/links";
import { useStore } from "../store/StoreContext";
import { Field, Modal } from "./ui";
import { useToast } from "./Toast";

/**
 * Valeur théorique du stock : ce que les articles non vendus rapporteraient
 * à leur prix estimé. C'est le chiffre qui compte quand on constitue un stock,
 * bien avant la trésorerie du mois.
 */
export default function StockValueCard({
  state,
  ca = 0,
  marge = 0,
  margePct = 0,
  salesCount = 0,
  rangeLabel = "Depuis le début",
}: {
  state: AppState;
  ca?: number;
  marge?: number;
  margePct?: number;
  salesCount?: number;
  rangeLabel?: string;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [draftVault, setDraftVault] = useState(
    state.settings.vaultAmount ? String(state.settings.vaultAmount) : "0"
  );

  const vaultAmount = state.settings.vaultAmount || 0;
  const held = state.items.filter((i) => i.status !== "vendu");
  const pieces = held.reduce((a, i) => a + qtyOf(i), 0);
  // Un article sans estimation est compté à son coût : jamais de valeur inventée.
  const value = held.reduce((a, i) => a + (num(i.price) ? num(i.price) * qtyOf(i) : costOf(i)), 0);
  const estimated = held.filter((i) => num(i.price) > 0).length;
  const missing = held.length - estimated;

  return (
    <>
      <section className="cashflow stockvalue">
        <div className="cf-main">
          <div className="cf-label">Valeur théorique du stock</div>
          <div className="cf-net num">{eur(value)}</div>
          <div className="cf-sub">
            {pieces} article{pieces > 1 ? "s" : ""} non vendu{pieces > 1 ? "s" : ""}
            {missing > 0 && (
              <>
                {" · "}
                <Link to={links.stock()}>
                  {missing} sans estimation, compté{missing > 1 ? "s" : ""} à son coût
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="cf-flows">
          <Link to={links.ventes()} className="cf-flow ca" style={{ textDecoration: "none" }}>
            <span className="cf-flow-label">Chiffre d'affaires</span>
            <b className="num">{eur(ca)}</b>
            <span className="cf-flow-note">
              {salesCount} vente{salesCount > 1 ? "s" : ""} · {rangeLabel}
            </span>
          </Link>

          <Link to={links.bilan()} className={`cf-flow ${marge >= 0 ? "in" : "out"}`} style={{ textDecoration: "none" }}>
            <span className="cf-flow-label">Marge réalisée</span>
            <b className="num">{marge >= 0 ? "+" : "−"}{eur(Math.abs(marge))}</b>
            <span className="cf-flow-note">
              {ca ? `${pct(margePct)} du chiffre d'affaires` : "Aucune vente sur la période"}
            </span>
          </Link>

          <button
            type="button"
            className="cf-flow safe"
            onClick={() => {
              setDraftVault(state.settings.vaultAmount ? String(state.settings.vaultAmount) : "0");
              setShowVaultModal(true);
            }}
            style={{
              textDecoration: "none",
              textAlign: "left",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span className="cf-flow-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              🔒 Coffre-fort
            </span>
            <b className="num">{eur(vaultAmount)}</b>
            <span className="cf-flow-note">
              Argent sécurisé · Cliquer pour modifier ✎
            </span>
          </button>
        </div>
      </section>

      {showVaultModal && (
        <Modal
          title="🔒 Coffre-Fort & Trésorerie Sécurisée"
          onClose={() => setShowVaultModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowVaultModal(false)}>Annuler</button>
              <button
                className="btn primary"
                onClick={() => {
                  dispatch({
                    type: "settings",
                    patch: { vaultAmount: num(draftVault) },
                  });
                  toast(`💰 Coffre-fort mis à jour : ${eur(num(draftVault))}`);
                  setShowVaultModal(false);
                }}
              >
                Enregistrer le montant
              </button>
            </>
          }
        >
          <div className="fgrid" style={{ padding: "8px 0" }}>
            <Field label="Montant dans le Coffre-Fort (€)">
              <input
                type="number"
                step="0.01"
                value={draftVault}
                placeholder="Ex. 2500"
                onChange={(e) => setDraftVault(e.target.value)}
                autoFocus
              />
              <span className="hint" style={{ marginTop: 4 }}>
                Saisissez le montant d'argent liquide ou la trésorerie de sécurité mis de côté.
              </span>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
