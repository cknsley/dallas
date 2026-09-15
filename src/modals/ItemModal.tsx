import { useMemo, useRef, useState } from "react";
import { Field, Modal, Photo } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { compressImage, deletePhoto, savePhoto } from "../store/photos";
import { ARTICLE_TYPES, PLATFORMS } from "../lib/constants";
import { eur2, num, pct, today } from "../lib/format";
import { uid } from "../lib/id";
import { LABEL, eurLabel } from "../lib/lexicon";
import { isTcgItem } from "../lib/calc";
import { useSecteur } from "../lib/useSecteur";
import { TCG_CATEGORIES, TCG_GAMES, TCG_GRADES, fieldLabels, sectorStamp } from "../lib/sectorFields";
import type { Item, PackagingKind } from "../types";

export const blankItem = (): Item => ({
  id: uid(),
  sku: "",
  condition: "Neuf avec étiquette",
  name: "", brand: "", type: "", size: "", gender: "", packaging: "boite", source: "",
  quantity: 1, cost: 0, fees: 0, purchaseShipping: 0, customsFees: 0, price: 0, estimatedPrice: 0,
  platform: "", buyer: "", buyerUrl: "", saleFees: 0, packagingCost: 0, shippingCost: 0, shippingPaid: 0,
  status: "arrivage",
  buyDate: today(), receiveDate: "", saleDate: "",
  delivery: "commandee", shipping: "en_preparation", orderId: "", purchasePaid: true, lotTag: "", autoReceive: false,
  notes: "", photoId: null,
  createdAt: Date.now(),
  carrier: "", tracking: "", expectedDate: "", shipDate: "", shippingVideo: "", shippingVideoName: "",
});

/** Les montants restent des chaînes le temps de la saisie. */
type MoneyKey = "cost" | "fees" | "purchaseShipping" | "customsFees" | "price" | "estimatedPrice" | "saleFees" | "packagingCost" | "shippingPaid" | "shippingCost";
type Draft = Omit<Item, MoneyKey | "quantity"> & Record<MoneyKey, string> & { quantity: string };
type ItemStep = "base" | "details" | "prix" | "notes";

const ITEM_STEPS: { key: ItemStep; label: string }[] = [
  { key: "base", label: "Article" },
  { key: "details", label: "Détails" },
  { key: "prix", label: "Prix" },
  { key: "notes", label: "Notes" },
];

const VINTED_CONDITIONS = [
  "Neuf avec étiquette",
  "Neuf sans étiquette",
  "Très bon état",
  "Bon état",
  "Satisfaisant",
];

const CONDITION_GRADES = ["Grade A", "Grade B", "Grade C", "Grade D", "Grade E", "Grade F"];

