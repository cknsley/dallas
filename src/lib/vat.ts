import type { DocKind, LegalStatus, Settings } from "../types";
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

/** SARL, SAS et SASU partagent le même traitement : assujetties dès le premier euro. */
export const isSociete = (status: LegalStatus) => status === "sarl" || status === "sas" || status === "sasu";

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

  // Mode éteint : on ne calcule ni n'affiche de TVA, quel que soit le statut.
  if (!settings.vatEnabled) {
    return {
      ...base,
      subject: false,
      canInvoice: settings.legalStatus !== "rien",
      label: "Mode TVA désactivé",
      mention: "TVA non applicable.",
    };
  }

  if (settings.legalStatus === "rien") {
    return {
      ...base,
      subject: false,
      canInvoice: false,
      label: "Aucun statut — hors champ de la TVA",
      mention:
        "Vente entre particuliers — TVA non applicable. Ce document est une preuve de vente, il ne constitue pas une facture commerciale.",
    };
  }

  if (settings.legalStatus === "auto") {
    if (threshold > 0 && caYear > threshold) {
      return {
        ...base,
        subject: true,
        label: "Auto-entrepreneur — seuil dépassé, TVA due",
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
      label: "Auto-entrepreneur — franchise en base",
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

  const societeLabel = settings.legalStatus === "sasu" ? "SASU" : settings.legalStatus === "sas" ? "SAS" : "SARL";
  return {
    ...base,
    subject: true,
    label: `${societeLabel} — assujettie à la TVA`,
    mention:
      scheme === "marge"
        ? `TVA sur la marge bénéficiaire — art. 297 A du CGI (biens d'occasion). TVA non récupérable par l'acquéreur.`
        : `TVA au taux de ${rate} % sur le prix de vente.`,
  };
}

/** Libellé du document : une facture reste une facture, un reçu devient "preuve de vente" pour un statut particulier. */
export function docKindLabel(kind: DocKind, legalStatus: LegalStatus): string {
  if (kind === "facture") return "Facture";
  return legalStatus === "rien" ? "Preuve de vente" : "Reçu";
}

/** TVA due, calculée en dedans (les montants saisis sont TTC). */
export function vatDue(regime: VatRegime, totalTTC: number, marginTTC: number): number {
  if (!regime.subject) return 0;
  const base = regime.scheme === "marge" ? Math.max(0, marginTTC) : Math.max(0, totalTTC);
  return (base * regime.rate) / (100 + regime.rate);
}
