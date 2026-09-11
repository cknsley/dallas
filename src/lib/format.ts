export const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

export const eur = (v: number, compact = true): string =>
  (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: compact && Math.abs(v) >= 1000 ? 0 : 2,
    minimumFractionDigits: compact && Math.abs(v) >= 1000 ? 0 : 2,
  });

export const eur2 = (v: number): string => eur(v, false);

export const pct = (v: number): string =>
  (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";

export const today = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const dfr = (d: string | undefined | null): string =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const dfrLong = (d: string): string =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

/** Date compacte pour les tableaux : 10/09/26 */
export const dshort = (d: string | undefined | null): string =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  }) : "—";