const toDraft = (i: Item): Draft => ({
  ...i,
  sku: i.sku || "",
  condition: i.condition || "Neuf avec étiquette",
  gender: i.gender || "",
  packaging: i.packaging || "boite",
  quantity: String(Math.max(1, i.quantity || 1)),
  cost: i.cost ? String(i.cost) : "",
  fees: i.fees ? String(i.fees) : "",
  purchaseShipping: i.purchaseShipping ? String(i.purchaseShipping) : "",
  customsFees: i.customsFees ? String(i.customsFees) : "",
  price: i.price ? String(i.price) : "",
  estimatedPrice: i.estimatedPrice ? String(i.estimatedPrice) : (i.price ? String(i.price) : ""),
  saleFees: i.saleFees ? String(i.saleFees) : "",
  packagingCost: i.packagingCost ? String(i.packagingCost) : "",
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
  const secteur = useSecteur();
  // Un article créé depuis un univers y reste : TCG marqué comme tel, univers perso rattaché.
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(item ?? { ...blankItem(), ...sectorStamp(secteur.domain), ...(secteur.domain === "tcg" ? { tcgCategory: "raw" as const } : {}) }),
  );
  const [pending, setPending] = useState<Blob | null>(null);
  const [pendingURL, setPendingURL] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [step, setStep] = useState<ItemStep>("base");
  const fileRef = useRef<HTMLInputElement>(null);

  const conditionOptions = [...VINTED_CONDITIONS, ...CONDITION_GRADES];

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const tcg = !!draft.isTcg || (!!item && isTcgItem(item));
  const labels = fieldLabels(tcg ? "tcg" : "fashion");
  const isBoxFormat = tcg && (draft.tcgCategory === "sealed" || draft.tcgCategory === "case");

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
      brand: tcg ? [...new Set([...TCG_GAMES, ...uniq("brand")])] : uniq("brand"),
      type: [...new Set([...ARTICLE_TYPES, ...uniq("type")])],
      size: tcg ? [...new Set([...TCG_GRADES, ...uniq("size")])] : uniq("size"),
      source: uniq("source"),
      platform: [...new Set([...PLATFORMS, ...uniq("platform")])],
    };
  }, [state.items, tcg]);

  const isSold = draft.status === "vendu";
  const stepIndex = ITEM_STEPS.findIndex((s) => s.key === step);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === ITEM_STEPS.length - 1;

  const qty = Math.max(1, Math.round(num(draft.quantity)) || 1);
  const purchaseFees = num(draft.purchaseShipping) + num(draft.customsFees) + num(draft.fees);
  const totalCost = (num(draft.cost) + purchaseFees) * qty;
  const price = num(draft.price) || num(draft.estimatedPrice);
  const saleCosts = isSold ? num(draft.saleFees) + num(draft.packagingCost) + num(draft.shippingCost) : 0;
  const cashIn = (isSold ? price + num(draft.shippingPaid) / qty : price) * qty;
  const outflow = totalCost + saleCosts;
  const marge = cashIn - outflow;

  const parseSizes = (raw: string): string[] => {
    // Un grade TCG ne se décline pas en plusieurs fiches comme une liste de tailles.
    if (tcg || !raw.trim()) return [raw.trim()];
    const items = raw.split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : [raw.trim()];
  };

  const generateVintedDescription = (): string => {
    const parts: string[] = [];
    const title = [draft.brand, draft.name].filter(Boolean).join(" ");
    if (title) parts.push(`✨ ${title}`);

    const details: string[] = [];
    if (draft.sku) details.push(`• Réf / SKU : ${draft.sku}`);
    if (draft.brand) details.push(`• ${labels.brand} : ${draft.brand}`);
    if (tcg && draft.tcgSet) details.push(`• ${labels.type} : ${draft.tcgSet}`);
    if (!tcg && draft.type) details.push(`• Modèle / Type : ${draft.type}`);
    if (draft.size) details.push(`• ${labels.size} : ${draft.size}`);
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
          gender: draft.gender || "",
          packaging: draft.packaging || "boite",
          source: draft.source.trim(),
          notes: draft.notes.trim(),
          quantity: qty,
          cost: num(draft.cost),
          fees: num(draft.fees),
          purchaseShipping: num(draft.purchaseShipping),
          customsFees: num(draft.customsFees),
          price: num(draft.price),
          estimatedPrice: num(draft.estimatedPrice) || num(draft.price),
          saleFees: num(draft.saleFees),
          packagingCost: num(draft.packagingCost),
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
      gender: draft.gender || "",
      packaging: draft.packaging || "boite",
      source: draft.source.trim(),
      notes: draft.notes.trim(),
      quantity: qty,
      cost: num(draft.cost),
      fees: num(draft.fees),
      purchaseShipping: num(draft.purchaseShipping),
      customsFees: num(draft.customsFees),
      price: num(draft.price),
      estimatedPrice: num(draft.estimatedPrice) || num(draft.price),
      saleFees: num(draft.saleFees),
      packagingCost: num(draft.packagingCost),
      shippingPaid: num(draft.shippingPaid),
      shippingCost: num(draft.shippingCost),
      photoId,
      saleDate: draft.status === "vendu" && !draft.saleDate ? today() : draft.saleDate,
      receiveDate: draft.status !== "arrivage" && !draft.receiveDate ? today() : draft.receiveDate,
      ...(tcg
        ? {
          isTcg: true,
          tcgGame: draft.brand.trim() || undefined,
          tcgGrade: draft.size.trim() || undefined,
          tcgSet: draft.tcgSet?.trim() || undefined,
          type: draft.type.trim() || "Carte TCG",
        }
        : {}),
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
          {!isFirstStep && (
            <button className="btn" onClick={() => setStep(ITEM_STEPS[stepIndex - 1].key)}>Précédent</button>
          )}
          {isLastStep ? (
            <button className="btn primary" onClick={() => void submit()}>
              {isNew ? "Ajouter l’article" : "Enregistrer"}
            </button>
          ) : (
            <button className="btn primary" onClick={() => setStep(ITEM_STEPS[stepIndex + 1].key)}>Suivant</button>
          )}
        </>
      }
    >
      <div className="modal-steps">
        {ITEM_STEPS.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            className={`modal-step${s.key === step ? " active" : ""}${idx < stepIndex ? " done" : ""}`}
            onClick={() => setStep(s.key)}
          >
            <span>{idx + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      {step === "base" && (
        <>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        {/* Photo dropzone à gauche */}
        <div style={{ flexShrink: 0, width: 120 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginBottom: 4, display: "block" }}>Photo</label>
          <div
            className="dropzone-compact"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void pickPhoto(f);
            }}
            style={{
              width: 120,
              height: 120,
              borderRadius: 12,
              border: "2px dashed var(--line-2)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              position: "relative",
              background: "var(--surface-sub)",
            }}
          >
            {pendingURL ? (
              <img src={pendingURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : cleared || !draft.photoId ? (
              <div style={{ textAlign: "center", color: "var(--ink-3)", padding: 4 }}>
                <div style={{ fontSize: 24, lineHeight: 1 }}>📷</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>+ Photo</div>
              </div>
            ) : (
              <Photo id={draft.photoId} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            {(pendingURL || (draft.photoId && !cleared)) && (
              <button
                type="button"
                className="btn sm"
                style={{
                  position: "absolute",
                  bottom: 4,
                  right: 4,
                  fontSize: 10,
                  padding: "2px 6px",
                  background: "rgba(0,0,0,0.7)",
                  color: "#fff",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPending(null);
                  setPendingURL((old) => { if (old) URL.revokeObjectURL(old); return null; });
                  setCleared(true);
                }}
              >
                ✕
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
        </div>

        {/* Détails de base à droite */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Nom de l’article">
            <input
              type="text"
              value={draft.name}
              placeholder={tcg ? "Ex. Dracaufeu ex 199/165, Display 151..." : "Ex. Dunk Low UNC, AJ1 Low Travis Scott..."}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </Field>

          <div className="fgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label={labels.brand}>
              <input type="text" list="dl-brand" value={draft.brand} placeholder={tcg ? "Ex. Pokémon, One Piece" : "Ex. Nike, Jordan, Carhartt"} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            {tcg ? (
              <Field label="Format">
                <select value={draft.tcgCategory || "raw"} onChange={(e) => set("tcgCategory", e.target.value as Item["tcgCategory"])}>
                  {TCG_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                  ))}
                </select>
                {isBoxFormat && (
                  <div className="seg sm" style={{ marginTop: 6 }}>
                    <button type="button" className={draft.tcgSealed !== false ? "on" : ""} onClick={() => set("tcgSealed", true)}>Scellé</button>
                    <button type="button" className={draft.tcgSealed === false ? "on" : ""} onClick={() => set("tcgSealed", false)}>Ouvert</button>
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Type / Modèle">
                <input type="text" list="dl-type" value={draft.type} placeholder="Ex. Sneakers, Veste, Sweat" onChange={(e) => set("type", e.target.value)} />
              </Field>
            )}
          </div>
        </div>
      </div>

      <div className="fgrid">
        <Field label="Code SKU / Référence">
          <div style={{ display: "flex", gap: 6 }}>
            <input type="text" value={draft.sku} placeholder="Ex. SKU-NK-42-01" onChange={(e) => set("sku", e.target.value)} />
            <button type="button" className="btn sm ghost" onClick={autoGenerateSku} title="Générer un SKU automatiquement">
              ⚡ Auto
            </button>
          </div>
        </Field>

        <Field label={isBoxFormat ? (draft.tcgCategory === "case" ? "Nombre de cases" : "Nombre de displays") : "Quantité"}>
          <input
            type="number"
            step="1"
            min="1"
            value={draft.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>

        {isBoxFormat && (
          <Field label="Quantité à l'intérieur">
            <input
              type="number"
              step="1"
              min="1"
              placeholder="Ex. 24 boosters"
              value={draft.tcgUnitsInside ?? ""}
              onChange={(e) => set("tcgUnitsInside", e.target.value ? Number(e.target.value) : undefined)}
            />
          </Field>
        )}

        {!tcg && (
          <Field label="Taille(s)">
            <input
              type="text"
              list="dl-size"
              value={draft.size}
              placeholder="Ex. 42 (ou '38, 39, 40')"
              onChange={(e) => set("size", e.target.value)}
            />
            {isNew && draft.size.includes(",") && (
              <span className="hint pos" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
                ✨ {parseSizes(draft.size).length} fiches distinctes seront créées automatiquement !
              </span>
            )}
          </Field>
        )}

        {tcg ? (
          <Field label={labels.type}>
            <input type="text" value={draft.tcgSet || ""} placeholder="Ex. 151, Évolution Céleste, OP-05" onChange={(e) => set("tcgSet", e.target.value)} />
          </Field>
        ) : (
          <Field label="Sexe">
            <select value={draft.gender || ""} onChange={(e) => set("gender", e.target.value as Item["gender"])}>
              <option value="">Non précisé</option>
              <option value="homme">Homme</option>
              <option value="femme">Femme</option>
              <option value="mixte">Mixte</option>
              <option value="enfant">Enfant</option>
            </select>
          </Field>
        )}

        <Field label="Source">
          <input type="text" list="dl-source" value={draft.source} placeholder="Ex. Vinted, friperie, grossiste" onChange={(e) => set("source", e.target.value)} />
        </Field>

      </div>

      {/* Univers personnalisé : uniquement si l'utilisateur en a créé depuis l'accueil */}
      {!!(state.settings.customSectors ?? []).length && (
        <Field label="Univers">
          <select value={draft.sector || ""} onChange={(e) => set("sector", e.target.value)}>
            <option value="">🧭 Automatique (Vêtements / TCG)</option>
            {(state.settings.customSectors ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
            ))}
          </select>
        </Field>
      )}
        </>
      )}

      {step === "details" && (
        <>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="État / Condition de l'article">
          <select value={draft.condition || ""} onChange={(e) => set("condition", e.target.value)}>
            <option value="">Non précisé</option>
            {conditionOptions.map((cond) => (
              <option key={cond} value={cond}>{cond}</option>
            ))}
          </select>
        </Field>

        {/* Boîte & Accessoires - Boutons carrés interactifs */}
        <Field label="Boîte & Accessoires">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginTop: 4 }}>
            {([
              ["tout", "📦+🎒 Tout complet"],
              ["boite", "📦 Boîte d'origine"],
              ["dustbag", "🎒 Dustbag seul"],
              ["remplacement", "📦 Boîte remplacement"],
              ["rien", "🚫 Sans boîte"],
            ] as [PackagingKind, string][]).map(([k, lbl]) => {
              const active = (draft.packaging || "boite") === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("packaging", k)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 8px",
                    borderRadius: 8,
                    border: active ? "2px solid var(--accent)" : "1px solid var(--line-2)",
                    background: active ? "var(--accent-sub)" : "var(--surface-sub)",
                    color: active ? "var(--accent-glow)" : "var(--ink)",
                    fontWeight: active ? 600 : 400,
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
        </>
      )}

      <datalist id="dl-brand">{suggestions.brand.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-type">{suggestions.type.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-size">{suggestions.size.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-source">{suggestions.source.map((v) => <option key={v} value={v} />)}</datalist>

      {step === "prix" && (
        <>
      <div className="fgrid">
        <Field label={eurLabel("Prix unitaire")}>
          <input type="number" step="0.01" value={draft.cost} placeholder="0,00" onChange={(e) => set("cost", e.target.value)} />
        </Field>
        <Field label={eurLabel("Livraison")}>
          <input type="number" min="0" step="0.01" value={draft.purchaseShipping} placeholder="0,00" onChange={(e) => set("purchaseShipping", e.target.value)} />
        </Field>
        <Field label={eurLabel("Douane")}>
          <input type="number" min="0" step="0.01" value={draft.customsFees} placeholder="0,00" onChange={(e) => set("customsFees", e.target.value)} />
        </Field>
        <Field label={eurLabel("Autres frais")}>
          <input type="number" min="0" step="0.01" value={draft.fees} placeholder="Nettoyage, retouche…" onChange={(e) => set("fees", e.target.value)} />
        </Field>
      </div>

      <div className="note info">
        <span className="glyph">≡</span>
        <div>
          Estimation prix d'achat total <b className="num">{eur2(totalCost)}</b>
          {qty > 1 && <> ({qty} × {eur2(num(draft.cost))} + livraison + douane + frais)</>}
        </div>
      </div>

      <div className="fgrid" style={{ marginTop: 14 }}>
        <Field label={eurLabel(isSold ? LABEL.price : "Prix estimé")}>
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
            <>Donnez une {LABEL.estimate.toLowerCase()} pour voir la marge.</>
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

      <div className="fgrid">
        <Field label="Date d'achat">
          <input type="date" value={draft.buyDate} onChange={(e) => set("buyDate", e.target.value)} />
        </Field>
        <Field label="Date de réception">
          <input type="date" value={draft.receiveDate} onChange={(e) => set("receiveDate", e.target.value)} />
        </Field>
      </div>
        </>
      )}

      {step === "notes" && (
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
      )}
    </Modal>
  );
}
