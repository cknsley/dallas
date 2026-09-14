import { useState } from "react";
import { Field, Modal, Photo, Segmented } from "../components/ui";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { CARRIERS, SHIPPING_LABEL } from "../lib/constants";
import { dfr, dshort, eur2, today } from "../lib/format";
import { revenueOf } from "../lib/calc";
import type { Item, Shipping } from "../types";

export default function DeliveryDetailModal({
  item,
  onClose,
  onOpenProductDetail,
  onOpenLitige,
}: {
  item: Item;
  onClose: () => void;
  onOpenProductDetail?: () => void;
  onOpenLitige?: () => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const [buyer, setBuyer] = useState(item.buyer || "");
  const [clientId, setClientId] = useState(item.clientId || "");
  const [platform, setPlatform] = useState(item.platform || "");
  const [buyerUrl, setBuyerUrl] = useState(item.buyerUrl || "");
  const [shippingLabelUrl, setShippingLabelUrl] = useState(item.shippingLabelUrl || item.buyerUrl || "");
  const [carrier, setCarrier] = useState(item.carrier || "");
  const [tracking, setTracking] = useState(item.tracking || "");
  const [shipDate, setShipDate] = useState(item.shipDate || "");
  const [shipDeadline, setShipDeadline] = useState(item.shipDeadline || "");
  const [shipping, setShipping] = useState<Shipping>(item.shipping || "en_preparation");
  const [notes, setNotes] = useState(item.notes || "");
  const [shippingVideo, setShippingVideo] = useState(item.shippingVideo || "");
  const [shippingVideoName, setShippingVideoName] = useState(item.shippingVideoName || "");

  // Auto-calculate suggested deadline if empty and item has saleDate
  const defaultDeadline = item.saleDate
    ? new Date(new Date(item.saleDate).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    : "";

  const activeDeadline = shipDeadline || defaultDeadline;

  const getDeadlineStatus = () => {
    if (!activeDeadline) return null;
    const now = today();
    if (activeDeadline < now) {
      return { label: `🚨 RETARD (date limite le ${dshort(activeDeadline)})`, color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" };
    }
    if (activeDeadline === now) {
      return { label: `⚡ AUJOURD'HUI (date limite d'envoi)`, color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
    }
    return { label: `📅 Date limite d'envoi : ${dshort(activeDeadline)}`, color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" };
  };

  const deadlineStatus = getDeadlineStatus();

  const handleVideoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setShippingVideo(reader.result as string);
      setShippingVideoName(file.name);
      toast("Vidéo d'envoi ajoutée");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const isNowRecu = shipping === "recu";
    dispatch({
      type: "patchItem",
      id: item.id,
      patch: {
        buyer: buyer.trim(),
        clientId: clientId || undefined,
        platform: platform.trim(),
        buyerUrl: buyerUrl.trim(),
        shippingLabelUrl: shippingLabelUrl.trim(),
        carrier: carrier.trim(),
        tracking: tracking.trim(),
        shipDate,
        shipDeadline,
        shipping,
        delivery: isNowRecu ? "livree" : item.delivery,
        validationDate: isNowRecu ? (item.validationDate || today()) : item.validationDate,
        notes: notes.trim(),
        shippingVideo,
        shippingVideoName,
      },
    });
    toast("Détails de livraison enregistrés");
    onClose();
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>🚚 Détails Livraison</span>
            <span className="pill info" style={{ fontSize: 11 }}>{SHIPPING_LABEL[shipping]}</span>
          </div>
          {onOpenProductDetail && (
            <button
              type="button"
              className="btn ghost sm"
              style={{ fontSize: 11 }}
              onClick={() => {
                onClose();
                onOpenProductDetail();
              }}
            >
              📦 Fiche produit ↗
            </button>
          )}
        </div>
      }
      wide
      onClose={onClose}
      footer={
        <>
          {onOpenLitige && (
            <button
              type="button"
              className="btn destructive"
              onClick={() => {
                onClose();
                onOpenLitige();
              }}
            >
              ⚠ Signaler un litige
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={handleSave}>
            Enregistrer les modifications
          </button>
        </>
      }
    >
      {/* Product Summary Header Card */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: 12,
          borderRadius: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
          <Photo id={item.photoId} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }} className="ellipsis">{item.name || "Sans nom"}</div>
          <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>
            {[item.brand, item.size && `Taille ${item.size}`, item.type].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 12, color: "var(--ink-2)" }}>
            <span>Prix de vente : <b className="num" style={{ color: "var(--accent-glow)" }}>{eur2(revenueOf(item))}</b></span>
            {item.saleDate && <span>Vendue le : <b>{dfr(item.saleDate)}</b></span>}
          </div>
        </div>
      </div>

      {/* Shipping Deadline Alert Banner */}
      {deadlineStatus && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: deadlineStatus.bg,
            color: deadlineStatus.color,
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{deadlineStatus.label}</span>
          <span style={{ fontWeight: 400, opacity: 0.85, fontSize: 11 }}>Calculé ou défini manuellement</span>
        </div>
      )}

      {/* Main Sections Grid */}
      <div className="fgrid" style={{ gap: 14 }}>
        {/* Section 1: Client & Plateforme */}
        <div className="span2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
            👤 Informations Client & Plateforme
          </div>
          <div className="fgrid">
            <Field label="Nom de l'acheteur">
              {state.clients.length > 0 ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={clientId || buyer}
                    onChange={(e) => {
                      const val = e.target.value;
                      const found = state.clients.find((c) => c.id === val || c.name === val);
                      if (found) {
                        setClientId(found.id);
                        setBuyer(found.name);
                        if (found.platform && !platform) setPlatform(found.platform);
                        if (found.profileUrl && !buyerUrl) setBuyerUrl(found.profileUrl);
                      } else {
                        setClientId("");
                        setBuyer(val);
                      }
                    }}
                  >
                    <option value="">-- Sélectionner ou saisir un acheteur --</option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>👤 {c.name} {c.platform ? `(${c.platform})` : ""}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={buyer}
                    placeholder="Saisie libre acheteur…"
                    onChange={(e) => {
                      setBuyer(e.target.value);
                      const match = state.clients.find((c) => c.name.toLowerCase() === e.target.value.toLowerCase());
                      setClientId(match?.id || "");
                    }}
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={buyer}
                  placeholder="Nom ou pseudo de l'acheteur"
                  onChange={(e) => setBuyer(e.target.value)}
                />
              )}
            </Field>

            <Field label="Plateforme de vente">
              <input
                type="text"
                value={platform}
                placeholder="Vinted, Vestiaire, Client direct, Instagram..."
                onChange={(e) => setPlatform(e.target.value)}
              />
            </Field>

            <Field label="Lien Profil Acheteur / Contact">
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="url"
                  value={buyerUrl}
                  placeholder="https://vinted.fr/member/..."
                  onChange={(e) => setBuyerUrl(e.target.value)}
                />
                {buyerUrl && (
                  <a className="btn sm ghost" href={buyerUrl} target="_blank" rel="noreferrer" title="Ouvrir le profil">
                    ↗
                  </a>
                )}
              </div>
            </Field>
          </div>
        </div>

        {/* Section 2: Bordereaux & Fichier d'envoi */}
        <div className="span2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
            📄 Bordereau & Fichiers de Livraison
          </div>
          <div className="fgrid">
            <Field label="Lien du bordereau / Étiquette d'envoi">
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="url"
                  value={shippingLabelUrl}
                  placeholder="Lien PDF du bordereau ou étiquette Vinted/Chronopost…"
                  onChange={(e) => setShippingLabelUrl(e.target.value)}
                />
                {shippingLabelUrl ? (
                  <a className="btn sm primary" href={shippingLabelUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                    Ouvrir bordereau ↗
                  </a>
                ) : null}
              </div>
            </Field>

            <Field label="Vidéo / Preuve d'emballage et d'envoi">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {shippingVideo ? (
                  <a className="btn sm ghost" href={shippingVideo} target="_blank" rel="noreferrer">
                    🎬 Voir la vidéo ({shippingVideoName || "preuve"})
                  </a>
                ) : (
                  <span className="hint" style={{ fontSize: 11 }}>Aucune vidéo d'envoi attachée</span>
                )}
                <label className="btn sm" style={{ flexShrink: 0 }}>
                  {shippingVideo ? "Remplacer" : "+ Ajouter vidéo"}
                  <input
                    type="file"
                    accept="video/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleVideoUpload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </Field>
          </div>
        </div>

        {/* Section 3: Transport & Délais */}
        <div className="span2" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>
            🚚 Logistique & Délais d'expédition
          </div>
          <div className="fgrid">
            <Field label="Transporteur">
              <input
                type="text"
                list="dl-carrier-list"
                value={carrier}
                placeholder="Mondial Relay, Colissimo, Chronopost..."
                onChange={(e) => setCarrier(e.target.value)}
              />
              <datalist id="dl-carrier-list">
                {CARRIERS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>

            <Field label="Numéro de suivi">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  value={tracking}
                  placeholder="Code de suivi colis"
                  onChange={(e) => setTracking(e.target.value)}
                />
                {tracking && <TrackingLink carrier={carrier} code={tracking} />}
              </div>
            </Field>

            <Field label="Date limite d'envoi">
              <input
                type="date"
                value={shipDeadline}
                onChange={(e) => setShipDeadline(e.target.value)}
              />
            </Field>

            <Field label="Date d'expédition effective">
              <input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Section 4: Avancement & Notes */}
        <div className="span2">
          <Field label="Avancement de l'expédition">
            <Segmented<Shipping>
              value={shipping}
              options={[
                { value: "en_preparation", label: "📦 À emballer" },
                { value: "a_deposer", label: "🚚 À déposer" },
                { value: "livree", label: "📫 En transit" },
                { value: "recu", label: "✓ Reçu / Bouclé" },
              ]}
              onChange={(s) => {
                setShipping(s);
                if ((s === "livree" || s === "a_deposer") && !shipDate) {
                  setShipDate(today());
                }
              }}
            />
          </Field>

          <Field label="Notes de livraison / Instructions spécifiques">
            <textarea
              rows={2}
              value={notes}
              placeholder="Point relais spécifique, heures de livraison, consignes particulières acheteur..."
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
