export const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

export const eur = (v: number): string => {
  const val = Number.isFinite(v) ? v : 0;
  const hasCents = Math.abs(val % 1) > 0.001;
  return val.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: hasCents ? 2 : 0,
    minimumFractionDigits: hasCents ? 2 : 0,
  });
};

export const eur2 = (v: number): string => eur(v);

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
        month: "2-digit",
        year: "numeric",
      })
    : "—";

export const dfrLong = (d: string): string =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

/** Date compacte pour les tableaux : 09/12/2026 */
export const dshort = (d: string | undefined | null): string =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
