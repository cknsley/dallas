import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
import { CommandPalette } from "./CommandPalette";
import { SidebarMiniMenu } from "./SidebarMiniMenu";

export interface NavRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  subtitle: string;
  end?: boolean;
}

const MODULE_BY_PATH = {
  "/clients": "clients",
  "/facturation": "facturation",
  "/sav": "sav",
} as const;

/** La navigation est groupée : Pilotage, Activité, Comptes. */
export const NAV_GROUPS: { label: string; routes: NavRoute[] }[] = [
  {
    label: "Pilotage",
    routes: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard, subtitle: "Vue d'ensemble de l'activité", end: true },
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
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobOpen, setMobOpen] = useState(false);

  const current = ROUTES.find((r) => (r.end ? pathname === r.path : pathname.startsWith(r.path))) ?? ROUTES[0];
  
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

  const badges: Record<string, number> = {
    "/stock": state.items.filter((i) => i.status !== "vendu").length,
    "/ventes": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/achats":
      state.requests.filter((r) => r.status === "en_cours").length +
      state.items.filter((i) => i.status === "arrivage").length,
    "/livraison": state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee").length,
    "/todo": state.todos.filter((t) => !t.isSourcing && t.col !== "acheter" && t.col !== "termine").length,
    "/sourcing": state.todos.filter((t) => (t.isSourcing || t.col === "acheter") && t.col !== "termine").length,
    "/facturation": state.docs.filter((d) => !d.paid).length,
    "/sav":
      state.items.filter((i) => i.litigeState === "en_cours" || i.litigeState === "attente").length +
      state.personalLitiges.filter((l) => l.status !== "resolu").length +
      state.returns.filter((r) => !["rembourse", "clos"].includes(r.status)).length,
  };

  return (
    <div className="app">
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />

      <aside className={`sidebar ${mobOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">
            <Package size={20} className="brand-icon" />
          </div>
          <div>
            <b>RESELL</b>
            <span>Cockpit ERP</span>
          </div>
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
                return (
                  <NavLink
                    key={r.path}
                    to={r.path}
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
