import type { Settings } from "../types";
import { eur, pct } from "./format";

export const VAT_BY_COUNTRY: Record<string, number> = {
  FR: 20, BE: 21, CH: 8.1, LU: 17, DE: 19, ES: 21, IT: 22,
  NL: 21, PT: 23, GB: 20, CA: 0, US: 0, OTHER: 20,
};

export const COUNTRIES: [string, string][] = [
  ["FR", "France"], ["BE", "Belgique"], ["CH", "Suisse"], ["LU", "Luxembourg"],
  ["DE", "Allemagne"], ["ES", "Espagne"], ["IT", "Italie"], ["NL", "Pays-Bas"],
  ["PT", "Portugal"], ["GB", "Royaume-Uni"], ["CA", "Canada"], ["US", "États-Unis"],
  ["OTHER", "Autre"],
];

export interface VatAlert {
  level: "warn" | "bad";
  title: string;
  text: string;
}

export interface VatRegime {
  /** assujetti à la TVA */
  subject: boolean;
  /** droit d'émettre une facture (interdit au particulier) */
  canInvoice: boolean;
  rate: number;
  scheme: "marge" | "total";
  threshold: number;
  ca: number;
  mention: string;
  alert: VatAlert | null;
  label: string;
}

/**
 * Moteur de TVA : déduit le régime applicable du statut juridique,
 * du pays et du chiffre d'affaires annuel déjà réalisé.
 */
export function vatRegime(settings: Settings, caYear: number): VatRegime {
  const rate = settings.vatRate > 0 ? settings.vatRate : VAT_BY_COUNTRY[settings.country] ?? 20;
  const scheme: "marge" | "total" = settings.marginScheme ? "marge" : "total";
  const threshold = settings.threshold;
  const base: VatRegime = {
    subject: false, canInvoice: true, rate, scheme, threshold, ca: caYear,
    mention: "", alert: null, label: "",
  };

  if (settings.legalStatus === "particulier") {
    return {
      ...base,
      subject: false,
      canInvoice: false,
      label: "Particulier — hors champ de la TVA",
      mention:
        "Vente entre particuliers — TVA non applicable. Ce document est un reçu, il ne constitue pas une facture commerciale.",
    };
  }

  if (settings.legalStatus === "micro") {
    if (threshold > 0 && caYear > threshold) {
      return {
        ...base,
        subject: true,
        label: "Micro-entreprise — seuil dépassé, TVA due",
        mention:
          scheme === "marge"
            ? `TVA sur la marge bénéficiaire — art. 297 A du CGI. Taux ${rate} %.`
            : `TVA au taux de ${rate} % sur le prix de vente.`,
        alert: {
          level: "bad",
          title: "Seuil de franchise dépassé",
          text: `${eur(caYear)} réalisés pour un seuil de ${eur(threshold)}. La TVA est due sur les ventes qui suivent le dépassement.`,
        },
      };
    }
    const ratio = threshold > 0 ? (caYear / threshold) * 100 : 0;
    return {
      ...base,
      subject: false,
      label: "Micro-entreprise — franchise en base",
      mention: "TVA non applicable, art. 293 B du CGI.",
      alert:
        threshold > 0 && ratio >= 80
          ? {
              level: "warn",
              title: "Approche du seuil de franchise",
              text: `${eur(caYear)} sur ${eur(threshold)} — ${pct(ratio)} du seuil atteint.`,
            }
          : null,
    };
  }

  return {
    ...base,
    subject: true,
    label: "Société — assujettie à la TVA",
    mention:
      scheme === "marge"
        ? `TVA sur la marge bénéficiaire — art. 297 A du CGI (biens d'occasion). TVA non récupérable par l'acquéreur.`
        : `TVA au taux de ${rate} % sur le prix de vente.`,
  };
}

/** TVA due, calculée en dedans (les montants saisis sont TTC). */
export function vatDue(regime: VatRegime, totalTTC: number, marginTTC: number): number {
  if (!regime.subject) return 0;
  const base = regime.scheme === "marge" ? Math.max(0, marginTTC) : Math.max(0, totalTTC);
  return (base * regime.rate) / (100 + regime.rate);
}
