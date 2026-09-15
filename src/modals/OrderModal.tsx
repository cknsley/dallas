import { useMemo, useState } from "react";
import { Field, Modal, QtySelect, Segmented, SizeSelect } from "../components/ui";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { ARTICLE_TYPES, CARRIERS } from "../lib/constants";
import { eur2, num, today } from "../lib/format";
import { uid } from "../lib/id";
import { compressImage, savePhoto } from "../store/photos";
import { HINT, LABEL, eurLabel } from "../lib/lexicon";
import { useSecteur } from "../lib/useSecteur";
import type { Item } from "../types";

interface Line {
  key: string;
  name: string;
  /** Photo de ce que le fournisseur annonce : utile pour les achats à distance. */
  photo: Blob | null;
  photoUrl: string | null;
  quantity: string;
  brand: string;
  type: string;
  size: string;
  cost: string;
  estimate: string;
}

const newLine = (): Line => ({ key: uid(), name: "", photo: null, photoUrl: null, quantity: "1", brand: "", type: "", size: "", cost: "", estimate: "" });

/**
 * Une commande fournisseur : plusieurs pièces achetées d'un coup, avec des frais
 * de port communs. Les articles entrent en « Arrivage » (ou Vente directe client).
 */
export interface OrderPresetLine {
  name: string;
  cost: string;
  fees: string;
  estimate: string;
  brand?: string;
  type?: string;
  size?: string;
  quantity?: string;
}

