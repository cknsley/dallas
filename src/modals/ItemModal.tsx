import { useMemo, useRef, useState } from "react";
import { Field, Modal, Photo, Segmented } from "../components/ui";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { compressImage, deletePhoto, savePhoto } from "../store/photos";
import { ARTICLE_TYPES, PLATFORMS, STATUS_LABEL } from "../lib/constants";
import { eur2, num, pct, today } from "../lib/format";
import { uid } from "../lib/id";
import { HINT, LABEL, eurLabel } from "../lib/lexicon";
import type { Item, ItemStatus, PackagingKind } from "../types";

export const blankItem = (): Item => ({
  id: uid(),
  sku: "",
  condition: "Neuf avec étiquette",
  name: "", brand: "", type: "", size: "", packaging: "boite", source: "",
  quantity: 1, cost: 0, fees: 0, price: 0, estimatedPrice: 0,
  platform: "", buyer: "", buyerUrl: "", saleFees: 0, shippingCost: 0, shippingPaid: 0,
  status: "arrivage",
  buyDate: today(), receiveDate: "", saleDate: "",
  delivery: "commandee", shipping: "en_preparation", orderId: "", purchasePaid: true, lotTag: "", autoReceive: false,
  notes: "", photoId: null,
  createdAt: Date.now(),
  carrier: "", tracking: "", expectedDate: "", shipDate: "",
});

/** Les montants restent des chaînes le temps de la saisie. */
type MoneyKey = "cost" | "fees" | "price" | "estimatedPrice" | "saleFees" | "shippingPaid" | "shippingCost";
type Draft = Omit<Item, MoneyKey | "quantity"> & Record<MoneyKey, string> & { quantity: string };

const toDraft = (i: Item): Draft => ({
  ...i,
  sku: i.sku || "",
  condition: i.condition || "Neuf avec étiquette",
  packaging: i.packaging || "boite",
  quantity: String(Math.max(1, i.quantity || 1)),
  cost: i.cost ? String(i.cost) : "",
  fees: i.fees ? String(i.fees) : "",
  price: i.price ? String(i.price) : "",
  estimatedPrice: i.estimatedPrice ? String(i.estimatedPrice) : (i.price ? String(i.price) : ""),
  saleFees: i.saleFees ? String(i.saleFees) : "",
  shippingPaid: i.shippingPaid ? String(i.shippingPaid) : "",
  shippingCost: i.shippingCost ? String(i.shippingCost) : "",
});

