import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X, ArrowRight, CalendarDays, ChevronDown, ImageOff, LucideIcon } from "lucide-react";
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus sur le 1er champ texte du modal (.modal-b), en donnant la priorité aux inputs texte sur les sélecteurs fléchés
    const bodyEl = ref.current?.querySelector<HTMLElement>(".modal-b");
    const targetEl =
      bodyEl?.querySelector<HTMLElement>("[autofocus]") ||
      bodyEl?.querySelector<HTMLElement>("input[type='text'], input[type='search'], input:not([type='hidden']), textarea") ||
      bodyEl?.querySelector<HTMLElement>("select, button");
    targetEl?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-h">
          <h2>{title}</h2>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Fermer le dialogue">
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

/** Bloc repliable : un titre cliquable, des actions à droite, un contenu qu'on masque. */
export function Section({
  title, children, defaultOpen = true, right,
}: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="linkish"
          style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 14 }}
        >
          <ChevronDown
            size={15}
            style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }}
          />
          {title}
        </button>
        <div className="spacer" />
        {open && right}
      </div>
      {open && children}
    </div>
  );
}

/** Sélecteur de période : un seul bouton, un panneau avec raccourcis et plage libre. */
export function RangePicker({
  from, to, onChange,
}: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const [open, setOpen] = useState(false);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const presets = [
    { label: "Ce mois-ci", make: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
    } },
    { label: "Mois dernier", make: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) };
    } },
    { label: "30 derniers jours", make: () => {
      const n = new Date(); const f = new Date(); f.setDate(f.getDate() - 29);
      return { from: iso(f), to: iso(n) };
    } },
    { label: "Ce trimestre", make: () => {
      const n = new Date(); const q = Math.floor(n.getMonth() / 3) * 3;
      return { from: iso(new Date(n.getFullYear(), q, 1)), to: iso(new Date(n.getFullYear(), q + 3, 0)) };
    } },
    { label: "Cette année", make: () => {
      const n = new Date();
      return { from: iso(new Date(n.getFullYear(), 0, 1)), to: iso(new Date(n.getFullYear(), 11, 31)) };
    } },
    { label: "Depuis le début", make: () => ({ from: "2000-01-01", to: iso(new Date()) }) },
  ];

  const fr = (d: string) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "");
  const active = presets.find((p) => { const r = p.make(); return r.from === from && r.to === to; });
  const label = active ? active.label : `${fr(from)} → ${fr(to)}`;

  return (
    <div className="rp">
      <button type="button" className="rp-trigger" onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={14} />
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <>
          <div className="rp-backdrop" onClick={() => setOpen(false)} />
          <div className="rp-pop">
            <div className="rp-presets">
              {presets.map((p) => {
                const isOn = active?.label === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={isOn ? "on" : ""}
                    onClick={() => { onChange(p.make()); setOpen(false); }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="rp-custom">
              <label>
                <span>Du</span>
                <input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} />
              </label>
              <label>
                <span>Au</span>
                <input type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
