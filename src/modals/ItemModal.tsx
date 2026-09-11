import { useMemo, useRef, useState } from "react";
import { Field, Modal, Photo, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { compressImage, deletePhoto, savePhoto } from "../store/photos";
import { ARTICLE_TYPES, PLATFORMS, STATUS_LABEL } from "../lib/constants";
import { eur2, num, pct, today } from "../lib/format";
import { uid } from "../lib/id";
import { HINT, LABEL, eurLabel } from "../lib/lexicon";
import type { Item, ItemStatus } from "../types";

export const blankItem = (): Item => ({
  id: uid(),
  name: "", brand: "", type: "", size: "", source: "",
  quantity: 1, cost: 0, fees: 0, price: 0,
  platform: "", buyer: "", buyerUrl: "", saleFees: 0, shippingCost: 0, shippingPaid: 0,
  status: "arrivage",
  buyDate: today(), receiveDate: "", saleDate: "",
  delivery: "commandee", shipping: "en_preparation", orderId: "", purchasePaid: true,
  notes: "", photoId: null,
  createdAt: Date.now(),
  carrier: "", tracking: "", expectedDate: "", shipDate: "",
});

/** Les montants restent des chaînes le temps de la saisie. */
type MoneyKey = "cost" | "fees" | "price" | "saleFees" | "shippingPaid" | "shippingCost";
type Draft = Omit<Item, MoneyKey | "quantity"> & Record<MoneyKey, string> & { quantity: string };

const toDraft = (i: Item): Draft => ({
  ...i,
  quantity: String(Math.max(1, i.quantity || 1)),
  cost: i.cost ? String(i.cost) : "",
  fees: i.fees ? String(i.fees) : "",
  price: i.price ? String(i.price) : "",
  saleFees: i.saleFees ? String(i.saleFees) : "",
  shippingPaid: i.shippingPaid ? String(i.shippingPaid) : "",
  shippingCost: i.shippingCost ? String(i.shippingCost) : "",
});

export default function ItemModal({
  item, onClose, onDelete, onSell,
}: {
  item: Item | null;
  onClose: () => void;
  onDelete?: (i: Item) => void;
  /** Passer en Livraison n'est pas un choix de statut : c'est une vente à enregistrer. */
  onSell?: (i: Item) => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const isNew = item === null;
  const [draft, setDraft] = useState<Draft>(() => toDraft(item ?? blankItem()));
  const [pending, setPending] = useState<Blob | null>(null);
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const suggestions = useMemo(() => {
    const uniq = (k: "brand" | "type" | "size" | "source" | "platform") =>
      [...new Set(state.items.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    return {
      brand: uniq("brand"),
      type: [...new Set([...ARTICLE_TYPES, ...uniq("type")])],
      size: uniq("size"),
      source: uniq("source"),
      platform: [...new Set([...PLATFORMS, ...uniq("platform")])],
    };
  }, [state.items]);

  const isSold = draft.status === "vendu";
  /** Version « Item » du brouillon, pour la passer au formulaire de vente. */
  const draftToItem = (): Item => ({
    ...draft,
    quantity: Math.max(1, Math.round(num(draft.quantity)) || 1),
    cost: num(draft.cost),
    fees: num(draft.fees),
    price: num(draft.price),
    saleFees: num(draft.saleFees),
    shippingPaid: num(draft.shippingPaid),
    shippingCost: num(draft.shippingCost),
  });

  const qty = Math.max(1, Math.round(num(draft.quantity)) || 1);
  const totalCost = (num(draft.cost) + num(draft.fees)) * qty;
  const price = num(draft.price);
  const saleCosts = isSold ? num(draft.saleFees) + num(draft.shippingCost) : 0;
  const cashIn = (isSold ? price + num(draft.shippingPaid) / qty : price) * qty;
  const outflow = totalCost + saleCosts;
  const marge = cashIn - outflow;

  const pickPhoto = async (file: File) => {
    try {
      const blob = await compressImage(file);
      setPending(blob);
      setPendingURL((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setCleared(false);
    } catch {
      toast("Image illisible");
    }
  };

  const persist = async (): Promise<Item | null> => {
    const name = draft.name.trim();
    if (!name) {
      toast("Donnez un nom à l’article");
      return null;
    }
    let photoId = draft.photoId;
    if (cleared && photoId) {
      await deletePhoto(photoId);
      photoId = null;
    }
    if (pending) {
      photoId = photoId ?? uid();
      await savePhoto(photoId, pending);
    }
    const next: Item = {
      ...draft,
      name,
      brand: draft.brand.trim(),
      type: draft.type.trim(),
      size: draft.size.trim(),
      source: draft.source.trim(),
      notes: draft.notes.trim(),
      quantity: qty,
      cost: num(draft.cost),
      fees: num(draft.fees),
      price: num(draft.price),
      saleFees: num(draft.saleFees),
      shippingPaid: num(draft.shippingPaid),
      shippingCost: num(draft.shippingCost),
      photoId,
      saleDate: draft.status === "vendu" && !draft.saleDate ? today() : draft.saleDate,
      receiveDate: draft.status !== "arrivage" && !draft.receiveDate ? today() : draft.receiveDate,
    };
    dispatch({ type: "upsertItem", item: next });
    return next;
  };

  const submit = async () => {
    const saved = await persist();
    if (!saved) return;
    toast(isNew ? "Article ajouté" : "Modifications enregistrées");
    onClose();
  };

  /** Enregistre la fiche puis passe la main au formulaire de vente. */
  const goToSale = async () => {
    const saved = await persist();
    if (!saved) return;
    onClose();
    onSell?.(saved);
  };

  return (
    <Modal
      title={isNew ? "Nouvel article" : "Éditer l’article"}
      onClose={onClose}
      footer={
        <>
          {!isNew && onDelete && item && (
            <>
              <button className="btn danger" onClick={() => { onDelete(item); onClose(); }}>
                Supprimer
              </button>
              <div className="spacer" />
            </>
          )}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={() => void submit()}>
            {isNew ? "Ajouter l’article" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="fgrid">
        <Field label="Nom de l’article" span>
          <input
            type="text"
            value={draft.name}
            placeholder="Ex. Veste Harrington bordeaux"
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Marque">
          <input type="text" list="dl-brand" value={draft.brand} placeholder="Ex. Carhartt" onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Type d'article">
          <input type="text" list="dl-type" value={draft.type} placeholder="Ex. Veste" onChange={(e) => set("type", e.target.value)} />
        </Field>
        <Field label="Quantité">
          <input
            type="number"
            step="1"
            min="1"
            value={draft.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field label="Taille">
          <input type="text" list="dl-size" value={draft.size} placeholder="Ex. M · 42 · 10,5" onChange={(e) => set("size", e.target.value)} />
        </Field>
        <Field label="Source">
          <input type="text" list="dl-source" value={draft.source} placeholder="Ex. Vinted, friperie, grossiste" onChange={(e) => set("source", e.target.value)} />
        </Field>
      </div>
      <datalist id="dl-brand">{suggestions.brand.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-type">{suggestions.type.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-size">{suggestions.size.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-source">{suggestions.source.map((v) => <option key={v} value={v} />)}</datalist>
      <hr className="sep" />
      <Field label="Photo">
        <div
          className="dropzone"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void pickPhoto(f);
          }}
        >
          {pendingURL ? (
            <img src={pendingURL} alt="" />
          ) : cleared || !draft.photoId ? (
            <div className="thumb placeholder" style={{ width: 62, height: 78, fontSize: 22 }}>◫</div>
          ) : (
            <Photo id={draft.photoId} className="thumb" />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Ajouter une photo</div>
            <div className="hint">Glissez un fichier ou cliquez — l'image est redimensionnée automatiquement.</div>
          </div>
          {(pendingURL || (draft.photoId && !cleared)) && (
            <button
              type="button"
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                setPending(null);
                setPendingURL((old) => { if (old) URL.revokeObjectURL(old); return null; });
                setCleared(true);
              }}
            >
              Retirer
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
            e.target.value = "";
          }}
        />
      </Field>

      <hr className="sep" />
      <div className="fgrid">
        <Field label={eurLabel(LABEL.cost)}>
          <input type="number" step="0.01" value={draft.cost} placeholder="0,00" onChange={(e) => set("cost", e.target.value)} />
        </Field>
        <Field label={eurLabel(LABEL.fees)}>
          <input type="number" step="0.01" value={draft.fees} placeholder={HINT.fees} onChange={(e) => set("fees", e.target.value)} />
        </Field>
        <Field label={eurLabel(isSold ? LABEL.price : LABEL.estimate)}>
          <input
            type="number"
            step="0.01"
            value={draft.price}
            placeholder={isSold ? "0,00" : HINT.estimate}
            readOnly={isSold}
            title={isSold ? "Le prix réel se modifie depuis le formulaire de vente" : undefined}
            onChange={(e) => set("price", e.target.value)}
          />
        </Field>
      </div>

      {isSold && (
        <>
      <div className="field"><span>Vente</span></div>
      <div className="fgrid">
        <Field label="Plateforme / canal">
          <input type="text" list="dl-platform" value={draft.platform} placeholder="Vinted, main propre…" onChange={(e) => set("platform", e.target.value)} />
        </Field>
        <Field label="Acheteur">
          <input type="text" value={draft.buyer} placeholder="Pseudo ou nom" onChange={(e) => set("buyer", e.target.value)} />
        </Field>
        <Field label={eurLabel(LABEL.saleFees)}>
          <input type="number" step="0.01" value={draft.saleFees} placeholder="0,00" onChange={(e) => set("saleFees", e.target.value)} />
        </Field>
        <Field label={eurLabel(LABEL.shippingPaid)}>
          <input type="number" step="0.01" value={draft.shippingPaid} placeholder="0,00" onChange={(e) => set("shippingPaid", e.target.value)} />
        </Field>
        <Field label={eurLabel(LABEL.shippingCost)}>
          <input type="number" step="0.01" value={draft.shippingCost} placeholder="0,00" onChange={(e) => set("shippingCost", e.target.value)} />
        </Field>
      </div>
      <datalist id="dl-platform">{suggestions.platform.map((v) => <option key={v} value={v} />)}</datalist>
        </>
      )}
      <div className="note info">
        <span className="glyph">≡</span>
        <div>
          {!price ? (
            <>{LABEL.totalCost} <b className="num">{eur2(totalCost)}</b> — donnez une {LABEL.estimate.toLowerCase()} pour voir la marge.</>
          ) : isSold ? (
            <>
              Marge nette <b className="num">{eur2(marge)}</b> · ROI <b className="num">{pct(outflow ? (marge / outflow) * 100 : 0)}</b>
              <br />
              {eur2(cashIn)} encaissés, {eur2(outflow)} dépensés ({LABEL.totalCost.toLowerCase()} {eur2(totalCost)} + {LABEL.saleCosts.toLowerCase()} {eur2(saleCosts)})
            </>
          ) : (
            <>
              Marge estimée <b className="num">{eur2(marge)}</b> · ROI <b className="num">{pct(totalCost ? (marge / totalCost) * 100 : 0)}</b> ·
              {qty > 1 ? ` ${qty} × ${eur2(price)}` : ` revente à ${eur2(price)}`} pour un {LABEL.totalCost.toLowerCase()} de {eur2(totalCost)}
            </>
          )}
        </div>
      </div>

      <hr className="sep" />
      <div className="field">
        <span>Statut</span>
        <div className="status-row">
          {isSold ? (
            <span className="pill vendu">{STATUS_LABEL.vendu}</span>
          ) : (
            <Segmented<ItemStatus>
              value={draft.status}
              onChange={(s) => set("status", s)}
              options={[
                { value: "arrivage", label: STATUS_LABEL.arrivage },
                { value: "stock", label: STATUS_LABEL.stock },
              ]}
            />
          )}
          <button
            type="button"
            className={isSold ? "btn sm" : "btn primary"}
            disabled={!onSell}
            onClick={isSold ? () => { onClose(); onSell?.(draftToItem()); } : goToSale}
          >
            {isSold ? "Modifier la vente" : "€ Vendre…"}
          </button>
        </div>
        <div className="hint">
          {isSold
            ? "Prix, canal, frais et suivi se modifient depuis le formulaire de vente."
            : "Le passage en Livraison se fait par le bouton Vendre, qui recueille le prix, le canal, les frais et le suivi."}
        </div>
      </div>

      <div className="fgrid">
        <Field label="Date d'achat">
          <input type="date" value={draft.buyDate} onChange={(e) => set("buyDate", e.target.value)} />
        </Field>
        <Field label="Règlement fournisseur">
          <select
            value={draft.purchasePaid ? "paye" : "du"}
            onChange={(e) => set("purchasePaid", e.target.value === "paye")}
          >
            <option value="paye">Payé</option>
            <option value="du">À régler</option>
          </select>
        </Field>
        <Field label="Date de réception">
          <input type="date" value={draft.receiveDate} onChange={(e) => set("receiveDate", e.target.value)} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea rows={3} value={draft.notes} placeholder="État, défauts, mesures, acheteur…" onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}
