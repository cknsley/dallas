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
import { DOMAIN_META } from "../lib/calc";
import type { SectorDomain } from "../lib/links";
import { CommandPalette } from "./CommandPalette";
import { SidebarMiniMenu } from "./SidebarMiniMenu";

/**
 * Le secteur suit la navigation partout sauf sur la vue générale, qui agrège les deux.
 * Les sections transverses ignorent le paramètre mais gardent le contexte affiché.
 */
export const SECTOR_TRANSVERSE_PATHS = new Set(["/charges", "/sourcing", "/reglages"]);

export function isSectorDomain(v: string | null): v is SectorDomain {
  return v === "fashion" || v === "tcg";
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

/** La navigation est groupée : Pilotage, Activité, Comptes. */
export const NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Pilotage",
    routes: [
      { path: "/dashboard", label: "Vue générale", icon: LayoutDashboard, subtitle: "Les chiffres de l'activité, tous secteurs confondus", end: true },
      { path: "/todo", label: "Todo", icon: CheckSquare, subtitle: "Tâches, rappels & à faire" },
      { path: "/sourcing", label: "Sourcing", icon: Sparkles, subtitle: "Articles à acheter/trouver, vue kanban & commande" },
      { path: "/deal", label: "Deal", icon: Scale, subtitle: "Négocier un achat ou une vente, simulation de marge" },
      { path: "/performance", label: "Performance", icon: BarChart3, subtitle: "Indicateurs de performance et cockpit d'activité" },
    ],
  },
  {
    label: "Activité",
    routes: [
      { path: "/achats", label: "Centrale", icon: Building2, subtitle: "Centrale d'achat, commandes, réceptions & demandes" },
      { path: "/stock", label: "Stock", icon: Package, subtitle: "Ce que vous possédez : vos articles en stock" },
      { path: "/ventes", label: "Vente", icon: ShoppingCart, subtitle: "Historique et suivi des ventes" },
      { path: "/livraison", label: "Livraison", icon: Truck, subtitle: "Livraisons à partir (ventes) et à venir (centrale d'achat)" },
      { path: "/sav", label: "SAV & Litiges", icon: HelpCircle, subtitle: "Litiges, retours clients et remboursements fournisseurs" },
      { path: "/tcg", label: "TCG & Cartes", icon: Layers, subtitle: "Cartes gradées (PSA, BGS), scellé & booster boxes" },
    ],
  },
  {
    label: "Comptes",
    routes: [
      { path: "/fournisseurs", label: "Fournisseurs", icon: Building2, subtitle: "Achats, dettes fournisseurs et créances clients" },
      { path: "/charges", label: "Charges", icon: DollarSign, subtitle: "Matériel, emballages et abonnements de l'activité" },
      { path: "/bilan", label: "Bilan", icon: BarChart3, subtitle: "Ce que vous possédez et ce que l'activité dégage" },
      { path: "/facturation", label: "Facturation", icon: FileText, subtitle: "Factures, reçus et régime de TVA" },
      { path: "/clients", label: "Clients", icon: Users, subtitle: "Acheteurs et historique d'achat" },
      { path: "/reglages", label: "Réglages", icon: Settings, subtitle: "Statut, modules et paramètres de l'application" },
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
  const { state } = useStore();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);

  const secteurParam = searchParams.get("secteur");
  const activeSecteur = isSectorDomain(secteurParam) ? secteurParam : null;

  const current =
    pathname === "/secteur" && activeSecteur
      ? { label: DOMAIN_META[activeSecteur].label, subtitle: `Pilotage, activité & comptes — ${DOMAIN_META[activeSecteur].label}` }
      : ROUTES.find((r) => (r.end ? pathname === r.path : pathname.startsWith(r.path))) ?? ROUTES[0];

  const routeIsEnabled = (route: NavRoute) => {
    const module = MODULE_BY_PATH[route.path as keyof typeof MODULE_BY_PATH];
    return !module || state.settings.enabledModules[module];
  };

  const visibleGroups = NAV_GROUPS
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

  const navTarget = (r: NavRoute) =>
    activeSecteur && r.path !== "/dashboard" ? `${r.path}?secteur=${activeSecteur}` : r.path;

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
              <span>Cockpit ERP</span>
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

        {activeSecteur && (
          <Link to="/dashboard" className="sector-pill" onClick={() => setMobOpen(false)}>
            <span>{DOMAIN_META[activeSecteur].icon} {DOMAIN_META[activeSecteur].label}</span>
            <X size={13} />
          </Link>
        )}

        <nav className="nav">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.routes.map((r) => {
                const IconComponent = r.icon;
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
                    {badges[r.path] ? <span className="badge">{badges[r.path]}</span> : null}
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

          <div>
            <h1>{current.label}</h1>
            <div className="sub">{current.subtitle}</div>
          </div>

          <div className="spacer" />

          {/* Quick Cmd+K search trigger in topbar */}
          <button className="btn ghost sm topbar-cmd" onClick={() => setCmdOpen(true)}>
            <Search size={14} />
            <span className="topbar-cmd-text">Recherche rapide</span>
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
