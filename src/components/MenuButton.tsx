import { useEffect, useRef, useState } from "react";

export interface MenuOption {
  value: string;
  label: string;
  note?: string;
}

/** Bouton qui ouvre un choix : une action, plusieurs manières de la faire. */
export default function MenuButton({
  label, options, onSelect, className = "btn primary",
}: {
  label: string;
  options: MenuOption[];
  onSelect: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-button" ref={ref}>
      <button className={className} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {label} <span className="menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {options.map((o) => (
            <button
              key={o.value}
              role="menuitem"
              className="menu-item"
              onClick={() => { setOpen(false); onSelect(o.value); }}
            >
              <span>{o.label}</span>
              {o.note && <small>{o.note}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
