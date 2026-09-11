import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useTheme } from "./Theme";

export const ROUTES = [
  { path: "/", label: "Dashboard", icon: "◧", subtitle: "Vue d'ensemble de l'activité", end: true },
  { path: "/todo", label: "Todo", icon: "☑", subtitle: "À acheter, à faire, à envoyer" },
  { path: "/stock", label: "Stock", icon: "▦", subtitle: "Ce que vous possédez : arrivages et pièces en stock" },
  { path: "/livraison", label: "Livraison", icon: "⇄", subtitle: "Ce qu'il reste à envoyer et à recevoir" },
  { path: "/ventes", label: "Ventes", icon: "↗", subtitle: "Historique et suivi des livraisons" },
  { path: "/charges", label: "Charges", icon: "◈", subtitle: "Matériel, emballages et abonnements de l'activité" },
  { path: "/marge", label: "Marge", icon: "%", subtitle: "Capital engagé, marge nette et simulations" },
  { path: "/facturation", label: "Facturation", icon: "§", subtitle: "Factures, reçus et régime de TVA" },
];

/** Actions injectées par la page courante dans la barre supérieure. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("topbar-actions")), []);
  return el ? createPortal(children, el) : null;
}

export default function Layout() {
  const { state, sync } = useStore();
  const theme = useTheme();
  const { pathname } = useLocation();
  const current = ROUTES.find((r) => (r.end ? pathname === r.path : pathname.startsWith(r.path))) ?? ROUTES[0];

  const badges: Record<string, number> = {
    "/stock": state.items.filter((i) => i.status !== "vendu").length,
    "/ventes": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/livraison":
      state.items.filter((i) => i.status === "arrivage").length +
      state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": state.todos.filter((t) => t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <b>Atelier</b>
          <span>Achat · Revente</span>
        </div>
        <nav className="nav">
          {ROUTES.map((r) => (
            <NavLink key={r.path} to={r.path} end={r.end}>
              <span className="ic">{r.icon}</span>
              {r.label}
              {badges[r.path] ? <span className="badge">{badges[r.path]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="sync" title={sync.detail}>
            <span className={`dot ${sync.status}`} />
            <span>
              {sync.label}
              <br />
              <span style={{ opacity: 0.75 }}>{sync.detail}</span>
            </span>
          </div>
          <button className="btn ghost" style={{ justifyContent: "flex-start" }} onClick={theme.cycle}>
            {theme.glyph} {theme.label}
          </button>
        </div>
      </aside>

      <div className="main">
        <nav className="mobnav">
          {ROUTES.map((r) => (
            <NavLink key={r.path} to={r.path} end={r.end}>{r.label}</NavLink>
          ))}
        </nav>
        <header className="topbar">
          <div>
            <h1>{current.label}</h1>
            <div className="sub">{current.subtitle}</div>
          </div>
          <div className="spacer" />
          <div className="topbar-actions" id="topbar-actions" />
        </header>
        <main className="view">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
