import { Modal } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { dfrLong, eur2 } from "../lib/format";
import { docKindLabel } from "../lib/vat";
import type { SalesDoc } from "../types";

export default function DocPreview({ doc, onClose }: { doc: SalesDoc; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const title = docKindLabel(doc.kind, s.legalStatus);

  return (
    <Modal
      title={`${title} ${doc.number}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={() =>
              dispatch({
                type: "patchDoc",
                id: doc.id,
                patch: { paid: !doc.paid, paidDate: !doc.paid ? new Date().toISOString().slice(0, 10) : "" },
              })
            }
          >
            {doc.paid ? "Marquer impayé" : "Marquer payé"}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn primary" onClick={() => window.print()}>Imprimer / PDF</button>
        </>
      }
    >
      <div className="doc">
        <div className="dh">
          <div>
            <h2>{title}</h2>
            <div className="num" style={{ marginTop: 4 }}>{doc.number}</div>
            <div style={{ marginTop: 2 }}>Émis le {dfrLong(doc.date)}</div>
            {doc.kind === "facture" && doc.dueDate && <div>Échéance : {dfrLong(doc.dueDate)}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <span className={`stamp ${doc.paid ? "paid" : "due"}`}>{doc.paid ? "PAYÉ" : "EN ATTENTE"}</span>
          </div>
        </div>

        <div className="dh">
          <div className="party">
            <b>Émetteur</b>
            {s.business || "Votre nom"}
            {s.address ? `\n${s.address}` : ""}
            {s.email ? `\n${s.email}` : ""}
            {s.phone ? `\n${s.phone}` : ""}
            {s.vatNumber ? `\nTVA : ${s.vatNumber}` : ""}
          </div>
          <div className="party">
            <b>Client</b>
            {doc.clientName}
            {doc.clientAddress ? `\n${doc.clientAddress}` : ""}
            {doc.clientVat ? `\nTVA : ${doc.clientVat}` : ""}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="r">Qté</th>
              <th className="r">Prix unitaire</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, ix) => (
              <tr key={ix}>
                <td>{l.label || "—"}</td>
                <td className="r num">{l.qty}</td>
                <td className="r num">{eur2(l.unitPrice)}</td>
                <td className="r num">{eur2(l.unitPrice * l.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="dtot">
          <div className="totrow"><span>Total {doc.vatSubject ? "TTC" : ""}</span><b className="num">{eur2(doc.total)}</b></div>
          {doc.vatSubject && (
            <>
              <div className="totrow">
                <span>Base {doc.vatScheme === "marge" ? "(marge)" : "(prix de vente)"}</span>
                <span className="num">{eur2(doc.vatBase)}</span>
              </div>
              <div className="totrow"><span>dont TVA {doc.vatRate} %</span><span className="num">{eur2(doc.vatAmount)}</span></div>
            </>
          )}
          <div className="totrow big"><span>Net à payer</span><b className="num">{eur2(doc.total)}</b></div>
        </div>

        <div className="dfoot">
          {doc.mention}
          {doc.notes ? `\n${doc.notes}` : ""}
          {s.iban ? `\nRèglement par virement — IBAN : ${s.iban}` : ""}
          {s.footer ? `\n${s.footer}` : ""}
        </div>
      </div>
    </Modal>
  );
}
