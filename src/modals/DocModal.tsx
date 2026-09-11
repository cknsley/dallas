import { useMemo, useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { caOfYear, costOf } from "../lib/calc";
import { addDays, eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import { vatDue, vatRegime } from "../lib/vat";
import type { DocKind, DocLine, SalesDoc } from "../types";

interface ManualLine extends DocLine { id: string; }

export default function DocModal({
  preselect, onClose, onCreated,
}: {
  preselect: string[];
  onClose: () => void;
  onCreated: (doc: SalesDoc) => void;
}) {
  const { state, dispatch, peekNumber } = useStore();
  const toast = useToast();
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );

  const [kind, setKind] = useState<DocKind>(regime.canInvoice ? "facture" : "recu");
  const [date, setDate] = useState(today());
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientVat, setClientVat] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect));
  const [manual, setManual] = useState<ManualLine[]>([]);
  const [query, setQuery] = useState("");

  const sellable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const already = new Set(state.docs.flatMap((d) => d.itemIds));
    return state.items
      .filter((i) => selected.has(i.id) || !already.has(i.id))
      .filter((i) => !needle || [i.name, i.brand, i.size].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [state.items, state.docs, query, selected]);

  const picked = state.items.filter((i) => selected.has(i.id));
  const lines: DocLine[] = [
    ...picked.map((i) => ({
      label: [i.brand, i.name, i.size && `taille ${i.size}`].filter(Boolean).join(" · "),
      qty: 1,
      unitPrice: i.price,
      itemId: i.id,
    })),
    ...manual.map(({ id: _id, ...l }) => ({ ...l, unitPrice: num(l.unitPrice), qty: num(l.qty) || 1 })),
  ];

  const total = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
  const cost = picked.reduce((a, i) => a + costOf(i), 0);
  const margin = total - cost;
  const vat = vatDue(regime, total, margin);
  const numbering = peekNumber(kind, date);

  const submit = () => {
    if (lines.length === 0) {
      toast("Ajoutez au moins une ligne");
      return;
    }
    if (!clientName.trim()) {
      toast("Indiquez le nom du client");
      return;
    }
    if (kind === "facture" && !regime.canInvoice) {
      toast("Une facture exige un statut professionnel");
      return;
    }
    const doc: SalesDoc = {
      id: uid(),
      kind,
      number: numbering.number,
      date,
      dueDate: addDays(date, state.settings.paymentTerms || 0),
      clientName: clientName.trim(),
      clientAddress: clientAddress.trim(),
      clientVat: clientVat.trim(),
      lines,
      itemIds: picked.map((i) => i.id),
      paid: false,
      paidDate: "",
      vatSubject: regime.subject,
      vatRate: regime.rate,
      vatScheme: regime.scheme,
      vatBase: regime.subject ? (regime.scheme === "marge" ? Math.max(0, margin) : total) : 0,
      vatAmount: vat,
      total,
      mention: regime.mention,
      notes: notes.trim(),
      createdAt: Date.now(),
    };
    dispatch({ type: "addDoc", doc, seqKey: numbering.seqKey });
    toast(`${kind === "facture" ? "Facture" : "Reçu"} ${doc.number} créé`);
    onClose();
    onCreated(doc);
  };

  return (
    <Modal
      title="Nouveau document de vente"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>Créer {numbering.number}</button>
        </>
      }
    >
      {!regime.canInvoice && (
        <div className="note warn">
          <span className="glyph">⚠</span>
          <div>
            <b>Statut particulier</b> — la facture est réservée aux vendeurs professionnels. Seul un reçu peut être
            émis. Changez de statut juridique dans les réglages si vous êtes immatriculé.
          </div>
        </div>
      )}

      <div className="fgrid">
        <Field label="Type de document">
          <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
            <option value="facture" disabled={!regime.canInvoice}>
              Facture{!regime.canInvoice ? " — indisponible" : ""}
            </option>
            <option value="recu">Reçu</option>
          </select>
        </Field>
        <Field label="Numéro">
          <input type="text" value={numbering.number} readOnly />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Client">
          <input type="text" value={clientName} placeholder="Nom ou raison sociale" onChange={(e) => setClientName(e.target.value)} />
        </Field>
        <Field label="Adresse du client" span>
          <textarea rows={2} value={clientAddress} placeholder="Adresse de facturation" onChange={(e) => setClientAddress(e.target.value)} />
        </Field>
        {regime.subject && (
          <Field label="N° TVA du client (optionnel)">
            <input type="text" value={clientVat} onChange={(e) => setClientVat(e.target.value)} />
          </Field>
        )}
      </div>

      <hr className="sep" />
      <div className="field"><span>Pièces vendues — {selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
        <input type="search" value={query} placeholder="Filtrer les pièces…" onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="picker">
        {sellable.length === 0 ? (
          <div className="empty" style={{ padding: 22 }}>Aucune pièce disponible</div>
        ) : (
          sellable.map((i) => (
            <div
              key={i.id}
              className={`prow${selected.has(i.id) ? " sel" : ""}`}
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                  return next;
                })
              }
            >
              <input type="checkbox" readOnly checked={selected.has(i.id)} tabIndex={-1} style={{ accentColor: "var(--accent)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }} className="ellipsis">{i.name || "Sans nom"}</div>
                <div className="hint">{i.brand || "—"}{i.size ? ` · ${i.size}` : ""}</div>
              </div>
              <div className="num" style={{ fontSize: 12 }}>{eur2(i.price)}</div>
            </div>
          ))
        )}
      </div>

      <div>
        <div className="field" style={{ marginBottom: 8 }}><span>Lignes libres</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {manual.map((l) => (
            <div className="mline" key={l.id}>
              <input
                type="text"
                value={l.label}
                placeholder="Désignation"
                onChange={(e) => setManual((m) => m.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
              />
              <input
                type="number"
                step="1"
                value={l.qty}
                placeholder="Qté"
                onChange={(e) => setManual((m) => m.map((x) => (x.id === l.id ? { ...x, qty: num(e.target.value) } : x)))}
              />
              <input
                type="number"
                step="0.01"
                value={l.unitPrice}
                placeholder="Prix unitaire"
                onChange={(e) => setManual((m) => m.map((x) => (x.id === l.id ? { ...x, unitPrice: num(e.target.value) } : x)))}
              />
              <button className="iconbtn del" title="Retirer" onClick={() => setManual((m) => m.filter((x) => x.id !== l.id))}>✕</button>
            </div>
          ))}
        </div>
        <button
          className="btn ghost sm"
          style={{ marginTop: 8 }}
          onClick={() => setManual((m) => [...m, { id: uid(), label: "", qty: 1, unitPrice: 0 }])}
        >
          + Ajouter une ligne
        </button>
      </div>

      <Field label="Mentions complémentaires">
        <textarea rows={2} value={notes} placeholder="Conditions, mode de règlement…" onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div>
        <div className="totrow"><span>Total {regime.subject ? "TTC" : ""}</span><b className="num">{eur2(total)}</b></div>
        {regime.subject && (
          <>
            <div className="totrow">
              <span>Base — {regime.scheme === "marge" ? "marge bénéficiaire" : "prix de vente"}</span>
              <span className="num">{eur2(regime.scheme === "marge" ? Math.max(0, margin) : total)}</span>
            </div>
            <div className="totrow"><span>dont TVA {regime.rate} %</span><b className="num">{eur2(vat)}</b></div>
          </>
        )}
        <div className="totrow big"><span>Net encaissé</span><b className="num">{eur2(total)}</b></div>
        <div className="hint">{regime.mention}</div>
      </div>
    </Modal>
  );
}
