import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
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
  ChevronDown,
  X,
  LucideIcon,
} from "lucide-react";
import { useStore } from "../store/StoreContext";
import { computeNavBadges, computeSectorNavBadges } from "../lib/badges";
import type { SectorDomain } from "../lib/links";
import { CommandPalette } from "./CommandPalette";
import { SidebarMiniMenu } from "./SidebarMiniMenu";
import SectionToggles from "./SectionToggles";

export const SECTOR_TRANSVERSE_PATHS = new Set(["/charges", "/reglages"]);

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
      { path: "/todo", label: "Todo central", icon: CheckSquare, subtitle: "Tâches et rappels de tous les univers" },
      { path: "/ventes-globales", label: "Ventes", icon: ShoppingCart, subtitle: "Historique des ventes livrées" },
      { path: "/balance", label: "Balance", icon: Scale, subtitle: "Balance achats et ventes" },
      { path: "/bilan", label: "Bilan", icon: BarChart3, subtitle: "Ce que vous possédez et ce que l'activité dégage" },
      { path: "/charges", label: "Charges", icon: DollarSign, subtitle: "Matériel, emballages et abonnements" },
    ],
  },
  {
    label: "Logistique",
    routes: [
      { path: "/sourcing", label: "Sourcing centralisé", icon: Sparkles, subtitle: "Articles à trouver & opportunités (tous univers)" },
      { path: "/livraison", label: "Livraison générale", icon: Truck, subtitle: "Suivi global des réceptions et expéditions" },
      { path: "/stock?cat=emballages", label: "Emballages", icon: Package, subtitle: "Cartons, protections et fournitures d'envoi" },
      { path: "/fournisseurs", label: "Fournisseurs", icon: Building2, subtitle: "Achats, dettes fournisseurs et créances clients" },
    ],
  },
  {
    label: "Comptabilité",
    routes: [
      { path: "/facturation", label: "Preuves de Vente", icon: FileText, subtitle: "Preuves générées pour chaque vente" },
      { path: "/clients", label: "Clients", icon: Users, subtitle: "Acheteurs et historique d'achat" },
    ],
  },
  {
    label: "Négocier",
    routes: [
      { path: "/deal/achat", label: "Achat", icon: Sparkles, subtitle: "Simuler un rachat — article seul ou lot — avant de s’engager" },
      { path: "/deal/vente", label: "Vente", icon: Sparkles, subtitle: "Simuler une vente ou une remise — lot ou article seul" },
    ],
  },
];

