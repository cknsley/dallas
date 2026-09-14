import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  Sparkles,
  Scale,
  BarChart3,
  Building2,
  Package,
  ShoppingCart,
  Truck,
  HelpCircle,
  Layers,
  DollarSign,
  FileText,
  Users,
  Settings,
  Search,
  Menu,
  X,
  LucideIcon,
} from "lucide-react";
import { useStore } from "../store/StoreContext";
import { computeNavBadges, computeSectorNavBadges } from "../lib/badges";
import type { SectorDomain } from "../lib/links";
import { CommandPalette } from "./CommandPalette";
import { SidebarMiniMenu } from "./SidebarMiniMenu";

export const SECTOR_TRANSVERSE_PATHS = new Set(["/charges", "/sourcing", "/reglages"]);

export function isSectorDomain(v: string | null, customIds: string[] = []): v is SectorDomain {
  return v === "fashion" || v === "tcg" || (!!v && customIds.includes(v));
}

export interface NavRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  subtitle: string;
  end?: boolean;
}

export const MODULE_BY_PATH = {
  "/clients": "clients",
  "/facturation": "facturation",
  "/sav": "sav",
} as const;

/** ── Structure Navigation Accueil (Vue générale, Performance générale, Livraison générale, Comptabilité, Deal) ── */
export const HOME_NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Accueil & Vues Générales",
    routes: [
      { path: "/dashboard", label: "Vue générale", icon: LayoutDashboard, subtitle: "Indicateurs et chiffres consolidés", end: true },
      { path: "/performance", label: "Performance générale", icon: BarChart3, subtitle: "Bilan global de rentabilité" },
      { path: "/livraison", label: "Livraison générale", icon: Truck, subtitle: "Suivi global des réceptions et expéditions" },
      { path: "/comptabilite", label: "Comptabilité", icon: Scale, subtitle: "Bilan, charges, facturation, fournisseurs & clients" },
    ],
  },
  {
    label: "Calculateur & Deal",
    routes: [
      { path: "/deal", label: "Page Deal", icon: Sparkles, subtitle: "Négocier un achat ou une vente, simulation de marge" },
    ],
  },
];

/** ── Structure Navigation par Secteur (Vêtements & Tag) : Pilotage / Activité ── */
export const SECTOR_NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Pilotage",
    routes: [
      { path: "/achats", label: "Centrale", icon: Building2, subtitle: "Centrale d'achat, commandes & réceptions" },
      { path: "/performance", label: "Performance", icon: BarChart3, subtitle: "Indicateurs et KPIs du secteur" },
      { path: "/todo", label: "Todo", icon: CheckSquare, subtitle: "Tâches, rappels & à faire" },
      { path: "/arrivage", label: "Arrivage", icon: Package, subtitle: "Colis en transit & réceptions" },
      { path: "/stock", label: "Stock", icon: Layers, subtitle: "Articles et pièces en stock" },
    ],
  },
  {
    label: "Activité",
    routes: [
      { path: "/sourcing", label: "Sourcing", icon: Sparkles, subtitle: "Articles à trouver & opportunités" },
      { path: "/ventes", label: "Ventes", icon: ShoppingCart, subtitle: "Historique et suivi des ventes" },
      { path: "/livraison", label: "Livraison", icon: Truck, subtitle: "Suivi des colis et livraisons" },
      { path: "/sav", label: "SAV", icon: HelpCircle, subtitle: "Litiges, retours & réclamations" },
    ],
  },
];

/** Transverse / Comptes pour navigation complète */
export const COMPTES_NAV_GROUP: { label: string; routes: NavRoute[] } = {
  label: "Comptes",
  routes: [
    { path: "/fournisseurs", label: "Fournisseurs", icon: Building2, subtitle: "Achats, dettes fournisseurs et créances clients" },
    { path: "/charges", label: "Charges", icon: DollarSign, subtitle: "Matériel, emballages et abonnements" },
    { path: "/bilan", label: "Bilan", icon: BarChart3, subtitle: "Ce que vous possédez et dégagez" },
    { path: "/facturation", label: "Facturation", icon: FileText, subtitle: "Factures, reçus et TVA" },
    { path: "/clients", label: "Clients", icon: Users, subtitle: "Acheteurs et historique" },
    { path: "/reglages", label: "Réglages", icon: Settings, subtitle: "Paramètres de l'application" },
  ],
};

export const ALL_ROUTES: NavRoute[] = [
  ...HOME_NAV_GROUPS.flatMap((g) => g.routes),
  ...SECTOR_NAV_GROUPS.flatMap((g) => g.routes),
  ...COMPTES_NAV_GROUP.routes,
];

export const NAV_GROUPS = SECTOR_NAV_GROUPS;
export const ROUTES = ALL_ROUTES;

