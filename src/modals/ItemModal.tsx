import { useMemo, useRef, useState } from "react";
import { Field, Modal, Photo } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { compressImage, deletePhoto, savePhoto } from "../store/photos";
import { ARTICLE_TYPES, PLATFORMS } from "../lib/constants";
import { eur2, num, pct, today } from "../lib/format";
import { uid } from "../lib/id";
import { HINT, LABEL, eurLabel } from "../lib/lexicon";
import type { Item, PackagingKind } from "../types";

export const blankItem = (): Item => ({
  id: uid(),
  sku: "",
  condition: "Neuf avec étiquette",
  name: "", brand: "", type: "", size: "", gender: "", packaging: "boite", source: "",
  quantity: 1, cost: 0, fees: 0, price: 0, estimatedPrice: 0,
  platform: "", buyer: "", buyerUrl: "", saleFees: 0, packagingCost: 0, shippingCost: 0, shippingPaid: 0,
  status: "arrivage",
  buyDate: today(), receiveDate: "", saleDate: "",
  delivery: "commandee", shipping: "en_preparation", orderId: "", purchasePaid: true, lotTag: "", autoReceive: false,
  notes: "", photoId: null,
  createdAt: Date.now(),
  carrier: "", tracking: "", expectedDate: "", shipDate: "", shippingVideo: "", shippingVideoName: "",
});

/** Les montants restent des chaînes le temps de la saisie. */
type MoneyKey = "cost" | "fees" | "price" | "estimatedPrice" | "saleFees" | "packagingCost" | "shippingPaid" | "shippingCost";
type Draft = Omit<Item, MoneyKey | "quantity"> & Record<MoneyKey, string> & { quantity: string };