/** ── Structure Navigation par Secteur (Vêtements & Tag) : Pilotage / Activité ── */
export const SECTOR_NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Pilotage",
    routes: [
      { path: "/achats", label: "Centrale", icon: Building2, subtitle: "Centrale d'achat, commandes & réceptions" },
      { path: "/todo", label: "Todo", icon: CheckSquare, subtitle: "Tâches, rappels & à faire" },
      { path: "/arrivage", label: "Arrivage", icon: Package, subtitle: "Colis en transit & réceptions" },
      { path: "/stock", label: "Stock", icon: Layers, subtitle: "Articles et pièces en stock" },
    ],
  },
  {
    label: "Activité",
    routes: [
      { path: "/sourcing", label: "Sourcing", icon: Sparkles, subtitle: "Articles à trouver & opportunités" },
      { path: "/gradation", label: "Gradation", icon: Layers, subtitle: "Suivi des cartes en gradation" },
      { path: "/ventes", label: "Ventes", icon: ShoppingCart, subtitle: "Suivi des ventes en cours" },
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
    { path: "/balance", label: "Balance", icon: Scale, subtitle: "Balance achats et ventes" },
    { path: "/bilan", label: "Bilan", icon: BarChart3, subtitle: "Ce que vous possédez et dégagez" },
    { path: "/facturation", label: "Preuves de Vente", icon: FileText, subtitle: "Preuves d'achat et vente" },
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
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(() => ["/dashboard", "/bilan", "/balance", "/charges"].includes(location.pathname));
  const customSectorIds = (state.settings.customSectors ?? []).map((s) => s.id);
  const secteurParam = searchParams.get("secteur");
  const activeSecteur = isSectorDomain(secteurParam, customSectorIds) ? secteurParam : null;

  const routeIsEnabled = (route: NavRoute) => {
    if ((route.path === "/tcg" || route.path === "/gradation") && activeSecteur !== "tcg" && activeSecteur !== null) return false;
    const module = MODULE_BY_PATH[route.path as keyof typeof MODULE_BY_PATH];
    return !module || state.settings.enabledModules[module];
  };

  const rawGroups = activeSecteur ? SECTOR_NAV_GROUPS : HOME_NAV_GROUPS;

  const visibleGroups = rawGroups
    .map((group) => ({
      ...group,
      routes: group.routes.filter((route) =>
        routeIsEnabled(route)
        && (activeSecteur !== null || !["/bilan", "/balance", "/charges"].includes(route.path)),
      ),
    }))
    .filter((group) => group.routes.length > 0);

  useEffect(() => {
    if (["/dashboard", "/bilan", "/balance", "/charges"].includes(location.pathname)) setOverviewOpen(true);
  }, [location.pathname]);

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
    if (r.path === "/deal" || r.path === "/deal/achat" || r.path === "/deal/vente") {
      return activeSecteur ? `${r.path}?secteur=${activeSecteur}` : r.path;
    }
    return activeSecteur && r.path !== "/dashboard" ? `${r.path}?secteur=${activeSecteur}` : r.path;
  };

  return (
    <div className="app">
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
      <SectionToggles />

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
                if (!activeSecteur && r.path === "/dashboard") {
                  const overviewActive = ["/dashboard", "/bilan", "/balance", "/charges"].includes(location.pathname);
                  return (
                    <div className={`nav-dropdown${overviewOpen ? " open" : ""}`} key={r.path}>
                      <button
                        type="button"
                        className={`nav-dropdown-trigger${overviewActive ? " active" : ""}`}
                        aria-expanded={overviewOpen}
                        onClick={() => setOverviewOpen((open) => !open)}
                      >
                        <span className="ic"><LayoutDashboard size={16} /></span>
                        <span className="lbl">Vue générale</span>
                        <ChevronDown className="nav-dropdown-chevron" size={15} />
                      </button>
                      {overviewOpen && (
                        <div className="nav-submenu">
                          {[
                            { path: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
                            { path: "/bilan", label: "Bilan", icon: BarChart3 },
                            { path: "/balance", label: "Balance", icon: Scale },
                            { path: "/charges", label: "Charges", icon: DollarSign },
                          ].map((entry) => {
                            const SubIcon = entry.icon;
                            const active = location.pathname === entry.path;
                            return (
                              <Link
                                key={entry.path}
                                to={entry.path}
                                className={`nav-submenu-link${active ? " active" : ""}`}
                                aria-current={active ? "page" : undefined}
                                onClick={() => setMobOpen(false)}
                              >
                                <SubIcon size={14} />
                                <span>{entry.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                const IconComponent = r.icon;
                const badgeKey = r.path;
                const target = navTarget(r);
                const [targetPath] = target.split("?");
                const isActive = r.end ? location.pathname === targetPath : location.pathname.startsWith(targetPath);
                return (
                  <Link
                    key={r.path}
                    to={target}
                    onClick={() => setMobOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? "nav-link active" : "nav-link"}
                  >
                    <span className="ic">
                      <IconComponent size={16} />
                    </span>
                    <span className="lbl">{r.label}</span>
                    {badges[badgeKey] ? <span className="badge">{badges[badgeKey]}</span> : null}
                  </Link>
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

          {/* Le nom de la boutique, partout : les univers s'ouvrent depuis l'accueil. */}
          <div className="topbar-shop-name">{state.settings.business?.trim() || "Ma Boutique Resell"}</div>

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
