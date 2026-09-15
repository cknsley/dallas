import { useEffect, useMemo, useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { PLATFORMS } from "../lib/constants";
import { costOf, qtyOf } from "../lib/calc";
import { eur2, num, today } from "../lib/format";
import { LABEL, eurLabel } from "../lib/lexicon";
import type { Item } from "../types";

/** Tout ce que le formulaire collecte, en chaînes tant que l'utilisateur saisit. */
interface SaleDraft {
  price: string;
  saleDate: string;
  platform: string;
  buyer: string;
  saleFees: string;
  packagingCost: string;
  port: string;
  extraFees: string;
}

export default function SellModal({
  item, onClose, onInvoice, onSold, initialBuyer, initialPrice,
}: {
  item: Item;
  onClose: () => void;
  onInvoice: (item: Item) => void;
  /** Prévenu après enregistrement, pour proposer la suite (voir la vente, le colis…). */
  onSold?: (item: Item) => void;
  initialBuyer?: string;
  initialBuyerUrl?: string;
  initialPrice?: number;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [makeDoc, setMakeDoc] = useState(false);
  const [d, setD] = useState<SaleDraft>({
    price: initialPrice ? String(initialPrice) : item.price ? String(item.price) : "",
    saleDate: item.saleDate || today(),
    platform: item.platform,
    buyer: initialBuyer ?? item.buyer,
    saleFees: item.saleFees ? String(item.saleFees) : "",
    packagingCost: item.packagingCost ? String(item.packagingCost) : "",
    port: item.shippingCost ? String(item.shippingCost) : "0",
    extraFees: item.extraFees ? String(item.extraFees) : "",
  });
  const set = <K extends keyof SaleDraft>(k: K, v: SaleDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const buyerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of state.clients) set.add(c.name.trim());
    for (const i of state.items) if (i.buyer.trim()) set.add(i.buyer.trim());
    return [...set];
  }, [state.clients, state.items]);

  const platforms = useMemo(
    () => [...new Set([...Object.keys(state.settings.platformFees), ...PLATFORMS, ...state.items.map((i) => i.platform).filter(Boolean)])],
    [state.items, state.settings.platformFees],
  );

  /** Taux de commission connu pour la plateforme saisie. */
  const feeRate = (platform: string): number | null => {
    const key = Object.keys(state.settings.platformFees).find(
      (k) => k.toLowerCase() === platform.trim().toLowerCase(),
    );
    return key === undefined ? null : state.settings.platformFees[key];
  };
  const currentRate = feeRate(d.platform);

  const qty = qtyOf(item);

  // La commission est toujours calculée depuis le taux défini dans les paramètres, sur le montant total encaissé.
  useEffect(() => {
    if (currentRate === null) return;
    const computed = currentRate > 0 ? ((num(d.price) * qty * currentRate) / 100).toFixed(2) : "";
    setD((x) => (x.saleFees === computed ? x : { ...x, saleFees: computed }));
  }, [d.platform, d.price, currentRate, qty]);

  /* ---- calculatrice de marge, port compris ---- */
  const buyCost = costOf(item);
  const price = num(d.price);
  const saleFees = num(d.saleFees);
  const packagingCost = num(d.packagingCost);
  const shippingCost = num(d.port);
  const extraFees = num(d.extraFees);
  const cashIn = price * qty;
  const outflow = buyCost + saleFees + packagingCost + shippingCost + extraFees;
  const margin = cashIn - outflow;

  const submit = () => {
    if (price <= 0) {
      toast("Indiquez le prix de vente");
      return;
    }
    if (!d.platform) {
      toast("Choisissez une plateforme");
      return;
    }
    if (!d.buyer.trim()) {
      toast("Indiquez le nom de l’acheteur");
      return;
    }
    const patch = {
      price,
      saleDate: d.saleDate || today(),
      platform: d.platform.trim(),
      buyer: d.buyer.trim(),
      saleFees,
      packagingCost,
      shippingPaid: 0,
      shippingCost,
      extraFees,
      status: "vendu" as const,
      delivery: item.status === "vendu" ? item.delivery : "non_payee" as const,
    };
    dispatch({ type: "patchItem", id: item.id, patch });
    const sold = { ...item, ...patch };
    onClose();
    if (makeDoc) {
      toast("Vente enregistrée");
      onInvoice(sold);
    } else if (onSold) {
      onSold(sold);
    } else {
      toast("Vente enregistrée");
    }
  };

  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="totrow">
      <span>{label}</span>
      <b className={`num ${tone ?? ""}`}>{value}</b>
    </div>
  );

  return (
    <Modal
      title={`Vendre — ${item.name || "Sans nom"}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>Enregistrer la vente</button>
        </>
      }
    >
      <div className="sale-layout">
        <div className="sale-form">
          <div className="fgrid">
            <Field label={eurLabel(qty > 1 ? `${LABEL.price} (unitaire)` : LABEL.price)}>
              <input type="number" step="0.01" value={d.price} placeholder="0,00" autoFocus onChange={(e) => set("price", e.target.value)} />
              {qty > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span className="hint" style={{ fontSize: 11, whiteSpace: "nowrap" }}>Total vente (x{qty})</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    style={{ height: 28, fontSize: 12 }}
                    value={price > 0 ? String(Math.round(price * qty * 100) / 100) : ""}
                    onChange={(e) => set("price", e.target.value ? String(num(e.target.value) / qty) : "")}
                  />
                </div>
              )}
            </Field>
            <Field label="Date de vente">
              <input type="date" value={d.saleDate} onChange={(e) => set("saleDate", e.target.value)} />
            </Field>
            <Field label="Plateforme / canal">
              <select
                value={d.platform}
                onChange={(e) => set("platform", e.target.value)}
              >
                <option value="">Choisir une plateforme</option>
                {platforms.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Nom de l’acheteur">
              <input
                type="text"
                list="dl-buyer"
                value={d.buyer}
                placeholder="Nom ou pseudo"
                onChange={(e) => set("buyer", e.target.value)}
              />
            </Field>
            <Field label={eurLabel("Port")}>
              <input type="number" min="0" step="0.01" value={d.port} placeholder="0,00" onChange={(e) => set("port", e.target.value)} />
            </Field>
            <Field label={eurLabel("Emballage")}>
              <input type="number" min="0" step="0.01" value={d.packagingCost} placeholder="0,00" onChange={(e) => set("packagingCost", e.target.value)} />
            </Field>
            <Field label={eurLabel("Frais divers")}>
              <input type="number" min="0" step="0.01" value={d.extraFees} placeholder="0,00" onChange={(e) => set("extraFees", e.target.value)} />
            </Field>
          </div>
          <datalist id="dl-buyer">
            {buyerSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
          <div className="hint" style={{ marginTop: 12 }}>
            Frais plateforme : {currentRate === null ? "aucun taux configuré" : `${currentRate} % (${eur2(saleFees)})`} · modifiables dans Paramètres.
          </div>
        </div>

        {/* ---- calculatrice ---- */}
        <aside className="sale-calc">
          <div className="sale-calc-h">Marge estimée</div>
          <Row label="Prix encaissé" value={eur2(cashIn)} />
          <Row label="Coût article" value={buyCost ? `−${eur2(buyCost)}` : eur2(0)} />
          <Row label="Commission plateforme" value={saleFees ? `−${eur2(saleFees)}` : eur2(0)} />
          <Row label="Port" value={shippingCost ? `−${eur2(shippingCost)}` : eur2(0)} />
          <Row label="Emballage" value={packagingCost ? `−${eur2(packagingCost)}` : eur2(0)} />
          <Row label="Frais divers" value={extraFees ? `−${eur2(extraFees)}` : eur2(0)} />
          <div className="totrow big">
            <span>Marge nette</span>
            <b className={`num ${margin >= 0 ? "pos" : "neg"}`}>{eur2(margin)}</b>
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={makeDoc} onChange={(e) => setMakeDoc(e.target.checked)} />
            Générer le document de vente
          </label>
        </aside>
      </div>
    </Modal>
  );
}