export default function ItemModal({
  item, onClose, onDelete,
}: {
  item: Item | null;
  onClose: () => void;
  onDelete?: (i: Item) => void;
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

  const autoGenerateSku = () => {
    const prefix = (draft.brand || "RS").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const sizePart = (draft.size || "OS").replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const generated = `${prefix || "RS"}-${sizePart || "OS"}-${rand}`;
    set("sku", generated);
    toast(`SKU généré : ${generated}`);
  };

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
  const isArrivage = draft.status === "arrivage";

  const qty = Math.max(1, Math.round(num(draft.quantity)) || 1);
  const totalCost = (num(draft.cost) + num(draft.fees)) * qty;
  const price = num(draft.price) || num(draft.estimatedPrice);
  const saleCosts = isSold ? num(draft.saleFees) + num(draft.shippingCost) : 0;
  const cashIn = (isSold ? price + num(draft.shippingPaid) / qty : price) * qty;
  const outflow = totalCost + saleCosts;
  const marge = cashIn - outflow;

  const parseSizes = (raw: string): string[] => {
    if (!raw.trim()) return [""];
    const items = raw.split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : [raw.trim()];
  };

  const generateVintedDescription = (): string => {
    const parts: string[] = [];
    const title = [draft.brand, draft.name].filter(Boolean).join(" ");
    if (title) parts.push(`✨ ${title}`);

    const details: string[] = [];
    if (draft.sku) details.push(`• Réf / SKU : ${draft.sku}`);
    if (draft.brand) details.push(`• Marque : ${draft.brand}`);
    if (draft.type) details.push(`• Modèle / Type : ${draft.type}`);
    if (draft.size) details.push(`• Taille : ${draft.size}`);
    if (draft.condition) details.push(`• État : ${draft.condition}`);

    const pkgMap: Record<string, string> = {
      tout: "Boîte d'origine & Accessoires / Dustbag complets",
      boite: "Boîte d'origine incluse",
      dustbag: "Dustbag d'origine inclus",
      remplacement: "Boîte de remplacement",
      rien: "Sans boîte (pièce seule)",
    };
    if (draft.packaging && pkgMap[draft.packaging]) {
      details.push(`• Boîte / Cond. : ${pkgMap[draft.packaging]}`);
    }
    if (num(draft.price) > 0 || num(draft.estimatedPrice) > 0) {
      details.push(`• Prix : ${eur2(num(draft.price) || num(draft.estimatedPrice))}`);
    }

    if (details.length > 0) {
      parts.push(details.join("\n"));
    }

    if (draft.notes?.trim()) {
      parts.push(`📝 Détails & Description :\n${draft.notes.trim()}`);
    }

    parts.push("📦 Envoi soigné et rapide (expédié sous 24h-48h).\n💯 Article 100% authentique.");
    return parts.join("\n\n");
  };

  const copyDescription = () => {
    const text = generateVintedDescription();
    void navigator.clipboard.writeText(text);
    toast("Description Vinted copiée !");
  };

  const fillDescriptionInNotes = () => {
    const text = generateVintedDescription();
    set("notes", text);
    toast("Description insérée dans les notes !");
  };

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

    const sizes = parseSizes(draft.size);
    if (isNew && sizes.length > 1) {
      // Plusieurs tailles saisies d'un coup : on génère des fiches indépendantes pour chaque taille
      const createdItems: Item[] = [];
      for (const sizeVal of sizes) {
        const generatedSku = draft.sku ? `${draft.sku}-${sizeVal}` : undefined;
        const next: Item = {
          ...draft,
          id: uid(),
          sku: generatedSku || draft.sku?.trim(),
          condition: draft.condition?.trim() || "Neuf avec étiquette",
          name,
          brand: draft.brand.trim(),
          type: draft.type.trim(),
          size: sizeVal,
          packaging: draft.packaging || "boite",
          source: draft.source.trim(),
          notes: draft.notes.trim(),
          quantity: qty,
          cost: num(draft.cost),
          fees: num(draft.fees),
          price: num(draft.price),
          estimatedPrice: num(draft.estimatedPrice) || num(draft.price),
          saleFees: num(draft.saleFees),
          shippingPaid: num(draft.shippingPaid),
          shippingCost: num(draft.shippingCost),
          photoId,
          saleDate: draft.status === "vendu" && !draft.saleDate ? today() : draft.saleDate,
          receiveDate: draft.status !== "arrivage" && !draft.receiveDate ? today() : draft.receiveDate,
        };
        dispatch({ type: "upsertItem", item: next });
        createdItems.push(next);
      }
      toast(`${createdItems.length} fiches créées (Tailles : ${sizes.join(", ")})`);
      return createdItems[0];
    }

    const next: Item = {
      ...draft,
      sku: draft.sku?.trim() || "",
      condition: draft.condition?.trim() || "Neuf avec étiquette",
      name,
      brand: draft.brand.trim(),
      type: draft.type.trim(),
      size: sizes[0] || draft.size.trim(),
      packaging: draft.packaging || "boite",
      source: draft.source.trim(),
      notes: draft.notes.trim(),
      quantity: qty,
      cost: num(draft.cost),
      fees: num(draft.fees),
      price: num(draft.price),
      estimatedPrice: num(draft.estimatedPrice) || num(draft.price),
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
    if (isNew && parseSizes(draft.size).length <= 1) {
      toast("Article ajouté au stock");
    } else if (!isNew) {
      toast("Modifications enregistrées");
    }
    onClose();
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
            placeholder="Ex. Dunk Low UNC, AJ1 Low Travis Scott..."
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Marque">
          <input type="text" list="dl-brand" value={draft.brand} placeholder="Ex. Nike, Jordan, Carhartt" onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Type / Modèle">
          <input type="text" list="dl-type" value={draft.type} placeholder="Ex. Sneakers, Veste, Sweat" onChange={(e) => set("type", e.target.value)} />
        </Field>
        <Field label="Code SKU / Référence">
          <div style={{ display: "flex", gap: 6 }}>
            <input type="text" value={draft.sku} placeholder="Ex. SKU-NK-42-01" onChange={(e) => set("sku", e.target.value)} />
            <button type="button" className="btn sm ghost" onClick={autoGenerateSku} title="Générer un SKU automatiquement">
              ⚡ Auto
            </button>
          </div>
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
        <Field label="Taille(s)">
          <input
            type="text"
            list="dl-size"
            value={draft.size}
            placeholder="Ex. 42 (ou '38, 39, 40' pour créer 3 fiches)"
            onChange={(e) => set("size", e.target.value)}
          />
          {isNew && draft.size.includes(",") && (
            <span className="hint pos" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
              ✨ {parseSizes(draft.size).length} fiches distinctes seront créées automatiquement !
            </span>
          )}
        </Field>
        <Field label="Source">
          <input type="text" list="dl-source" value={draft.source} placeholder="Ex. Vinted, friperie, grossiste" onChange={(e) => set("source", e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="État / Condition de l'article">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, marginBottom: 6 }}>
            {[
              "✨ Neuf avec étiquette",
              "🏷️ Neuf sans étiquette",
              "⭐ Très bon état",
              "👍 Bon état",
              "👌 Satisfaisant",
            ].map((cond) => (
              <button
                key={cond}
                type="button"
                className={`btn sm${draft.condition === cond ? " primary" : " ghost"}`}
                onClick={() => set("condition", cond)}
                style={{ fontSize: 11.5 }}
              >
                {cond}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={draft.condition}
            placeholder="Précisions sur l'état (ex. Très bon état avec légères traces)..."
            onChange={(e) => set("condition", e.target.value)}
          />
        </Field>

        <Field label="Boîte & Accessoires">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {([
              ["tout", "📦+🎒 Tout complet"],
              ["boite", "📦 Boîte d'origine"],
              ["dustbag", "🎒 Dustbag seul"],
              ["remplacement", "📦 Boîte remplacement"],
              ["rien", "🚫 Sans boîte"],
            ] as [PackagingKind, string][]).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={`btn sm${(draft.packaging || "boite") === k ? " primary" : " ghost"}`}
                onClick={() => set("packaging", k)}
                style={{ fontSize: 11.5 }}
              >
                {lbl}
              </button>
            ))}
          </div>
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
        <Field label={eurLabel(isSold ? LABEL.price : "Prix estimé (€)")}>
          <input
            type="number"
            step="0.01"
            value={draft.price}
            placeholder={isSold ? "0,00" : "Prix de revente estimé"}
            readOnly={isSold}
            title={isSold ? "Le prix réel se modifie depuis le formulaire de vente" : undefined}
            onChange={(e) => {
              set("price", e.target.value);
              set("estimatedPrice", e.target.value);
            }}
          />
        </Field>
      </div>

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

      {isArrivage && (
        <>
          <hr className="sep" />
          <div className="field"><span>Livraison</span></div>
          <div className="fgrid">
            <Field label="Lot">
              <input type="text" value={draft.lotTag} placeholder="Nom du lot / de la commande" onChange={(e) => set("lotTag", e.target.value)} />
            </Field>
            <Field label="Transporteur">
              <input type="text" value={draft.carrier} placeholder="Colissimo, Chronopost…" onChange={(e) => set("carrier", e.target.value)} />
            </Field>
            <Field label="Code de suivi">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" value={draft.tracking} placeholder="—" onChange={(e) => set("tracking", e.target.value)} />
                {draft.tracking && <TrackingLink carrier={draft.carrier} code={draft.tracking} />}
              </div>
            </Field>
            <Field label="Arrivée prévue">
              <input type="date" value={draft.expectedDate} onChange={(e) => set("expectedDate", e.target.value)} />
            </Field>
          </div>
        </>
      )}

      <hr className="sep" />
      <div className="field">
        <span>Statut de l'article</span>
        <div className="status-row" style={{ marginTop: 6 }}>
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
        </div>
      </div>

      <div className="fgrid">
        <Field label="Date d'achat">
          <input type="date" value={draft.buyDate} onChange={(e) => set("buyDate", e.target.value)} />
        </Field>
        <Field label="Date de réception">
          <input type="date" value={draft.receiveDate} onChange={(e) => set("receiveDate", e.target.value)} />
        </Field>
      </div>

      <Field label="Notes & Description de l'annonce">
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn sm primary" onClick={copyDescription}>
            📋 Copier la description Vinted
          </button>
          <button type="button" className="btn sm ghost" onClick={fillDescriptionInNotes}>
            ✨ Générer dans le champ ci-dessous
          </button>
        </div>
        <textarea rows={4} value={draft.notes} placeholder="État, défauts, mesures, détails de l'annonce…" onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}

