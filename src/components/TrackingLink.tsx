import { useStore } from "../store/StoreContext";
import { trackingUrl } from "../lib/carriers";

/** Numéro de suivi cliquable : ouvre la page du transporteur quand on la connaît. */
export default function TrackingLink({ carrier, code }: { carrier: string; code: string }) {
  const { state } = useStore();
  const raw = code.trim();
  if (!raw) return null;

  const url =
    trackingUrl(carrier, raw, state.settings.trackingUrls) ||
    (raw.startsWith("http") || raw.startsWith("www.")
      ? raw.startsWith("www.")
        ? `https://${raw}`
        : raw
      : `https://www.google.com/search?q=${encodeURIComponent(raw)}`);

  return (
    <a
      className="tracking-link"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 9px",
        borderRadius: "var(--r-sm)",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        fontSize: 11.5,
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title="Ouvrir le suivi"
    >
      🔗 Lien ↗
    </a>
  );
}
