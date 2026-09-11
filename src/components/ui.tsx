import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { photoURL, subscribePhotos } from "../store/photos";
import type { ItemStatus } from "../types";
import { STATUS_LABEL } from "../lib/constants";

/* ---------- Modal ---------- */
export function Modal({
  title, onClose, children, footer, wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-h">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Confirmation ---------- */
export function Confirm({
  title, body, confirmLabel = "Supprimer", onConfirm, onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn destructive" onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div>{body}</div>
    </Modal>
  );
}

/* ---------- Champ de formulaire ---------- */
export function Field({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={`field${span ? " span2" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------- KPI ---------- */
export function Kpi({
  label, value, meta, tone, to, hint,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "ok" | "warn" | "info";
  /** Destination ouverte au clic — le chiffre mène à la liste qu'il résume. */
  to?: string;
  hint?: string;
}) {
  const className = `kpi${tone ? " " + tone : ""}`;
  const body = (
    <>
      {to && <span className="go" aria-hidden="true">{hint ?? "Ouvrir"} →</span>}
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </>
  );
  if (!to) return <div className={className}>{body}</div>;
  return (
    <Link className={className} to={to}>
      {body}
    </Link>
  );
}

/* ---------- Pastilles ---------- */
export function StatusPill({ status }: { status: ItemStatus }) {
  return <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

/* ---------- Sélecteur segmenté ---------- */
export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? "on" : ""}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- État vide ---------- */
export function Empty({ glyph, title, children }: { glyph: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph">{glyph}</div>
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

/* ---------- Photo depuis IndexedDB ---------- */
function usePhoto(id: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribePhotos,
    () => photoURL(id),
    () => null,
  );
}

export function Photo({ id, className = "thumb", alt = "" }: { id: string | null; className?: string; alt?: string }) {
  const url = usePhoto(id);
  if (!url) return <div className={`${className} placeholder`} aria-hidden="true">◫</div>;
  return <img className={className} src={url} alt={alt} />;
}

export function PhotoCover({ id }: { id: string | null }) {
  const url = usePhoto(id);
  return url ? <img src={url} alt="" /> : <>◫</>;
}

/* ---------- Liste de barres ---------- */
export function BarList({ rows }: { rows: { key: string; label: string; value: number; note?: string; display: string }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.key}>
          <div className="bl" title={r.label}>{r.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${max > 0 ? Math.max(1.5, (r.value / max) * 100) : 1.5}%` }} />
          </div>
          <div className="bv">
            {r.display}
            {r.note && <span style={{ color: "var(--ink-3)" }}> · {r.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
