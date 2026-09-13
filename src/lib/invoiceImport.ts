import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore -- Vite résout ce fichier binaire en URL servable, pas en module JS typé.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface ParsedInvoiceLine {
  label: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedInvoice {
  supplier: string;
  date: string;
  lines: ParsedInvoiceLine[];
  rawText: string;
}

/** Lit le texte d'un PDF (pas d'OCR : ne fonctionne que sur un PDF avec du texte, pas une photo scannée). */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(line);
  }
  return pages.join("\n");
}

const NOISE_WORDS = [
  "total", "sous-total", "sous total", "tva", "t.v.a", "remise", "livraison", "frais de port",
  "shipping", "subtotal", "vat", "discount", "montant", "solde", "net à payer", "iban", "siret",
  "page ", "facture n", "invoice", "date d'échéance", "conditions de paiement",
];

const MONEY = /(\d{1,3}(?:[ .]\d{3})*|\d+)[.,](\d{2})\s*(?:€|eur)?/i;

const isNoise = (line: string) => {
  const l = line.toLowerCase();
  return NOISE_WORDS.some((w) => l.includes(w));
};

const toNumber = (whole: string, cents: string) => Number(`${whole.replace(/[ .]/g, "")}.${cents}`);

/** Trouve un motif date (jj/mm/aaaa ou aaaa-mm-jj) dans le texte, renvoyé au format aaaa-mm-jj. */
function findDate(text: string): string {
  const fr = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  return "";
}

/**
 * Extraction par motifs, pas par IA : fonctionne sur des factures texte structurées
 * (une ligne = un article, avec quantité et prix). Les mises en page en colonnes ou
 * en tableau complexe passeront à côté — la relecture avant validation reste nécessaire.
 */
export function parseInvoiceText(text: string): ParsedInvoice {
  const rawLines = text
    .split(/\n|(?=\s{3,}\d)/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lines: ParsedInvoiceLine[] = [];

  for (const line of rawLines) {
    if (isNoise(line)) continue;
    const moneyMatches = [...line.matchAll(new RegExp(MONEY, "gi"))];
    if (moneyMatches.length === 0) continue;

    // Le dernier montant de la ligne est le plus souvent le prix (total ou unitaire).
    const priceMatch = moneyMatches[moneyMatches.length - 1];
    const price = toNumber(priceMatch[1], priceMatch[2]);
    if (price <= 0) continue;

    const before = line.slice(0, priceMatch.index).trim();
    if (!before || before.length < 2) continue;

    // Motif « <qté> x <libellé> » ou « <libellé> x<qté> » au début/milieu.
    const qtyMatch = before.match(/(?:^|\s)(\d{1,3})\s*[x×]\s*/i) || before.match(/[x×]\s*(\d{1,3})\s*$/i);
    const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;
    const label = before.replace(/(?:^|\s)\d{1,3}\s*[x×]\s*/i, " ").replace(/[x×]\s*\d{1,3}\s*$/i, " ").trim();
    if (!label || /^\d+$/.test(label)) continue;

    // Si deux montants et qty>1, le premier est probablement le prix unitaire.
    const unitPrice = moneyMatches.length >= 2 && quantity > 1
      ? toNumber(moneyMatches[0][1], moneyMatches[0][2])
      : quantity > 1 ? price / quantity : price;

    lines.push({ label, quantity, unitPrice: Math.round(unitPrice * 100) / 100 });
  }

  const supplierLine = rawLines.find((l) => l.length > 2 && l.length < 60 && !isNoise(l) && !MONEY.test(l));

  return {
    supplier: supplierLine ?? "",
    date: findDate(text),
    lines,
    rawText: text,
  };
}
