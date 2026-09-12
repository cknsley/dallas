import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Modal } from "./ui";
import {
  scanBarcodeFromMedia,
  lookupBarcodeOrSku,
  analyzeImageWithVisionAI,
  type ScannedProduct,
} from "../lib/scanner";
import { useStore } from "../store/StoreContext";
import { today } from "../lib/format";
import { uid } from "../lib/id";
import { useToast } from "./Toast";
import type { Item } from "../types";

export default function ScannerModal({
  onClose,
  onItemAdded,
}: {
  onClose: () => void;
  onItemAdded?: (item: Item) => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [scanning, setScanning] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedProduct, setDetectedProduct] = useState<ScannedProduct | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Formulaire d'ajustement du produit scanné
  const [costInput, setCostInput] = useState("");
  const [feesInput, setFeesInput] = useState("");
  const [lotInput, setLotInput] = useState("");
  const [manualCode, setManualCode] = useState("");

  // Démarrage de la caméra iPhone (WebRTC facingMode: environment)
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        activeStream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn("Impossible d'accéder à la caméra:", err);
        setCameraError("Caméra non disponible. Vous pouvez utiliser l'analyse par photo ou saisir le SKU.");
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Code-barres trouvé !
  const handleCodeDetected = (code: string) => {
    const prod = lookupBarcodeOrSku(code);
    setDetectedProduct(prod);
    setScanning(false);
    toast(`🎯 Code détecté : ${code}`);
  };

  // Boucle de scan en direct du code-barres
  useEffect(() => {
    let interval: any = null;
    if (scanning && !detectedProduct && !analyzing && videoRef.current) {
      interval = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const code = await scanBarcodeFromMedia(videoRef.current);
        if (code) {
          handleCodeDetected(code);
        }
      }, 400);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scanning, detectedProduct, analyzing]);

  // Déclencheur photo IA Vision
  const handleCaptureVisionAI = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setAnalyzing(true);
    setScanning(false);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const prod = await analyzeImageWithVisionAI(canvas);
      setDetectedProduct(prod);
      toast("✨ Analyse IA Vision terminée !");
    }
    setAnalyzing(false);
  };

  // Soumission manuelle de code / SKU
  const handleManualCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleCodeDetected(manualCode.trim());
    setManualCode("");
  };

  // Validation et entrée directe en stock !
  const handleConfirmStock = () => {
    if (!detectedProduct) return;

    const newItem: Item = {
      id: uid(),
      name: detectedProduct.name,
      brand: detectedProduct.brand,
      type: detectedProduct.type || "Sneakers",
      size: detectedProduct.size,
      source: "Scanner Caméra Arrivage",
      quantity: 1,
      cost: parseFloat(costInput) || 0,
      fees: parseFloat(feesInput) || 0,
      price: 0,
      platform: "",
      buyer: "",
      buyerUrl: "",
      saleFees: 0,
      shippingCost: 0,
      shippingPaid: 0,
      status: "stock",
      buyDate: today(),
      receiveDate: today(),
      saleDate: "",
      delivery: "non_payee",
      notes: `Scanné via ${detectedProduct.source === "vision" ? "IA Vision" : "Code-barres"} (SKU: ${detectedProduct.sku})`,
      photoId: null,
      createdAt: Date.now(),
      carrier: "",
      tracking: "",
      expectedDate: "",
      shipDate: "",
      shipping: "en_preparation",
      orderId: "",
      purchasePaid: true,
      lotTag: lotInput.trim() || `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
      autoReceive: false,
    };

    dispatch({ type: "upsertItem", item: newItem });
    toast(`✓ « ${newItem.brand} ${newItem.name} » entré en Stock !`);
    if (onItemAdded) onItemAdded(newItem);

    // Reprise immédiate du scan pour le produit suivant (Mode Déballage Massif)
    setDetectedProduct(null);
    setCostInput("");
    setFeesInput("");
    setScanning(true);
  };

  const viewportStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: 300,
    borderRadius: 14,
    background: "#000",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const viewfinderStyle: CSSProperties = {
    position: "absolute",
    width: 220,
    height: 140,
    border: detectedProduct ? "2px dashed var(--ok)" : "2px dashed var(--accent)",
    borderRadius: 16,
    boxShadow: detectedProduct
      ? "0 0 0 9999px rgba(0, 0, 0, 0.45), 0 0 20px rgba(16, 185, 129, 0.5)"
      : "0 0 0 9999px rgba(0, 0, 0, 0.45), 0 0 20px rgba(139, 92, 246, 0.4)",
    pointerEvents: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  };

  const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    background: "rgba(0,0,0,0.6)",
    padding: "2px 8px",
    borderRadius: 10,
  };

  const captureBtnStyle: CSSProperties = {
    position: "absolute",
    bottom: 12,
    right: 12,
    padding: "6px 14px",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  };

  const resultContainerStyle: CSSProperties = {
    padding: 14,
    borderRadius: 14,
    background: "var(--surface-2)",
    border: "1px solid var(--line-2)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const footerContent = (
    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", width: "100%", alignItems: "center" }}>
      <span className="hint" style={{ fontSize: 12 }}>
        {detectedProduct
          ? (detectedProduct.source === "vision" ? "Source: IA Vision" : "Source: Code-barres natif")
          : "Visez le code-barres de la boîte ou prenez une photo"}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>
          Fermer
        </button>
        {detectedProduct && (
          <button className="btn primary" onClick={handleConfirmStock}>
            ⚡ Entrer en Stock & Scanner Suivant →
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      title="📸 Scanner Caméra iPhone & IA Vision"
      onClose={onClose}
      wide
      footer={footerContent}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Zone Viseur Caméra */}
        <div style={viewportStyle}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Overlay Viseur Néon */}
          <div style={viewfinderStyle}>
            <span style={badgeStyle}>
              {analyzing
                ? "Analyse IA Vision..."
                : detectedProduct
                ? "✓ Produit reconnu"
                : "Visez le code-barres"}
            </span>
          </div>

          {/* Action Photo IA sur la vidéo */}
          <button
            className="btn primary"
            onClick={handleCaptureVisionAI}
            disabled={analyzing}
            style={captureBtnStyle}
          >
            {analyzing ? "⏳ Analyse..." : "📸 Analyser photo (IA Vision)"}
          </button>
        </div>

        {cameraError && (
          <div className="note warn" style={{ fontSize: 12 }}>
            <span className="glyph">⚠</span>
            <div>{cameraError}</div>
          </div>
        )}

        {/* Saisie manuelle SKU secours */}
        {!detectedProduct && (
          <form onSubmit={handleManualCodeSubmit} style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Ou saisissez un code-barres / SKU (ex. DD1391-100)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn">
              Rechercher SKU
            </button>
          </form>
        )}

        {/* Résultat détecté / Pré-remplissage */}
        {detectedProduct && (
          <div style={resultContainerStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span className="pill ok" style={{ fontSize: 11, marginBottom: 4 }}>
                  {detectedProduct.source === "vision" ? "✨ Reconnue par IA Vision" : "🎯 Code-barres Validé"}
                </span>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {detectedProduct.brand} {detectedProduct.name}
                </div>
                <div className="hint">
                  SKU: <b>{detectedProduct.sku}</b> · Taille: <b>{detectedProduct.size}</b>
                </div>
              </div>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setDetectedProduct(null);
                  setScanning(true);
                }}
              >
                Re-scanner ↺
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 4 }}>
              <label className="field">
                <span>Coût d'achat (€)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Frais d'approche (€)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={feesInput}
                  onChange={(e) => setFeesInput(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Tag Lot / Emplacement</span>
                <input
                  type="text"
                  placeholder="ex. BAC-A1"
                  value={lotInput}
                  onChange={(e) => setLotInput(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
