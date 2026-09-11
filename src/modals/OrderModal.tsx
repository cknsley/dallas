import { useMemo, useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { ARTICLE_TYPES, CARRIERS } from "../lib/constants";
import { eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import { HINT, LABEL, eurLabel } from "../lib/lexicon";
import type { Item, ProductRequest } from "../types";

interface Line {
  key: string;
  name: string;
  quantity: string;
  brand: string;
  type: string;
  size: string;
  cost: string;
  estimate: string;
}

const newLine = (): Line => ({ key: uid(), name: "", quantity: "1", brand: "", type: "", size: "", cost: "", estimate: "" });

/**
 * Une commande fournisseur : plusieurs pièces achetées d'un coup, avec des frais
 * de port communs. Les articles entrent en « Arrivage » et rejoignent le stock
 * normal dès la réception.
 */
export default function OrderModal({
  onClose, onCreated, defaultSource = "", fromRequest, mode = "supplier",
}: {
  onClose: () => void;
  onCreated?: (n: number) => void;
  /** Fournisseur déjà connu : on part de lui plutôt que d'une page blanche. */
  defaultSource?: string;
  /** Demande acceptée qui pré-remplit la commande. */
  fromRequest?: ProductRequest;
  /** Un lot n'exige pas de fournisseur identifié, une commande si. */
  mode?: "lot" | "supplier";
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const [source, setSource] = useState(fromRequest?.supplier ?? defaultSource);
  const [buyDate, setBuyDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState(fromRequest?.notes ?? "");
  const [purchasePaid, setPurchasePaid] = useState(true);
  const [lines, setLines] = useState<Line[]>(
    fromRequest && fromRequest.lines.length > 0
      ? fromRequest.lines.map((l) => ({
          key: uid(),
          name: l.name,
          quantity: String(Math.max(1, l.quantity)),
          brand: l.brand,
          type: l.type,
          size: l.size,
          cost: l.targetPrice ? String(l.targetPrice) : "",
          estimate: "",
        }))
      : [newLine()],
  );

  const patch = (key: string, p: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const suggestions = useMemo(() => {
    const uniq = (k: "brand" | "type" | "size" | "source") =>
      [...new Set(state.items.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    return {
      brand: uniq("brand"),
      type: [...new Set([...ARTICLE_TYPES, ...uniq("type")])],
      size: uniq("size"),
      source: uniq("source"),
      carrier: [...new Set([...CARRIERS, ...state.items.map((i) => i.carrier).filter(Boolean)])],
    };
  }, [state.items]);

  const filled = lines.filter((l) => l.name.trim() || num(l.cost) > 0);
  const qtyOfLine = (l: Line) => Math.max(1, Math.round(num(l.quantity)) || 1);
  const goods = filled.reduce((a, l) => a + num(l.cost) * qtyOfLine(l), 0);
  const shippingTotal = num(shipping);
  const total = goods + shippingTotal;
  // Le port se répartit au prorata du prix : une pièce chère en porte la plus grosse part.
  const shareOf = (l: Line) =>
    shippingTotal === 0 ? 0 : goods > 0 ? ((num(l.cost) * qtyOfLine(l)) / goods) * shippingTotal : shippingTotal / filled.length;

  const submit = () => {
    if (filled.length === 0) {
      toast("Ajoutez au moins un article à la commande");
      return;
    }
    if (mode === "supplier" && !source.trim()) {
      toast("Indiquez le fournisseur de cette commande");
      return;
    }
    const orderId = uid();
    const now = Date.now();
    filled.forEach((l, ix) => {
      const item: Item = {
        id: uid(),
        name: l.name.trim() || "Article sans nom",
        brand: l.brand.trim(),
        type: l.type.trim(),
        size: l.size.trim(),
        source: source.trim(),
        quantity: qtyOfLine(l),
        cost: num(l.cost),
        fees: Math.round((shareOf(l) / qtyOfLine(l)) * 100) / 100,
        price: num(l.estimate),
        platform: "", buyer: "", buyerUrl: "", saleFees: 0, shippingCost: 0, shippingPaid: 0,
        status: "arrivage",
        buyDate, receiveDate: "", saleDate: "",
        delivery: "commandee", shipping: "en_preparation",
        notes: notes.trim(),
        photoId: null,
        createdAt: now + ix,
        carrier: carrier.trim(), tracking: tracking.trim(), expectedDate, shipDate: "",
        orderId,
        purchasePaid,
      };
      dispatch({ type: "upsertItem", item });
    });
    if (fromRequest) {
      dispatch({ type: "upsertRequest", request: { ...fromRequest, status: "acceptee", orderId } });
    }
    toast(`Commande enregistrée — ${filled.length} article${filled.length > 1 ? "s" : ""} en arrivage`);
    onClose();
    onCreated?.(filled.length);
  };

  return (
    <Modal
      title={fromRequest ? `Commande — ${fromRequest.supplier}` : mode === "lot" ? "Nouveau lot" : "Nouvelle commande fournisseur"}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>
            Enregistrer la commande{filled.length ? ` (${filled.length})` : ""}
          </button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">⇩</span>
        <div>
          Les articles entrent en <b>Arrivage</b> et rejoignent le stock normal dès que vous réceptionnez la
          commande, depuis Livraison → À recevoir. Les frais de port se répartissent automatiquement entre elles.
        </div>
      </div>

      <div className="fgrid">
        <Field label={mode === "lot" ? "Source (facultatif)" : "Fournisseur"}>
          <input
            type="text"
            list="dl-order-source"
            value={source}
            placeholder="Vinted, grossiste, friperie…"
            onChange={(e) => setSource(e.target.value)}
            autoFocus={!defaultSource}
          />
        </Field>
        <Field label="Date de commande">
          <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
        </Field>
        <Field label="Arrivée prévue">
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
        <Field label="Transporteur">
          <input type="text" list="dl-order-carrier" value={carrier} placeholder="Mondial Relay…" onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field label="N° de suivi">
          <input type="text" value={tracking} placeholder="Numéro de colis" onChange={(e) => setTracking(e.target.value)} />
        </Field>
        <Field label={eurLabel("Frais de port de la commande")}>
          <input type="number" step="0.01" value={shipping} placeholder="0,00" onChange={(e) => setShipping(e.target.value)} />
        </Field>
        <Field label="Règlement fournisseur">
          <select value={purchasePaid ? "paye" : "du"} onChange={(e) => setPurchasePaid(e.target.value === "paye")}>
            <option value="paye">Payée</option>
            <option value="du">À régler</option>
          </select>
        </Field>
      </div>
      <datalist id="dl-order-source">{suggestions.source.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-order-carrier">{suggestions.carrier.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-order-brand">{suggestions.brand.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-order-type">{suggestions.type.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-order-size">{suggestions.size.map((v) => <option key={v} value={v} />)}</datalist>

      <hr className="sep" />
      <div className="field"><span>Articles de la commande</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.map((l) => (
          <div className="calc-line" key={l.key}>
            <div className="calc-line-h">
              <input type="text" value={l.name} placeholder="Nom de l’article" onChange={(e) => patch(l.key, { name: e.target.value })} />
              {lines.length > 1 && (
                <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))}>✕</button>
              )}
            </div>
            <div className="calc-line-grid">
              <label><span>Quantité</span><input type="number" step="1" min="1" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} /></label>
              <label><span>Marque</span><input type="text" list="dl-order-brand" value={l.brand} onChange={(e) => patch(l.key, { brand: e.target.value })} /></label>
              <label><span>Type</span><input type="text" list="dl-order-type" value={l.type} onChange={(e) => patch(l.key, { type: e.target.value })} /></label>
              <label><span>Taille</span><input type="text" list="dl-order-size" value={l.size} onChange={(e) => patch(l.key, { size: e.target.value })} /></label>
              <label><span>{LABEL.cost}</span><input type="number" step="0.01" value={l.cost} placeholder="0,00" onChange={(e) => patch(l.key, { cost: e.target.value })} /></label>
              <label><span>{LABEL.estimate}</span><input type="number" step="0.01" value={l.estimate} placeholder={HINT.estimate} onChange={(e) => patch(l.key, { estimate: e.target.value })} /></label>
            </div>
            {shippingTotal > 0 && num(l.cost) > 0 && (
              <div className="hint num" style={{ textAlign: "right" }}>
                {LABEL.fees.toLowerCase()} réparti : {eur2(shareOf(l))} · {LABEL.totalCost.toLowerCase()} {eur2(num(l.cost) + shareOf(l))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((l) => [...l, newLine()])}>
        + Ajouter un article
      </button>

      <Field label="Notes de commande">
        <textarea rows={2} value={notes} placeholder="Numéro de commande, vendeur, remarque…" onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div>
        <div className="totrow">
          <span>{filled.reduce((a, l) => a + qtyOfLine(l), 0)} article{filled.reduce((a, l) => a + qtyOfLine(l), 0) > 1 ? "s" : ""} sur {filled.length} ligne{filled.length > 1 ? "s" : ""}</span>
          <b className="num">{eur2(goods)}</b>
        </div>
        <div className="totrow"><span>Frais de port</span><b className="num">+{eur2(shippingTotal)}</b></div>
        <div className="totrow big"><span>Total de la commande</span><b className="num">{eur2(total)}</b></div>
      </div>
    </Modal>
  );
}
