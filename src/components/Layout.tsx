import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { useTheme } from "./Theme";

export interface NavRoute {
  path: string;
  label: string;
  icon: string;
  subtitle: string;
  end?: boolean;
}

const MODULE_BY_PATH = {
  "/clients": "clients",
  "/sav": "sav",
  "/facturation": "facturation",
} as const;

/** La navigation est groupée : piloter, acheter, vendre, compter. */
export const NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Pilotage",
    routes: [
      { path: "/", label: "Dashboard", icon: "◧", subtitle: "Vue d'ensemble de l'activité", end: true },
      { path: "/todo", label: "Todo", icon: "☑", subtitle: "À acheter, à faire, à envoyer" },
      { path: "/performance", label: "Performance", icon: "📊", subtitle: "Indicateurs de performance et cockpit d'activité" },
    ],
  },
  {
    label: "Achat",
    routes: [
      { path: "/achats", label: "Sourcing", icon: "⇩", subtitle: "Commandes, demandes produit et balance des achats" },
      { path: "/arrivage", label: "Arrivage", icon: "📥", subtitle: "Colis attendus, déballage et entrée en stock" },
      { path: "/stock", label: "Stock", icon: "▦", subtitle: "Ce que vous possédez : vos articles en stock" },
      { path: "/deal", label: "Deal", icon: "⚖", subtitle: "Négocier un achat ou une vente, remise comprise" },
    ],
  },
  {
    label: "Vente",
    routes: [
      { path: "/ventes", label: "Ventes", icon: "↗", subtitle: "Historique et suivi des livraisons" },
      { path: "/livraison", label: "Livraison", icon: "⇄", subtitle: "Ce qu'il reste à expédier, jusqu'à la livraison confirmée" },
      { path: "/sav", label: "SAV", icon: "🛠", subtitle: "Litiges, retours clients et remboursements fournisseurs" },
      { path: "/clients", label: "Clients", icon: "☻", subtitle: "Acheteurs et historique d'achat" },
    ],
  },
  {
    label: "Comptes",
    routes: [
      { path: "/fournisseurs", label: "Fournisseurs", icon: "⌂", subtitle: "Achats, dettes fournisseurs et créances clients" },
      { path: "/charges", label: "Charges", icon: "◈", subtitle: "Matériel, emballages et abonnements de l'activité" },
      { path: "/bilan", label: "Bilan", icon: "%", subtitle: "Ce que vous possédez et ce que l'activité dégage" },
      { path: "/facturation", label: "Facturation", icon: "§", subtitle: "Factures, reçus et régime de TVA" },
      { path: "/reglages", label: "Réglages", icon: "⚙", subtitle: "Statut, modules et paramètres de l'application" },
    ],
  },
];

export const ROUTES: NavRoute[] = NAV_GROUPS.flatMap((g) => g.routes);

/** Actions injectées par la page courante dans la barre supérieure. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("topbar-actions")), []);
  return el ? createPortal(children, el) : null;
}

export default function Layout() {
  const { state, sync, resetDemoData } = useStore();
  const theme = useTheme();
  const { pathname } = useLocation();
  const current = ROUTES.find((r) => (r.end ? pathname === r.path : pathname.startsWith(r.path))) ?? ROUTES[0];
  const routeIsEnabled = (route: NavRoute) => {
    const module = MODULE_BY_PATH[route.path as keyof typeof MODULE_BY_PATH];
    return !module || state.settings.enabledModules[module];
  };
  const visibleGroups = NAV_GROUPS
    .map((group) => ({ ...group, routes: group.routes.filter(routeIsEnabled) }))
    .filter((group) => group.routes.length > 0);
  const visibleRoutes = ROUTES.filter(routeIsEnabled);

  const badges: Record<string, number> = {
    "/stock": state.items.filter((i) => i.status !== "vendu").length,
    "/ventes": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/achats": state.requests.filter((r) => r.status === "en_cours").length,
    "/arrivage": state.items.filter((i) => i.status === "arrivage").length,
    "/livraison": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": state.todos.filter((t) => t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
    "/sav":
      state.items.filter((i) => i.litigeState === "en_cours" || i.litigeState === "attente").length +
      state.personalLitiges.filter((l) => l.status !== "resolu").length +
      state.returns.filter((r) => !["rembourse", "clos"].includes(r.status)).length,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <b>Atelier</b>
          <span>Achat · Revente</span>
        </div>
        <nav className="nav">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.routes.map((r) => (
                <NavLink key={r.path} to={r.path} end={r.end}>
                  <span className="ic">{r.icon}</span>
                  {r.label}
                  {badges[r.path] ? <span className="badge">{badges[r.path]}</span> : null}
                </NavLink>
              ))}
            </div>
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
          <button
            className="btn ghost sm"
            style={{ justifyContent: "flex-start", opacity: 0.8, fontSize: 11 }}
            title="Recharger toutes les paires, colis, clients et fournisseurs de démonstration"
            onClick={() => {
              if (window.confirm("Recharger toutes les données de démo (colis, stock, clients & fournisseurs) ?")) {
                resetDemoData();
              }
            }}
          >
            ⚡ Données de démo
          </button>
        </div>
      </aside>

      <div className="main">
        <nav className="mobnav">
          {visibleRoutes.map((r) => (
            <NavLink key={r.path} to={r.path} end={r.end}>
              <span className="ic" style={{ marginRight: 4 }}>{r.icon}</span>
              {r.label}
              {badges[r.path] ? <span className="badge" style={{ marginLeft: 4 }}>{badges[r.path]}</span> : null}
            </NavLink>
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
