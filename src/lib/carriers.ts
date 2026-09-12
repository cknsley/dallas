/**
 * Liens de suivi. Aucune API n'est appelée : on construit l'URL publique du
 * transporteur à partir du numéro déjà saisi. C'est ce qui marche sans serveur
 * relais ni clé d'accès.
 *
 * Ces adresses peuvent changer côté transporteur ; elles sont modifiables dans
 * les réglages de facturation.
 */
export const DEFAULT_TRACKING_URLS: Record<string, string> = {
  "Colissimo": "https://www.laposte.fr/outils/suivre-vos-envois?code={code}",
  "La Poste": "https://www.laposte.fr/outils/suivre-vos-envois?code={code}",
  "Chronopost": "https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={code}",
  "Mondial Relay": "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition={code}",
  "Relais Colis": "https://www.relaiscolis.com/suivi-de-colis/",
  "UPS": "https://www.ups.com/track?tracknum={code}",
  "DHL": "https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={code}",
  "DPD": "https://www.dpd.fr/trace/{code}",
};

/** URL de suivi pour un transporteur et un numéro, ou null si on ne sait pas. */
export function trackingUrl(
  carrier: string,
  code: string,
  overrides: Record<string, string> = {},
): string | null {
  const clean = code.trim();
  if (!clean) return null;
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("www.")) return `https://${clean}`;

  const table = { ...DEFAULT_TRACKING_URLS, ...overrides };
  const key = Object.keys(table).find((k) => k.toLowerCase() === carrier.trim().toLowerCase());
  if (!key) return null;

  const pattern = table[key];
  if (!pattern) return null;
  return pattern.includes("{code}") ? pattern.replace("{code}", encodeURIComponent(clean)) : pattern;
}