export default function OrderModal({
  onClose, onCreated, defaultSource = "", mode = "supplier", initialLines, initialShipping,
}: {
  onClose: () => void;
  onCreated?: (n: number) => void;
  /** Fournisseur déjà connu : on part de lui plutôt que d'une page blanche. */
  defaultSource?: string;
  /** Un lot n'exige pas de fournisseur identifié, une commande si. */
  mode?: "lot" | "supplier";
  /** Pre-remplissage depuis une simulation de deal */
  initialLines?: OrderPresetLine[];
  initialShipping?: string;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const [isProMode, setIsProMode] = useState(false);
  const [destination, setDestination] = useState<"stock" | "direct">("stock");

  const [source, setSource] = useState(defaultSource);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | undefined>(() => {
    if (defaultSource) {
      const match = state.suppliers.find((s) => s.name.toLowerCase() === defaultSource.toLowerCase());
      return match?.id;
    }
    return undefined;
  });
  const [isCustomSupplier, setIsCustomSupplier] = useState(!defaultSource && state.suppliers.length === 0);

  const [directBuyer, setDirectBuyer] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [directPlatform, setDirectPlatform] = useState("Direct client");

  const [buyDate, setBuyDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [shipping, setShipping] = useState(initialShipping ?? "");
  const [customs, setCustoms] = useState("");
  const [handling, setHandling] = useState("");
  const [includeFeesInCost, setIncludeFeesInCost] = useState(true);
  const [lotName, setLotName] = useState("");
  const [notes, setNotes] = useState("");
  const [purchasePaid, setPurchasePaid] = useState(true);
  const [autoReceive, setAutoReceive] = useState(false);

  /* Support TCG & Cartes */
  // Depuis l'espace TCG, une commande est une commande TCG : sinon elle quitterait la page.
  const secteur = useSecteur();
  const [isTcgOrder, setIsTcgOrder] = useState(secteur.domain === "tcg");
  const [tcgGameOrder, setTcgGameOrder] = useState("Pokémon");
  const [tcgCategoryOrder, setTcgCategoryOrder] = useState<"raw" | "graded" | "sealed" | "grading" | "blister" | "case">("raw");
  const [tcgSetOrder, setTcgSetOrder] = useState("");
  const [tcgGradeOrder, setTcgGradeOrder] = useState("PSA 10 Gem Mint");
  const [gradingCompanyOrder, setGradingCompanyOrder] = useState("PSA");

  const [lines, setLines] = useState<Line[]>(() => {
    if (initialLines && initialLines.length > 0) {
      return initialLines.map((l) => ({
        key: uid(),
        name: l.name || "",
        photo: null,
        photoUrl: null,
        quantity: l.quantity || "1",
        brand: l.brand || "",
        type: l.type || "",
        size: l.size || "",
        cost: l.cost || "",
        estimate: l.estimate || "",
      }));
    }
    return [newLine()];
  });

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

  // Separation of Shipping and Taxes (mode pro)
  const shippingTotal = isProMode ? num(shipping) + num(handling) : 0;
  const taxTotal = isProMode ? num(customs) : 0;
  const landedTotal = shippingTotal + taxTotal;
  const total = goods + landedTotal;

  const lineTotalCost = (l: Line) => num(l.cost) * qtyOfLine(l);

  const shareShippingOf = (l: Line) =>
    shippingTotal === 0
      ? 0
      : goods > 0
        ? (lineTotalCost(l) / goods) * shippingTotal
        : shippingTotal / Math.max(1, filled.length);

  const shareTaxOf = (l: Line) =>
    taxTotal === 0
      ? 0
      : goods > 0
        ? (lineTotalCost(l) / goods) * taxTotal
        : taxTotal / Math.max(1, filled.length);

  const shareOf = (l: Line) => shareShippingOf(l) + shareTaxOf(l);
  const feePerUnit = (l: Line) => Math.round((shareOf(l) / qtyOfLine(l)) * 100) / 100;

  const pickPhoto = async (key: string, file: File) => {
    try {
      const blob = await compressImage(file);
      setLines((l) =>
        l.map((x) => {
          if (x.key !== key) return x;
          if (x.photoUrl) URL.revokeObjectURL(x.photoUrl);
          return { ...x, photo: blob, photoUrl: URL.createObjectURL(blob) };
        }),
      );
    } catch {
      toast("Image illisible");
    }
  };

  const submit = () => {
    if (filled.length === 0) {
      toast("Ajoutez au moins un article à la commande");
      return;
    }
    if (mode === "supplier" && !source.trim() && destination !== "direct") {
      toast("Indiquez le fournisseur de cette commande");
      return;
    }
    if (destination === "direct" && !directBuyer.trim()) {
      toast("Indiquez le nom du client pour la vente directe");
      return;
    }

    const orderId = uid();
    const now = Date.now();
    const tag = lotName.trim() || [source.trim(), buyDate].filter(Boolean).join(" · ") || "Lot";
    filled.forEach((l, ix) => {
      const photoId = l.photo ? uid() : null;
      if (photoId && l.photo) void savePhoto(photoId, l.photo);

      const perUnitFee = feePerUnit(l);
      const baseCost = num(l.cost);
      const finalCost = includeFeesInCost ? baseCost + perUnitFee : baseCost;
      const finalFees = includeFeesInCost ? 0 : perUnitFee;

      const item: Item = {
        id: uid(),
        name: l.name.trim() || "Article sans nom",
        brand: l.brand.trim(),
        type: l.type.trim(),
        size: l.size.trim(),
        source: source.trim(),
        supplierId: selectedSupplierId,
        quantity: qtyOfLine(l),
        cost: finalCost,
        fees: finalFees,
        price: num(l.estimate),
        platform: destination === "direct" ? (directPlatform.trim() || "Direct client") : "",
        buyer: destination === "direct" ? directBuyer.trim() : "",
        clientId: destination === "direct" ? selectedClientId : undefined,
        buyerUrl: "",
        saleFees: 0,
        shippingCost: 0,
        shippingPaid: 0,
        status: destination === "direct" ? "vendu" : "arrivage",
        buyDate,
        receiveDate: destination === "direct" ? buyDate : "",
        saleDate: destination === "direct" ? buyDate : "",
        delivery: "commandee",
        shipping: "en_preparation",
        notes: isProMode ? notes.trim() : "",
        photoId,
        createdAt: now + ix,
        carrier: isProMode ? carrier.trim() : "",
        tracking: isProMode ? tracking.trim() : "",
        expectedDate: isProMode ? expectedDate : "",
        shipDate: "",
        orderId,
        purchasePaid: isProMode ? purchasePaid : true,
        lotTag: tag,
        autoReceive: isProMode ? autoReceive : false,
        isTcg: isTcgOrder,
        tcgGame: isTcgOrder ? (l.brand.trim() || tcgGameOrder) : undefined,
        tcgSet: isTcgOrder ? tcgSetOrder : undefined,
        tcgCategory: isTcgOrder ? tcgCategoryOrder : undefined,
        tcgGrade: isTcgOrder
          ? l.size.trim() || (tcgCategoryOrder === "grading"
            ? "En gradation (Note à découvrir ✨)"
            : tcgCategoryOrder === "raw"
            ? "Raw (Near Mint)"
            : tcgGradeOrder)
          : undefined,
        gradingCompany: isTcgOrder && (tcgCategoryOrder === "grading" || tcgCategoryOrder === "graded") ? gradingCompanyOrder : undefined,
      };
      dispatch({ type: "upsertItem", item });
    });

    if (destination === "direct") {
      toast(`Commande et vente directe enregistrées — ${filled.length} article${filled.length > 1 ? "s" : ""} vendu${filled.length > 1 ? "s" : ""}`);
    } else {
      toast(`Commande enregistrée — ${filled.length} article${filled.length > 1 ? "s" : ""} en arrivage`);
    }
    onClose();
    onCreated?.(filled.length);
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12 }}>
          <span>
            {mode === "lot"
              ? "Nouveau lot"
              : destination === "direct"
                ? "🏷️ Nouvelle vente directe client"
                : "Nouvelle commande fournisseur"}
          </span>
          <button
            type="button"
            className={`btn sm ${isProMode ? "primary" : "ghost"}`}
            onClick={() => setIsProMode(!isProMode)}
            style={{ fontSize: 12, gap: 6 }}
          >
            ⚡ Mode Pro {isProMode ? "actif" : "(avancé)"}
          </button>
        </div>
      }
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={submit}>
            {destination === "direct"
              ? `Enregistrer la vente${filled.length ? ` (${filled.length})` : ""}`
              : `Enregistrer la commande${filled.length ? ` (${filled.length})` : ""}`}
          </button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">{destination === "direct" ? "🏷️" : "⇩"}</span>
        <div>
          {destination === "direct" ? (
            <>Vente directe client : Les articles entrent immédiatement en statut <b>Vendu</b> au nom du client indiqué.</>
          ) : (
            <>Les articles entrent en <b>Arrivage</b>. {isProMode ? "La livraison et les taxes se répartissent automatiquement sur chaque article." : "Passez en Mode Pro pour ajouter frais de livraison, douane ou numéro de suivi."}</>
          )}
        </div>
      </div>

      <div className="fgrid">
        <Field label={
          mode === "lot"
            ? "Source (facultatif)"
            : destination === "direct"
              ? "Fournisseur / Source d'achat (facultatif)"
              : "Fournisseur"
        }>
          {state.suppliers.length > 0 && !isCustomSupplier ? (
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={selectedSupplierId || (source ? source : "")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__custom__") {
                    setIsCustomSupplier(true);
                    setSource("");
                    setSelectedSupplierId(undefined);
                  } else {
                    const found = state.suppliers.find((s) => s.id === val || s.name === val);
                    if (found) {
                      setSelectedSupplierId(found.id);
                      setSource(found.name);
                    } else {
                      setSelectedSupplierId(undefined);
                      setSource(val);
                    }
                  }
                }}
              >
                <option value="">-- Sélectionner une fiche fournisseur --</option>
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    🏢 {s.name} {s.contact ? `(${s.contact})` : ""}
                  </option>
                ))}
                <option value="__custom__">✏️ Autre fournisseur (saisie libre)…</option>
              </select>
              <button
                type="button"
                className="btn ghost sm"
                title="Saisie libre"
                onClick={() => setIsCustomSupplier(true)}
              >
                ✏️
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                list="dl-order-source"
                value={source}
                placeholder="Vinted, grossiste, friperie…"
                onChange={(e) => {
                  setSource(e.target.value);
                  const match = state.suppliers.find((s) => s.name.toLowerCase() === e.target.value.toLowerCase());
                  setSelectedSupplierId(match?.id);
                }}
                autoFocus={!defaultSource}
              />
              {state.suppliers.length > 0 && (
                <button
                  type="button"
                  className="btn ghost sm"
                  title="Choisir parmi les fiches"
                  onClick={() => setIsCustomSupplier(false)}
                >
                  📋
                </button>
              )}
            </div>
          )}
        </Field>

        <Field label="Destination">
          <Segmented
            value={destination}
            options={[
              { value: "stock", label: "📦 Mise en stock" },
              { value: "direct", label: "🏷️ Vente directe client" },
            ]}
            onChange={(v) => setDestination(v)}
          />
        </Field>

        <Field label="Date de commande">
          <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
        </Field>
      </div>

      {destination === "direct" && (
        <div className="fgrid" style={{ marginTop: 10, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
          <Field label="Client (Acheteur)">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  list="dl-order-client"
                  value={directBuyer}
                  placeholder="Nom du client ou saisie libre…"
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value;
                    setDirectBuyer(val);
                    // Auto-link to client fiche on exact name match
                    const match = state.clients.find(
                      (c) => c.name.toLowerCase() === val.trim().toLowerCase()
                    );
                    setSelectedClientId(match?.id);
                    // Auto-fill platform if client has one and platform is still default
                    if (match?.platform && directPlatform === "Direct client") {
                      setDirectPlatform(match.platform);
                    }
                  }}
                />
                {selectedClientId && (
                  <span
                    className="pill good"
                    style={{ fontSize: 10, whiteSpace: "nowrap", padding: "2px 8px", flexShrink: 0 }}
                    title="Fiche client liée"
                  >
                    ✓ Fiche liée
                  </span>
                )}
              </div>
              {/* Datalist with all clients for autocomplete */}
              <datalist id="dl-order-client">
                {state.clients.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.platform ? `${c.name} (${c.platform})` : c.name}
                  </option>
                ))}
              </datalist>
              {state.clients.length > 0 && !selectedClientId && directBuyer.trim() && (
                <div className="hint" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  💡 Tapez un nom existant pour lier la fiche automatiquement
                </div>
              )}
              {selectedClientId && (() => {
                const linked = state.clients.find((c) => c.id === selectedClientId);
                return linked ? (
                  <div className="hint" style={{ fontSize: 11, color: "var(--ok)", display: "flex", gap: 6, alignItems: "center" }}>
                    <span>👤 {linked.name}</span>
                    {linked.email && <span>· {linked.email}</span>}
                    {linked.phone && <span>· {linked.phone}</span>}
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ fontSize: 10, padding: "1px 6px", marginLeft: 4 }}
                      onClick={() => { setSelectedClientId(undefined); }}
                    >
                      Délier
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </Field>

          <Field label="Plateforme / Canal de vente">
            <input
              type="text"
              value={directPlatform}
              placeholder="Client direct, Vinted, Instagram, WhatsApp..."
              onChange={(e) => setDirectPlatform(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* Bloc Achat / Import Lot TCG & Cartes */}
      <div
        style={{
          marginTop: 12,
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          background: isTcgOrder ? "rgba(234, 179, 8, 0.08)" : "var(--surface-sub)",
          border: isTcgOrder ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isTcgOrder}
              onChange={(e) => setIsTcgOrder(e.target.checked)}
            />
            <span>🃏 Il s'agit d'un Achat / Lot TCG (Cartes, Boosters, Gradations)</span>
          </label>
          {isTcgOrder && (
            <span style={{ background: "#eab308", color: "#000", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12 }}>
              MODE TCG ACTIF
            </span>
          )}
        </div>

        {isTcgOrder && (
          <div className="fgrid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Field label="Licence TCG">
              <select value={tcgGameOrder} onChange={(e) => setTcgGameOrder(e.target.value)}>
                <option value="Pokémon">⚡ Pokémon</option>
                <option value="One Piece">🏴‍☠️ One Piece</option>
                <option value="Yu-Gi-Oh!">👁️ Yu-Gi-Oh!</option>
                <option value="Magic">🔮 Magic</option>
                <option value="Lorcana">✨ Lorcana</option>
                <option value="Dragon Ball">🐉 Dragon Ball</option>
              </select>
            </Field>

            <Field label="Extension / Set">
              <input
                type="text"
                value={tcgSetOrder}
                placeholder="Ex. 151, EV05, OP-05..."
                onChange={(e) => setTcgSetOrder(e.target.value)}
              />
            </Field>

            <Field label="Statut / Catégorie">
              <select
                value={tcgCategoryOrder}
                onChange={(e) => setTcgCategoryOrder(e.target.value as any)}
              >
                <option value="raw">🃏 Cartes Raw / Brut</option>
                <option value="grading">⏳ En gradation chez PSA/BGS (Note à découvrir ✨)</option>
                <option value="graded">🏆 Cartes Gradées (Note connue)</option>
                <option value="blister">🟡 Blister / Artsets (Boosters sous blister)</option>
                <option value="sealed">📦 Displays / ETB / Coffrets scellés</option>
                <option value="case">🧱 Cases / Cartons Scellés (Cases Displays/Blisters)</option>
              </select>
            </Field>

            {(tcgCategoryOrder === "grading" || tcgCategoryOrder === "graded") && (
              <Field label={tcgCategoryOrder === "grading" ? "Société de gradation" : "Grade attribué"}>
                {tcgCategoryOrder === "grading" ? (
                  <select value={gradingCompanyOrder} onChange={(e) => setGradingCompanyOrder(e.target.value)}>
                    <option value="PSA">PSA</option>
                    <option value="BGS">BGS</option>
                    <option value="PCA">PCA</option>
                    <option value="CGC">CGC</option>
                    <option value="SGS">SGS</option>
                  </select>
                ) : (
                  <select value={tcgGradeOrder} onChange={(e) => setTcgGradeOrder(e.target.value)}>
                    <option value="PSA 10 Gem Mint">PSA 10 Gem Mint</option>
                    <option value="PSA 9 Mint">PSA 9 Mint</option>
                    <option value="BGS 10 Pristine">BGS 10 Pristine</option>
                    <option value="PCA 10 Gem Mint">PCA 10 Gem Mint</option>
                    <option value="Autre">Autre grade</option>
                  </select>
                )}
              </Field>
            )}
          </div>
        )}
      </div>

      {isProMode && (
        <div className="fgrid" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
          <Field label="Arrivée prévue">
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="Transporteur">
            <input type="text" list="dl-order-carrier" value={carrier} placeholder="Mondial Relay…" onChange={(e) => setCarrier(e.target.value)} />
          </Field>
          <Field label="N° de suivi">
            <input type="text" value={tracking} placeholder="Numéro de colis" onChange={(e) => setTracking(e.target.value)} />
          </Field>
          <Field label={eurLabel("Frais de port / Livraison")}>
            <input type="number" step="0.01" value={shipping} placeholder="0,00" onChange={(e) => setShipping(e.target.value)} />
          </Field>
          <Field label={eurLabel("Douane / Taxe d'import")}>
            <input type="number" step="0.01" value={customs} placeholder="0,00" onChange={(e) => setCustoms(e.target.value)} />
          </Field>
          <Field label={eurLabel("Autres frais de livraison")}>
            <input type="number" step="0.01" value={handling} placeholder="Manutention, assurance…" onChange={(e) => setHandling(e.target.value)} />
          </Field>
          <Field label="Nom du lot">
            <input
              type="text"
              value={lotName}
              placeholder={source.trim() ? `${source.trim()} ${buyDate}` : "Ex. Lot Milan septembre"}
              onChange={(e) => setLotName(e.target.value)}
            />
          </Field>
          <Field label="Règlement fournisseur">
            <select value={purchasePaid ? "paye" : "du"} onChange={(e) => setPurchasePaid(e.target.value === "paye")}>
              <option value="paye">Payée</option>
              <option value="du">À régler</option>
            </select>
          </Field>
        </div>
      )}

      {isProMode && landedTotal > 0 && (
        <label className={`mode-switch${includeFeesInCost ? " on" : ""}`} style={{ marginTop: 12 }}>
          <input type="checkbox" checked={includeFeesInCost} onChange={(e) => setIncludeFeesInCost(e.target.checked)} />
          <div>
            <b>Inclure la livraison ({eur2(shippingTotal)}) et la taxe ({eur2(taxTotal)}) au prix d'achat unitaire</b>
            <div className="hint">
              {includeFeesInCost
                ? "Activé : La livraison et la taxe sont calculées au prorata et ajoutées directement au coût d'achat unitaire de chaque article."
                : "Désactivé : Le prix d'achat conserve la valeur unitaire brute sans frais. La livraison et la taxe restent calculées et ventilées séparément."}
            </div>
          </div>
        </label>
      )}

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
              <label className="line-photo" title="Photo de l'article attendu">
                {l.photoUrl ? <img src={l.photoUrl} alt="" /> : <span>◫</span>}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickPhoto(l.key, f);
                    e.target.value = "";
                  }}
                />
              </label>
              <input type="text" value={l.name} placeholder="Nom de l’article" onChange={(e) => patch(l.key, { name: e.target.value })} />
              {lines.length > 1 && (
                <button className="iconbtn del" title="Retirer" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))}>✕</button>
              )}
            </div>
            <div className="calc-line-grid">
              <label><span>Quantité</span><QtySelect value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} /></label>
              <label><span>{isTcgOrder ? "Licence" : "Marque"}</span><input type="text" list="dl-order-brand" value={l.brand} onChange={(e) => patch(l.key, { brand: e.target.value })} /></label>
              <label><span>Type</span><input type="text" list="dl-order-type" value={l.type} onChange={(e) => patch(l.key, { type: e.target.value })} /></label>
              <label>
                <span>{isTcgOrder ? "Grade" : "Taille"}</span>
                {isTcgOrder ? (
                  <input type="text" list="dl-order-size" value={l.size} onChange={(e) => patch(l.key, { size: e.target.value })} />
                ) : (
                  <SizeSelect value={l.size} onChange={(v) => patch(l.key, { size: v })} extra={suggestions.size} />
                )}
              </label>
              <label><span>{LABEL.cost}</span><input type="number" step="0.01" value={l.cost} placeholder="0,00" onChange={(e) => patch(l.key, { cost: e.target.value })} /></label>
              <label><span>{destination === "direct" ? "Prix de vente (€)" : LABEL.estimate}</span><input type="number" step="0.01" value={l.estimate} placeholder={HINT.estimate} onChange={(e) => patch(l.key, { estimate: e.target.value })} /></label>
            </div>
            {isProMode && landedTotal > 0 && num(l.cost) > 0 && (
              <div className="hint num" style={{ textAlign: "right" }}>
                🚚 Livraison : {eur2(shareShippingOf(l))} · 🏛️ Taxe : {eur2(shareTaxOf(l))} |{" "}
                {includeFeesInCost ? (
                  <b style={{ color: "var(--accent-glow)" }}>Coût unitaire net : {eur2(num(l.cost) + feePerUnit(l))} / un.</b>
                ) : (
                  <span>Frais séparés : {eur2(feePerUnit(l))} / un.</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setLines((l) => [...l, newLine()])}>
        + Ajouter un article
      </button>

      {isProMode && (
        <>
          <label className={`mode-switch${autoReceive ? " on" : ""}`}>
            <input type="checkbox" checked={autoReceive} onChange={(e) => setAutoReceive(e.target.checked)} />
            <div>
              <b>Réception automatique</b>
              <div className="hint">
                {expectedDate
                  ? `Les articles passeront seuls en stock le ${expectedDate.split("-").reverse().join("/")}.`
                  : "Renseignez une date d'arrivée pour que les articles entrent seuls en stock."}
              </div>
            </div>
          </label>

          <Field label="Notes de commande">
            <textarea rows={2} value={notes} placeholder="Numéro de commande, vendeur, remarque…" onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}

      <div>
        <div className="totrow">
          <span>{filled.reduce((a, l) => a + qtyOfLine(l), 0)} article{filled.reduce((a, l) => a + qtyOfLine(l), 0) > 1 ? "s" : ""} sur {filled.length} ligne{filled.length > 1 ? "s" : ""}</span>
          <b className="num">{eur2(goods)}</b>
        </div>
        {isProMode && shippingTotal > 0 && <div className="totrow"><span>🚚 Livraison &amp; Port</span><b className="num">+{eur2(shippingTotal)}</b></div>}
        {isProMode && taxTotal > 0 && <div className="totrow"><span>🏛️ Douanes &amp; Taxes d'importation</span><b className="num">+{eur2(taxTotal)}</b></div>}
        <div className="totrow big"><span>Total de la commande</span><b className="num">{eur2(total)}</b></div>
      </div>
    </Modal>
  );
}

