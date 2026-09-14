import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Package,
  ShoppingCart,
  Users,
  Building2,
  FileText,
  DollarSign,
  ArrowRight,
  X,
  LayoutDashboard,
  Truck,
  HelpCircle,
  BarChart3,
  CheckSquare,
  Settings,
  Sparkles,
  Layers,
  LucideIcon,
} from "lucide-react";
import { useStore } from "../store/StoreContext";
import { eur } from "../lib/format";
import type { Item, ClientRecord, SupplierRecord } from "../types";

export interface SearchResult {
  id: string;
  title: string;
  sub?: string;
  category: "Navigation" | "Stock" | "Clients" | "Fournisseurs";
  icon: LucideIcon;
  path: string;
  type?: string;
}

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const pages = useMemo(() => [
    { title: "Tableau de bord", path: "/dashboard", icon: LayoutDashboard, category: "Navigation" },
    { title: "Stock & Articles", path: "/stock", icon: Package, category: "Navigation" },
    { title: "TCG & Cartes", path: "/achats?secteur=tcg", icon: Layers, category: "Navigation" },
    { title: "Sourcing & Achats", path: "/sourcing", icon: Sparkles, category: "Navigation" },
    { title: "Ventes & Commandes", path: "/ventes", icon: ShoppingCart, category: "Navigation" },
    { title: "Livraisons & Colis", path: "/livraison", icon: Truck, category: "Navigation" },
    { title: "Bilan & Patrimoine", path: "/bilan", icon: BarChart3, category: "Navigation" },
    { title: "Charges & Amortissements", path: "/charges", icon: DollarSign, category: "Navigation" },
    { title: "Clients", path: "/clients", icon: Users, category: "Navigation" },
    { title: "Fournisseurs", path: "/fournisseurs", icon: Building2, category: "Navigation" },
    { title: "SAV & Retours", path: "/sav", icon: HelpCircle, category: "Navigation" },
    { title: "Tâches & Mémos", path: "/todo", icon: CheckSquare, category: "Navigation" },
    { title: "Facturation & Devis", path: "/facturation", icon: FileText, category: "Navigation" },
    { title: "Réglages & Export", path: "/reglages", icon: Settings, category: "Navigation" },
  ], []);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return pages.slice(0, 5).map((p) => ({
        id: p.path,
        title: p.title,
        sub: "Page système",
        category: "Navigation",
        icon: p.icon,
        path: p.path,
        type: "page",
      }));
    }

    const items: SearchResult[] = [];

    // Filter pages
    pages.forEach((p) => {
      if (p.title.toLowerCase().includes(q)) {
        items.push({ id: p.path, title: p.title, sub: "Page système", category: "Navigation", icon: p.icon, path: p.path, type: "page" });
      }
    });

    // Filter stock items
    state.items.forEach((item: Item) => {
      if (
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q))
      ) {
        items.push({
          id: `item-${item.id}`,
          title: item.name || "Article sans nom",
          sub: `${item.brand || "Marque —"} · ${eur(item.cost || 0)} · ${item.status}`,
          category: "Stock",
          icon: Package,
          path: `/stock?q=${encodeURIComponent(item.name || "")}`,
          type: "item",
        });
      }
    });

    // Filter clients
    state.clients.forEach((client: ClientRecord) => {
      if (
        (client.name && client.name.toLowerCase().includes(q)) ||
        (client.email && client.email.toLowerCase().includes(q)) ||
        (client.phone && client.phone.toLowerCase().includes(q))
      ) {
        items.push({
          id: `client-${client.id}`,
          title: client.name,
          sub: client.email || client.phone || "Fiche client",
          category: "Clients",
          icon: Users,
          path: `/clients?q=${encodeURIComponent(client.name)}`,
          type: "client",
        });
      }
    });

    // Filter suppliers
    state.suppliers.forEach((sup: SupplierRecord) => {
      if (sup.name && sup.name.toLowerCase().includes(q)) {
        items.push({
          id: `supplier-${sup.id}`,
          title: sup.name,
          sub: sup.contact || sup.email || "Fournisseur",
          category: "Fournisseurs",
          icon: Building2,
          path: `/fournisseurs?q=${encodeURIComponent(sup.name)}`,
          type: "supplier",
        });
      }
    });

    return items.slice(0, 15);
  }, [query, state, pages]);

  const handleSelect = (index: number) => {
    const item = results[index];
    if (item) {
      navigate(item.path);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(selectedIndex);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-modal glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrapper">
          <Search className="cmd-search-icon" size={18} />
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Rechercher un article, un client, un fournisseur, une page..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button className="cmd-clear-btn" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
          <span className="cmd-badge-esc">ESC</span>
        </div>

        <div className="cmd-results">
          {results.length === 0 ? (
            <div className="cmd-empty">
              <span>Aucun résultat pour « {query} »</span>
            </div>
          ) : (
            results.map((res, index) => {
              const Icon = res.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={res.id}
                  className={`cmd-item ${isSelected ? "selected" : ""}`}
                  onClick={() => handleSelect(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="cmd-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="cmd-item-info">
                    <span className="cmd-item-title">{res.title}</span>
                    <span className="cmd-item-sub">{res.sub}</span>
                  </div>
                  <span className="cmd-item-cat">{res.category}</span>
                  <ArrowRight className="cmd-item-arrow" size={14} />
                </div>
              );
            })
          )}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> Naviguer</span>
          <span><kbd>↵</kbd> Ouvrir</span>
          <span><kbd>ESC</kbd> Fermer</span>
        </div>
      </div>
    </div>
  );
}
