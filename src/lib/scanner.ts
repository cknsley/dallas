/** Utilitaires de détection de code-barres et analyse IA Vision pour le scanner iPhone. */

export interface ScannedProduct {
  brand: string;
  name: string;
  type: string;
  size: string;
  sku: string;
  cost?: number;
  photoUrl?: string;
  confidence: number;
  source: "barcode" | "vision";
}

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

/** Tente de détecter un code-barres sur un élément vidéo/canvas */
export async function scanBarcodeFromMedia(
  mediaEl: HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  if (typeof window !== "undefined" && window.BarcodeDetector) {
    try {
      const detector = new window.BarcodeDetector({
        formats: ["code_128", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"],
      });
      const barcodes = await detector.detect(mediaEl);
      if (barcodes && barcodes.length > 0) {
        return barcodes[0].rawValue || null;
      }
    } catch (e) {
      console.warn("BarcodeDetector error:", e);
    }
  }
  return null;
}

/** Base de données de démonstration / Lookups SKU connus */
const KNOWN_SKUS: Record<string, Partial<ScannedProduct>> = {
  "DD1391-100": { brand: "Nike", name: "Dunk Low Retro White Black Panda", type: "Sneakers", sku: "DD1391-100", size: "EU 43" },
  "DZ5485-052": { brand: "Jordan", name: "Air Jordan 1 High OG Medium Olive", type: "Sneakers", sku: "DZ5485-052", size: "EU 42.5" },
  "GW3774": { brand: "Adidas", name: "Yeezy Boost 350 V2 Onyx", type: "Sneakers", sku: "GW3774", size: "EU 44" },
  "195244123456": { brand: "Nike", name: "Air Force 1 '07 Triple White", type: "Sneakers", sku: "CW2288-111", size: "US 10 / EU 44" },
};

/** Recherche un produit à partir d'un code-barres ou d'un SKU */
export function lookupBarcodeOrSku(code: string): ScannedProduct {
  const cleanCode = code.trim().toUpperCase();
  const match = KNOWN_SKUS[cleanCode];

  if (match) {
    return {
      brand: match.brand || "Marque reconnue",
      name: match.name || "Modèle scanné",
      type: match.type || "Sneakers",
      size: match.size || "EU 42",
      sku: match.sku || cleanCode,
      confidence: 0.98,
      source: "barcode",
    };
  }

  // Fallback si le code-barres n'est pas dans la base locale
  return {
    brand: cleanCode.startsWith("1") ? "Nike" : cleanCode.startsWith("4") ? "Adidas" : "Marque Scannée",
    name: `Produit Scanné (${cleanCode})`,
    type: "Sneakers",
    size: "Taille à vérifier",
    sku: cleanCode,
    confidence: 0.85,
    source: "barcode",
  };
}

/** Analyse visuelle d'une photo par l'IA Vision */
export async function analyzeImageWithVisionAI(
  canvas: HTMLCanvasElement
): Promise<ScannedProduct> {
  // Simule l'appel IA Vision ultra-rapide (500ms) avec extraction de caractéristiques visuelles
  await new Promise((res) => setTimeout(res, 600));

  // Exemples d'analyse de forme / couleur
  const ctx = canvas.getContext("2d");
  let avgBrightness = 128;
  if (ctx) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += data[i];
    }
    avgBrightness = sum / (data.length / 16);
  }

  const isDark = avgBrightness < 110;

  return {
    brand: isDark ? "Jordan" : "Nike",
    name: isDark ? "Air Jordan 1 Retro High OG Black" : "Dunk Low White / Platinum",
    type: "Sneakers",
    size: "EU 42.5",
    sku: isDark ? "555088-010" : "DD1503-101",
    confidence: 0.92,
    source: "vision",
  };
}
