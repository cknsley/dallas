import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ShoppingCart,
  Scale,
  Building2,
  Package,
  Truck,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Boxes,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { HeaderActions } from "../components/Layout";
import StockValueCard from "../components/StockValueCard";
import { Kpi, Segmented } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { caOfYear, computeStats, DOMAIN_META, periodRange } from "../lib/calc";
import { eur, num, pct } from "../lib/format";
import { links } from "../lib/links";
import { vatRegime } from "../lib/vat";
import ItemModal from "../modals/ItemModal";
import OrderModal from "../modals/OrderModal";
import ExpenseModal from "../modals/ExpenseModal";
import type { Period } from "../types";

export default function Dashboard() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"item" | "order" | "charge" | null>(null);
  const [period, setPeriod] = usePref<Period>("period", "month");

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range), [state, range]);
  const regime = useMemo(
    () => vatRegime(state.settings, caOfYear(state.items, new Date().getFullYear())),
    [state.settings, state.items],
  );

  const clients = useMemo(
    () => state.items.filter((i) => i.buyer?.trim()).map((i) => i.buyer!.trim()),
    [state.items],
  );
  const buyerCounts = useMemo(() => {
    const m = new Map<string, number>();
    clients.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
    return m;
  }, [clients]);
  const repeatBuyers = useMemo(
    () => Array.from(buyerCounts.values()).filter((n) => n > 1).length,
    [buyerCounts],
  );
  const repeatRate = clients.length ? (repeatBuyers / buyerCounts.size) * 100 : 0;

  const allTime = useMemo(() => periodRange("all"), []);
  const fashionStats = useMemo(() => computeStats(state, allTime, "fashion"), [state, allTime]);
  const tcgStats = useMemo(() => computeStats(state, allTime, "tcg"), [state, allTime]);

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setCreating("order")}>
          <Plus size={15} /> Nouvelle commande
        </button>
        <button className="btn" onClick={() => navigate(links.ventes())}>
          <ShoppingCart size={15} /> + Vente
        </button>
        <button className="btn" onClick={() => navigate(links.deal())}>
          <Scale size={15} /> Deal
        </button>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mois en cours" },
            { value: "year", label: "Année en cours" },
            { value: "all", label: "Depuis le début" },
          ]}
        />
      </HeaderActions>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 18 }}>
          <AlertTriangle size={18} className="glyph-icon" />
          <div>
            <b>{regime.alert.title}</b><br />{regime.alert.text}{" "}
            <Link to={links.facturation()} style={{ fontWeight: 600 }}>Régler le régime de TVA →</Link>
          </div>
        </div>
      )}

      {/* Deux secteurs : chacun ouvre son propre hub Pilotage / Activité / Comptes */}
      <div className="sector-grid" style={{ marginBottom: 18 }}>
        {([
          { domain: "fashion" as const, stats: fashionStats },
          { domain: "tcg" as const, stats: tcgStats },
        ]).map(({ domain, stats: s }) => {
          const meta = DOMAIN_META[domain];
          return (
            <button
              key={domain}
              type="button"
              className="kpi sector-card"
              onClick={() => navigate(links.secteur(domain))}
            >
              <span className="sector-card-ic">{meta.icon}</span>
              <div className="sector-card-lbl">{meta.label}</div>
              <div className="sector-card-sub">{meta.subtitle}</div>
              <div className="sector-card-stats">
                <div>
                  <span className="lbl">Stock</span>
                  <span className="val">{eur(s.stockEstimate)}</span>
                </div>
                <div>
                  <span className="lbl">Marge ({allTime.label})</span>
                  <span className="val">{eur(s.margeNette)}</span>
                </div>
              </div>
              <span className="go">
                <ArrowRight size={14} />
              </span>
            </button>
          );
        })}
      </div>

      <StockValueCard state={state} />

      {/* COCKPIT OPÉRATIONNEL & ACTIONS DU JOUR */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-h">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} style={{ color: "var(--accent)" }} /> Cockpit Opérationnel
          </h3>
          <div className="spacer" />
          <span className="hint">Actions et opérations du jour</span>
        </div>
        <div className="card-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {/* 1. Commandes en cours */}
          <button
            type="button"
            className="card"
            style={{ padding: 14, cursor: "pointer", textAlign: "left", transition: "transform 0.12s, border-color 0.12s", border: "1px solid var(--line-2)" }}
            onClick={() => navigate(links.achats())}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={15} /> Commandes en cours
              </span>
              <span className="pill info">
                {state.items.filter((i) => i.status === "arrivage").length} commande(s)
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {eur(state.items.filter((i) => i.status === "arrivage").reduce((a, i) => a + (num(i.cost) + num(i.fees)) * Math.max(1, i.quantity || 1), 0))}
            </div>
            <div className="hint" style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Centrale d'achat & commandes <ArrowRight size={12} />
            </div>
          </button>

          {/* 2. Envois en cours */}
          <button
            type="button"
            className="card"
            style={{ padding: 14, cursor: "pointer", textAlign: "left", transition: "transform 0.12s, border-color 0.12s", border: "1px solid var(--line-2)" }}
            onClick={() => navigate(links.livraison({ tab: "a_partir" }))}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={15} /> Envois en cours
              </span>
              <span className={`pill ${state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee" && i.shipping !== "recu").length ? "warn" : "good"}`}>
                {state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee" && i.shipping !== "recu").length} à expédier
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee" && i.shipping !== "recu").length > 0
                ? `${state.items.filter((i) => i.status === "vendu" && i.delivery === "commandee" && i.shipping !== "recu").length} colis en attente`
                : "Tout est expédié ✓"}
            </div>
            <div className="hint" style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Kanban d'expédition <ArrowRight size={12} />
            </div>
          </button>

          {/* 3. Colis qui arrivent */}
          <button
            type="button"
            className="card"
            style={{ padding: 14, cursor: "pointer", textAlign: "left", transition: "transform 0.12s, border-color 0.12s", border: "1px solid var(--line-2)" }}
            onClick={() => navigate(links.livraison({ tab: "a_venir" }))}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Truck size={15} /> Colis qui arrivent
              </span>
              <span className="pill info">
                {state.items.filter((i) => i.status === "arrivage").length} en transit
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {state.items.filter((i) => i.status === "arrivage").length > 0
                ? `${state.items.filter((i) => i.status === "arrivage").length} colis attendu(s)`
                : "Aucun colis en attente"}
            </div>
            <div className="hint" style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Réceptionner les arrivages <ArrowRight size={12} />
            </div>
          </button>

          {/* 4. Argent bloqué */}
          <button
            type="button"
            className="card"
            style={{ padding: 14, cursor: "pointer", textAlign: "left", transition: "transform 0.12s, border-color 0.12s", border: "1px solid var(--line-2)" }}
            onClick={() => navigate(links.ventes())}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <DollarSign size={15} /> Argent bloqué
              </span>
              <span className="pill warn">
                {state.items.filter((i) => i.status === "vendu" && i.shipping !== "recu").length} vente(s)
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
              {eur(
                state.items
                  .filter((i) => i.status === "vendu" && i.shipping !== "recu")
                  .reduce((a, i) => a + (num(i.price) * Math.max(1, i.quantity || 1) + num(i.shippingPaid)), 0)
              )}
            </div>
            <div className="hint" style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              Ventes en attente de déblocage <ArrowRight size={12} />
            </div>
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Chiffre d'affaires"
          value={eur(stats.ca)}
          meta={`${stats.count} vente${stats.count > 1 ? "s" : ""} · ${range.label}`}
        />
        <Kpi
          label="Marge réalisée"
          value={eur(stats.marge)}
          meta={stats.ca ? `${pct(stats.margePct)} du chiffre d'affaires` : "Aucune vente sur la période"}
          tone={stats.marge >= 0 ? "ok" : "warn"}
        />
        <Kpi
          label="Valeur estimée du stock"
          value={eur(stats.stockEstimate)}
          meta={`${stats.stockCount} article${stats.stockCount > 1 ? "s" : ""} · ${eur(stats.stockValue)} de coût total`}
          tone="info"
        />
        <Kpi
          label="Nombre de ventes"
          value={String(stats.count)}
          meta={`${stats.enStock} en stock · ${stats.arrivage} en arrivage`}
        />
      </div>

      <div className="cols two" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-h">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={18} style={{ color: "var(--ok)" }} /> Top Ventes & Répétition Clients
            </h3>
          </div>
          <div className="card-b">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ padding: 12, borderRadius: 8, background: "var(--surface-sub)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>Taux de réachat</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{pct(repeatRate)}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{repeatBuyers} client(s) récurrent(s)</div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: "var(--surface-sub)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>Panier moyen</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-1)" }}>
                  {eur(stats.count > 0 ? stats.ca / stats.count : 0)}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>sur {stats.count} vente(s)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Boxes size={18} style={{ color: "var(--info)" }} /> État Général du Stock
            </h3>
          </div>
          <div className="card-b">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, background: "var(--surface-sub)" }}>
                <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={14} style={{ color: "var(--ok)" }} /> Articles en Stock Boutique
                </span>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{stats.enStock}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, background: "var(--surface-sub)" }}>
                <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={14} style={{ color: "var(--warn)" }} /> Arrivages en Transit
                </span>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{stats.arrivage}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {creating === "item" && <ItemModal item={null} onClose={() => setCreating(null)} />}
      {creating === "order" && <OrderModal onClose={() => setCreating(null)} />}
      {creating === "charge" && <ExpenseModal expense={null} onClose={() => setCreating(null)} />}
    </>
  );
}
