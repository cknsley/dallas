import { useEffect, useMemo, useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { CARRIERS, DELIVERY_LABEL, PLATFORMS } from "../lib/constants";
import { costOf } from "../lib/calc";
import { eur2, num, pct, today } from "../lib/format";
import { LABEL, eurLabel } from "../lib/lexicon";
import type { Delivery, Item } from "../types";

/** Tout ce que le formulaire collecte, en chaînes tant que l'utilisateur saisit. */
interface SaleDraft {
  price: string;
  saleDate: string;
  platform: string;
  buyer: string;
  buyerUrl: string;
  saleFees: string;
  shippingPaid: string;
  shippingCost: string;
  carrier: string;
  tracking: string;
  shipDate: string;
  delivery: Delivery;
  notes: string;
}

export default function SellModal({
  item, onClose, onInvoice, onSold, initialBuyer, initialBuyerUrl, initialPrice,
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
  /** Dès que la commission est saisie à la main, on cesse de la recalculer. */
  const [feeTouched, setFeeTouched] = useState(item.saleFees > 0);
  const [d, setD] = useState<SaleDraft>({
    price: initialPrice ? String(initialPrice) : item.price ? String(item.price) : "",
    saleDate: item.saleDate || today(),
    platform: item.platform,
    buyer: initialBuyer ?? item.buyer,
    buyerUrl: initialBuyerUrl ?? item.buyerUrl,
    saleFees: item.saleFees ? String(item.saleFees) : "",
    shippingPaid: item.shippingPaid ? String(item.shippingPaid) : "",
    shippingCost: item.shippingCost ? String(item.shippingCost) : "",
    carrier: item.carrier,
    tracking: item.tracking,
    shipDate: item.shipDate,
    delivery: item.delivery,
    notes: item.notes,
  });
  const set = <K extends keyof SaleDraft>(k: K, v: SaleDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  /** Dernier envoi enregistré pour une plateforme : sert de modèle par défaut. */
  const shippingTemplate = useMemo(() => {
    const map = new Map<string, { carrier: string; shippingCost: number; shippingPaid: number; saleFees: number }>();
    for (const i of [...state.items].sort((a, b) => a.saleDate.localeCompare(b.saleDate))) {
      if (i.status !== "vendu" || !i.platform.trim()) continue;
      map.set(i.platform.trim().toLowerCase(), {
        carrier: i.carrier,
        shippingCost: i.shippingCost,
        shippingPaid: i.shippingPaid,
        saleFees: i.saleFees,
      });
    }
    return map;
  }, [state.items]);

  /** Retrouve le profil déjà enregistré pour un acheteur connu (base clients ou ventes). */
  const knownBuyers = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of state.clients) {
      if (c.name.trim() && c.profileUrl?.trim()) map.set(c.name.trim().toLowerCase(), c.profileUrl.trim());
    }
    for (const i of state.items) {
      if (i.buyer.trim() && i.buyerUrl.trim() && !map.has(i.buyer.trim().toLowerCase())) {
        map.set(i.buyer.trim().toLowerCase(), i.buyerUrl.trim());
      }
    }
    return map;
  }, [state.items, state.clients]);

  const buyerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of state.clients) set.add(c.name.trim());
    for (const i of state.items) if (i.buyer.trim()) set.add(i.buyer.trim());
    return [...set];
  }, [state.clients, state.items]);

  const platforms = useMemo(
    () => [...new Set([...PLATFORMS, ...state.items.map((i) => i.platform).filter(Boolean)])],
    [state.items],
  );
  const carriers = useMemo(
    () => [...new Set([...CARRIERS, ...state.items.map((i) => i.carrier).filter(Boolean)])],
    [state.items],
  );

  /** Taux de commission connu pour la plateforme saisie. */
  const feeRate = (platform: string): number | null => {
    const key = Object.keys(state.settings.platformFees).find(
      (k) => k.toLowerCase() === platform.trim().toLowerCase(),
    );
    return key === undefined ? null : state.settings.platformFees[key];
  };
  const currentRate = feeRate(d.platform);

  // La commission suit le prix et la plateforme, tant qu'elle n'a pas été forcée.
  useEffect(() => {
    if (feeTouched || currentRate === null) return;
    const computed = currentRate > 0 ? ((num(d.price) * currentRate) / 100).toFixed(2) : "";
    setD((x) => (x.saleFees === computed ? x : { ...x, saleFees: computed }));
  }, [d.platform, d.price, feeTouched, currentRate]);

  /* ---- calculatrice de marge, port compris ---- */
  const buyCost = costOf(item);
  const price = num(d.price);
  const shippingPaid = num(d.shippingPaid);
  const saleFees = num(d.saleFees);
  const shippingCost = num(d.shippingCost);
  const cashIn = price + shippingPaid;
  const outflow = buyCost + saleFees + shippingCost;
  const margin = cashIn - outflow;
  const engaged = buyCost + saleFees + shippingCost;

  const submit = () => {
    if (price <= 0) {
      toast("Indiquez le prix de vente");
      return;
    }
    const patch = {
      price,
      saleDate: d.saleDate || today(),
      platform: d.platform.trim(),
      buyer: d.buyer.trim(),
      buyerUrl: d.buyerUrl.trim(),
      saleFees,
      shippingPaid,
      shippingCost,
      carrier: d.carrier.trim(),
      tracking: d.tracking.trim(),
      shipDate: d.shipDate,
      delivery: d.delivery,
      notes: d.notes.trim(),
      status: "vendu" as const,
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
            <Field label={eurLabel(LABEL.price)}>
              <input type="number" step="0.01" value={d.price} placeholder="0,00" autoFocus onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Date de vente">
              <input type="date" value={d.saleDate} onChange={(e) => set("saleDate", e.target.value)} />
            </Field>
            <Field label="Plateforme / canal">
              <input
                type="text"
                list="dl-platform"
                value={d.platform}
                placeholder="Vinted, main propre…"
                onChange={(e) => {
                  const value = e.target.value;
                  const tpl = shippingTemplate.get(value.trim().toLowerCase());
                  setD((x) => ({
                    ...x,
                    platform: value,
                    // On ne remplit que ce qui est encore vide : jamais d'écrasement d'une saisie.
                    carrier: x.carrier || (tpl?.carrier ?? ""),
                    shippingCost: x.shippingCost || (tpl?.shippingCost ? String(tpl.shippingCost) : ""),
                    shippingPaid: x.shippingPaid || (tpl?.shippingPaid ? String(tpl.shippingPaid) : ""),
                    saleFees: x.saleFees || (tpl?.saleFees ? String(tpl.saleFees) : ""),
                  }));
                }}
              />
            </Field>
            <Field label="Acheteur">
              <input
                type="text"
                list="dl-buyer"
                value={d.buyer}
                placeholder="Pseudo ou nom"
                onChange={(e) => {
                  const value = e.target.value;
                  const url = knownBuyers.get(value.trim().toLowerCase());
                  setD((x) => ({ ...x, buyer: value, buyerUrl: x.buyerUrl || (url ?? "") }));
                }}
              />
            </Field>
            <Field label="Lien du profil">
              <input type="url" value={d.buyerUrl} placeholder="https://vinted.fr/member/…" onChange={(e) => set("buyerUrl", e.target.value)} />
            </Field>
          </div>
          <datalist id="dl-platform">{platforms.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="dl-buyer">
            {buyerSuggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
          <datalist id="dl-carrier">{carriers.map((v) => <option key={v} value={v} />)}</datalist>

          <hr className="sep" />
          <div className="field"><span>{LABEL.saleCosts} et livraison</span></div>
          <div className="fgrid">
            <Field label={currentRate !== null && !feeTouched ? `${LABEL.saleFees} (${currentRate} %)` : eurLabel(LABEL.saleFees)}>
              <input
                type="number"
                step="0.01"
                value={d.saleFees}
                placeholder="0,00"
                onChange={(e) => { setFeeTouched(true); set("saleFees", e.target.value); }}
              />
            </Field>
            <Field label={eurLabel(LABEL.shippingPaid)}>
              <input type="number" step="0.01" value={d.shippingPaid} placeholder="0,00" onChange={(e) => set("shippingPaid", e.target.value)} />
            </Field>
            <Field label={eurLabel(LABEL.shippingCost)}>
              <input type="number" step="0.01" value={d.shippingCost} placeholder="0,00" onChange={(e) => set("shippingCost", e.target.value)} />
            </Field>
          </div>

          <hr className="sep" />
          <div className="fgrid">
            <Field label="Transporteur">
              <input type="text" list="dl-carrier" value={d.carrier} placeholder="Mondial Relay…" onChange={(e) => set("carrier", e.target.value)} />
            </Field>
            <Field label="N° de suivi">
              <input type="text" value={d.tracking} placeholder="Numéro de colis" onChange={(e) => set("tracking", e.target.value)} />
            </Field>
            <Field label="Date d'expédition">
              <input type="date" value={d.shipDate} onChange={(e) => set("shipDate", e.target.value)} />
            </Field>
            <Field label="État de la livraison">
              <select value={d.delivery} onChange={(e) => set("delivery", e.target.value as Delivery)}>
                {Object.entries(DELIVERY_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes sur la vente">
            <textarea rows={2} value={d.notes} placeholder="Négociation, retour, remarque acheteur…" onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        {/* ---- calculatrice ---- */}
        <aside className="sale-calc">
          <div className="sale-calc-h">Calcul de la marge</div>
          <Row label={LABEL.price} value={eur2(price)} />
          <Row label={LABEL.shippingPaid} value={shippingPaid ? `+${eur2(shippingPaid)}` : eur2(0)} />
          <div className="totrow sub"><span>Total encaissé</span><b className="num">{eur2(cashIn)}</b></div>
          <hr className="sep" />
          <Row label={LABEL.cost} value={item.cost ? `−${eur2(num(item.cost))}` : eur2(0)} />
          <Row label={LABEL.fees} value={item.fees ? `−${eur2(num(item.fees))}` : eur2(0)} />
          <Row label={LABEL.saleFees} value={saleFees ? `−${eur2(saleFees)}` : eur2(0)} />
          <Row label={LABEL.shippingCost} value={shippingCost ? `−${eur2(shippingCost)}` : eur2(0)} />
          <div className="totrow sub"><span>Total dépensé</span><b className="num">{eur2(outflow)}</b></div>
          <div className="totrow"><span>Versé par la plateforme</span><b className="num">{eur2(cashIn - saleFees - shippingCost)}</b></div>
          <div className="totrow big">
            <span>Marge nette</span>
            <b className={`num ${margin >= 0 ? "pos" : "neg"}`}>{eur2(margin)}</b>
          </div>
          <div className="sale-calc-foot">
            ROI {pct(engaged ? (margin / engaged) * 100 : 0)} · marge {pct(cashIn ? (margin / cashIn) * 100 : 0)} de l'encaissé
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