const toDraft = (i: Item): Draft => ({
  ...i,
  sku: i.sku || "",
  condition: i.condition || "Neuf avec étiquette",
  gender: i.gender || "",
  packaging: i.packaging || "boite",
  quantity: String(Math.max(1, i.quantity || 1)),
  cost: i.cost ? String(i.cost) : "",
  fees: i.fees ? String(i.fees) : "",
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

  const existingLots = useMemo(() => {
    return [...new Set(state.items.map((i) => i.lotTag).filter(Boolean))].sort();
  }, [state.items]);

  const isSold = draft.status === "vendu";

  const qty = Math.max(1, Math.round(num(draft.quantity)) || 1);
  const totalCost = (num(draft.cost) + num(draft.fees)) * qty;
  const price = num(draft.price) || num(draft.estimatedPrice);
  const saleCosts = isSold ? num(draft.saleFees) + num(draft.packagingCost) + num(draft.shippingCost) : 0;
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
      {/* Top Header: Photo en haut à gauche + Informations principales */}
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
              placeholder="Ex. Dunk Low UNC, AJ1 Low Travis Scott..."
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </Field>

          <div className="fgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Marque">
              <input type="text" list="dl-brand" value={draft.brand} placeholder="Ex. Nike, Jordan, Carhartt" onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Type / Modèle">
              <input type="text" list="dl-type" value={draft.type} placeholder="Ex. Sneakers, Veste, Sweat" onChange={(e) => set("type", e.target.value)} />
            </Field>
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
            placeholder="Ex. 42 (ou '38, 39, 40')"
            onChange={(e) => set("size", e.target.value)}
          />
          {isNew && draft.size.includes(",") && (
            <span className="hint pos" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
              ✨ {parseSizes(draft.size).length} fiches distinctes seront créées automatiquement !
            </span>
          )}
        </Field>

        <Field label="Sexe">
          <select value={draft.gender || ""} onChange={(e) => set("gender", e.target.value as Item["gender"])}>
            <option value="">Non précisé</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
            <option value="mixte">Mixte</option>
            <option value="enfant">Enfant</option>
          </select>
        </Field>

        <Field label="Source">
          <input type="text" list="dl-source" value={draft.source} placeholder="Ex. Vinted, friperie, grossiste" onChange={(e) => set("source", e.target.value)} />
        </Field>

        <Field label="Fait partie d'un lot ?">
          <select value={draft.lotTag || ""} onChange={(e) => set("lotTag", e.target.value)}>
            <option value="">Non (Article solo)</option>
            {existingLots.map((lot) => (
              <option key={lot} value={lot}>{lot}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Section TCG / Cartes à collectionner */}
      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          background: draft.isTcg ? "rgba(234, 179, 8, 0.06)" : "var(--surface-sub)",
          border: draft.isTcg ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--line-2)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={Boolean(draft.isTcg)}
              onChange={(e) => {
                const checked = e.target.checked;
                setDraft((d) => ({
                  ...d,
                  isTcg: checked,
                  tcgGame: checked ? d.tcgGame || "Pokémon" : d.tcgGame,
                  tcgCategory: checked ? d.tcgCategory || "raw" : d.tcgCategory,
                }));
              }}
            />
            <span>🃏 Article / Carte TCG (Trading Card Game)</span>
          </label>
          {draft.isTcg && (
            <span className="pill" style={{ background: "#eab308", color: "#000", fontWeight: 800, fontSize: 10 }}>
              MODE TCG ACTIF
            </span>
          )}
        </div>

        {draft.isTcg && (
          <div className="fgrid" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Licence / Jeu TCG">
              <select value={draft.tcgGame || "Pokémon"} onChange={(e) => set("tcgGame", e.target.value)}>
                <option value="Pokémon">⚡ Pokémon</option>
                <option value="One Piece">🏴‍☠️ One Piece</option>
                <option value="Yu-Gi-Oh!">👁️ Yu-Gi-Oh!</option>
                <option value="Magic">🔮 Magic: The Gathering</option>
                <option value="Lorcana">✨ Lorcana</option>
                <option value="Dragon Ball">🐉 Dragon Ball</option>
                <option value="Autre">🃏 Autre TCG</option>
              </select>
            </Field>

            <Field label="Extension / Set">
              <input
                type="text"
                value={draft.tcgSet || ""}
                placeholder="Ex. 151, EV05, OP-05..."
                onChange={(e) => set("tcgSet", e.target.value)}
              />
            </Field>

            <Field label="Format & Statut">
              <select
                value={draft.tcgCategory || "raw"}
                onChange={(e) => {
                  const cat = e.target.value as any;
                  setDraft((d) => ({
                    ...d,
                    tcgCategory: cat,
                    tcgGrade:
                      cat === "grading"
                        ? "En gradation (Note à découvrir ✨)"
                        : cat === "raw"
                        ? "Raw (Near Mint)"
                        : d.tcgGrade || "PSA 10 Gem Mint",
                  }));
                }}
              >
                <option value="raw">🃏 Carte Raw / Brut</option>
                <option value="grading">⏳ En gradation chez PSA/BGS (Note à découvrir ✨)</option>
                <option value="graded">🏆 Carte Gradée (Note connue)</option>
                <option value="blister">🟡 Blister / Artset (Booster protégé)</option>
                <option value="sealed">📦 Coffret / Booster Box / ETB scellé</option>
                <option value="case">🧱 Case / Carton Scellé (Case Displays/Blisters)</option>
              </select>
            </Field>

            {(draft.tcgCategory === "graded" || draft.tcgCategory === "grading") && (
              <Field label={draft.tcgCategory === "grading" ? "Société de gradation" : "Note / Grade"}>
                {draft.tcgCategory === "grading" ? (
                  <select value={draft.gradingCompany || "PSA"} onChange={(e) => set("gradingCompany", e.target.value)}>
                    <option value="PSA">PSA (Professional Sports Authenticator)</option>
                    <option value="BGS">BGS (Beckett Grading Services)</option>
                    <option value="PCA">PCA (PCA France)</option>
                    <option value="CGC">CGC Cards</option>
                    <option value="SGS">SGS / SGC</option>
                  </select>
                ) : (
                  <select value={draft.tcgGrade || "PSA 10 Gem Mint"} onChange={(e) => set("tcgGrade", e.target.value)}>
                    <option value="PSA 10 Gem Mint">PSA 10 Gem Mint</option>
                    <option value="PSA 9 Mint">PSA 9 Mint</option>
                    <option value="PSA 8 Near Mint">PSA 8 Near Mint</option>
                    <option value="BGS 10 Pristine">BGS 10 Pristine</option>
                    <option value="BGS 9.5 Gem Mint">BGS 9.5 Gem Mint</option>
                    <option value="PCA 10 Gem Mint">PCA 10 Gem Mint</option>
                    <option value="PCA 9.5">PCA 9.5</option>
                    <option value="CGC 10 Pristine">CGC 10 Pristine</option>
                    <option value="Autre">Autre grade</option>
                  </select>
                )}
              </Field>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* État / Condition de l'article - Boutons carrés interactifs SANS champ texte qui répète */}
        <Field label="État / Condition de l'article">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginTop: 4 }}>
            {[
              "✨ Neuf avec étiquette",
              "🏷️ Neuf sans étiquette",
              "⭐ Très bon état",
              "👍 Bon état",
              "👌 Satisfaisant",
            ].map((cond) => {
              const active = draft.condition === cond;
              return (
                <button
                  key={cond}
                  type="button"
                  onClick={() => set("condition", cond)}
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
                  {cond}
                </button>
              );
            })}
          </div>
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

      <datalist id="dl-brand">{suggestions.brand.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-type">{suggestions.type.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-size">{suggestions.size.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="dl-source">{suggestions.source.map((v) => <option key={v} value={v} />)}</datalist>

      <hr className="sep" />
      <div className="fgrid">
        <Field label={eurLabel(LABEL.cost)}>
          <input type="number" step="0.01" value={draft.cost} placeholder="0,00" onChange={(e) => set("cost", e.target.value)} />
          {qty > 1 && num(draft.cost) > 0 && (
            <span className="hint" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
              Total Lot (x{qty}) : {eur2(totalCost)}
            </span>
          )}
        </Field>
        <Field label={eurLabel(LABEL.fees)}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="number" step="0.01" value={draft.fees} placeholder={HINT.fees} onChange={(e) => set("fees", e.target.value)} />
            {num(draft.fees) > 0 && (
              <button
                type="button"
                className="btn sm ghost"
                title="Intégrer les frais au coût d'achat"
                onClick={() => {
                  const newCost = (num(draft.cost) + num(draft.fees)).toFixed(2);
                  set("cost", newCost);
                  set("fees", "");
                  toast(`Frais intégrés au coût d'achat (${newCost} €)`);
                }}
                style={{ fontSize: 10, whiteSpace: "nowrap" }}
              >
                + Coût
              </button>
            )}
          </div>
        </Field>
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
          {qty > 1 && price > 0 && (
            <span className="hint pos" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
              Total Revente (x{qty}) : {eur2(price * qty)}
            </span>
          )}
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

      <hr className="sep" />

      {/* Dates d'achat et de réception */}
      <div className="fgrid">
        <Field label="Date d'achat">
          <input type="date" value={draft.buyDate} onChange={(e) => set("buyDate", e.target.value)} />
        </Field>
        <Field label="Date de réception">
          <input type="date" value={draft.receiveDate} onChange={(e) => set("receiveDate", e.target.value)} />
        </Field>
      </div>

      {/* Notes & Description de l'annonce */}
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
