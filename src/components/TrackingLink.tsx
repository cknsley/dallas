import { useStore } from "../store/StoreContext";
import { trackingUrl } from "../lib/carriers";

/** Numéro de suivi cliquable : ouvre la page du transporteur quand on la connaît. */
export default function TrackingLink({ carrier, code }: { carrier: string; code: string }) {
  const { state } = useStore();
  if (!code.trim()) return <span className="hint">—</span>;

  const url = trackingUrl(carrier, code, state.settings.trackingUrls);
  if (!url) return <span className="num" style={{ fontSize: 12 }}>{code}</span>;

  return (
    <a
      className="tracking-link num"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={`Suivre le colis sur le site ${carrier}`}
    >
      {code} ↗
    </a>
  );
}