/** Actions injectées par la page courante dans la barre supérieure. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("topbar-actions")), []);
  return el ? createPortal(children, el) : null;
}

export default function Layout() {
  const { state } = useStore();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);
  // Sur l'accueil, le switcher fait double emploi avec la section "Accès aux Pages
  // Univers" de la page elle-même : on le retire là, pas ailleurs.
  const isHome = pathname === "/";

  const customSectorIds = (state.settings.customSectors ?? []).map((s) => s.id);
  const secteurParam = searchParams.get("secteur");
  const activeSecteur = isSectorDomain(secteurParam, customSectorIds) ? secteurParam : null;

  const routeIsEnabled = (route: NavRoute) => {
    if (route.path === "/tcg" && activeSecteur !== "tcg" && activeSecteur !== null) return false;
    const module = MODULE_BY_PATH[route.path as keyof typeof MODULE_BY_PATH];
    return !module || state.settings.enabledModules[module];
  };

  const rawGroups = activeSecteur ? SECTOR_NAV_GROUPS : HOME_NAV_GROUPS;

  const visibleGroups = rawGroups
    .map((group) => ({ ...group, routes: group.routes.filter(routeIsEnabled) }))
    .filter((group) => group.routes.length > 0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const badges = activeSecteur ? computeSectorNavBadges(state, activeSecteur) : computeNavBadges(state);

  const navTarget = (r: NavRoute) => {
    if (r.path === "/deal") return activeSecteur ? `/deal?secteur=${activeSecteur}` : "/deal";
    if (r.path === "/arrivage") return activeSecteur ? `/achats?secteur=${activeSecteur}&tab=colis` : "/achats?tab=colis";
    return activeSecteur && r.path !== "/dashboard" ? `${r.path}?secteur=${activeSecteur}` : r.path;
  };

  return (
    <div className="app">
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />

      <aside className={`sidebar ${mobOpen ? "open" : ""}`}>
        <div className="brand">
          <Link to="/" className="brand-home" title="Revenir à l'accueil" onClick={() => setMobOpen(false)}>
            <div className="brand-logo">
              <Package size={20} className="brand-icon" />
            </div>
            <div>
              <b>RESELL</b>
            </div>
          </Link>
          <button className="mob-close" onClick={() => setMobOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Global Search Button in Sidebar */}
        <button className="cmd-trigger-btn" onClick={() => setCmdOpen(true)}>
          <Search size={15} />
          <span>Rechercher...</span>
          <kbd>⌘K</kbd>
        </button>

        <nav className="nav">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.routes.map((r) => {
                const IconComponent = r.icon;
                const badgeKey = r.path === "/arrivage" ? "/achats" : r.path;
                return (
                  <NavLink
                    key={r.path}
                    to={navTarget(r)}
                    end={r.end}
                    onClick={() => setMobOpen(false)}
                    className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                  >
                    <span className="ic">
                      <IconComponent size={16} />
                    </span>
                    <span className="lbl">{r.label}</span>
                    {badges[badgeKey] ? <span className="badge">{badges[badgeKey]}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <SidebarMiniMenu />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="mob-toggle" onClick={() => setMobOpen(true)}>
            <Menu size={20} />
          </button>

          {/* Sur l'accueil : le nom de la boutique. Ailleurs : le switcher de secteur. */}
          {isHome ? (
            <div className="topbar-shop-name">{state.settings.business?.trim() || "Ma Boutique Resell"}</div>
          ) : (
            <div className="topbar-pages-switcher">
              <Link
                to="/"
                className={`topbar-page-btn ${!activeSecteur ? "active" : ""}`}
              >
                <span>🏠 Accueil</span>
              </Link>
              <Link
                to="/achats?secteur=fashion"
                className={`topbar-page-btn ${activeSecteur === "fashion" ? "active" : ""}`}
              >
                <span>👕 Vêtements</span>
              </Link>
              <Link
                to="/achats?secteur=tcg"
                className={`topbar-page-btn ${activeSecteur === "tcg" ? "active" : ""}`}
              >
                <span>🏷️ Tag / Cartes</span>
              </Link>
            </div>
          )}

          <div className="spacer" />

          {/* Bouton Central Deal */}
          <Link
            to={activeSecteur ? `/deal?secteur=${activeSecteur}` : "/deal"}
            className="topbar-deal-btn"
            title="Calculateur & Négociation Deal"
          >
            <Sparkles size={13} />
            <span>Page Deal</span>
          </Link>

          {/* Quick Cmd+K search trigger in topbar */}
          <button className="btn ghost sm topbar-cmd" onClick={() => setCmdOpen(true)}>
            <Search size={14} />
            <span className="topbar-cmd-text">Recherche</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="topbar-actions" id="topbar-actions" />
        </header>

        <main className="view">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

