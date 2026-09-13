import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X, ArrowRight, ImageOff, LucideIcon } from "lucide-react";
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
          <button className="btn ghost" onClick={onClose} aria-label="Fermer le dialogue">
            <X size={18} />
          </button>
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
  label, value, meta, tone, to, hint, onClick, featured,
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "ok" | "warn" | "info";
  featured?: boolean;
  to?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const className = `kpi${tone ? " " + tone : ""}${featured ? " featured" : ""}`;
  const body = (
    <>
      {(to || onClick) && (
        <span className="go" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {hint ?? "Ouvrir"} <ArrowRight size={13} />
        </span>
      )}
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`${className} clickable-kpi`}
        onClick={onClick}
        style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
      >
        {body}
      </button>
    );
  }
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
export function Empty({
  glyph, icon: Icon, title, children,
}: {
  glyph?: string;
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="glyph" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon ? <Icon size={28} /> : glyph ?? "📦"}
      </div>
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

export function Photo({
  id, className = "thumb", alt = "", style,
}: {
  id: string | null;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const url = usePhoto(id);
  if (!url) {
    return (
      <div
        className={`${className} placeholder`}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
        aria-hidden="true"
      >
        <ImageOff size={16} style={{ opacity: 0.5 }} />
      </div>
    );
  }
  return <img className={className} src={url} alt={alt} style={style} />;
}

export function PhotoCover({ id }: { id: string | null }) {
  const url = usePhoto(id);
  return url ? <img src={url} alt="" /> : <ImageOff size={16} style={{ opacity: 0.5 }} />;
}

/* ---------- Liste de barres ---------- */
export function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; note?: string; display: string; to?: string }[];
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <div className="bars" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const inner = (
          <>
            <div className="b-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <span className="b-lbl" style={{ fontWeight: 600, color: "var(--ink)" }}>{r.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                {r.note && <span className="b-note" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.note}</span>}
                <span className="b-val" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--accent)" }}>{r.display}</span>
              </div>
            </div>
            <div className="b-track" style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
              <div className="b-fill" style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "var(--accent)" }} />
            </div>
          </>
        );
        return r.to ? (
          <Link key={r.key} to={r.to} className="bar-row" style={{ textDecoration: "none", display: "block" }}>
            {inner}
          </Link>
        ) : (
          <div key={r.key} className="bar-row" style={{ display: "block" }}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
