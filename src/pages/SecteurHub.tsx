import { useMemo } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Scale } from "lucide-react";
import {
  MODULE_BY_PATH,
  NAV_GROUPS,
  SECTOR_TRANSVERSE_PATHS,
  isSectorDomain,
} from "../components/Layout";
import { useStore } from "../store/StoreContext";
import { computeSectorNavBadges } from "../lib/badges";
import { DOMAIN_META, computeStats, periodRange } from "../lib/calc";
import { eur } from "../lib/format";

/** Étape intermédiaire entre l'Accueil général et une section : le même hub, mais limité à un secteur. */
export default function SecteurHub() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const secteurParam = searchParams.get("secteur");
  const secteur = isSectorDomain(secteurParam) ? secteurParam : "fashion";
  const meta = DOMAIN_META[secteur];

  const navBadges = useMemo(() => computeSectorNavBadges(state, secteur), [state, secteur]);
  const stats = useMemo(() => computeStats(state, periodRange("all"), secteur), [state, secteur]);

  if (!isSectorDomain(secteurParam)) return <Navigate to="/" replace />;

  // Le groupe "Comptes" est retiré du hub secteur : il fait déjà double emploi avec
  // le hub Comptabilité de l'accueil, qui regroupe ces mêmes pages en un seul endroit.
  const visibleGroups = NAV_GROUPS.filter((g) => g.label !== "Comptes")
    .map((group) => ({
      ...group,
      routes: group.routes.filter((r) => {
        if (r.path === "/dashboard") return false;
        if (r.path === "/tcg" && secteur === "fashion") return false;
        const module = MODULE_BY_PATH[r.path as keyof typeof MODULE_BY_PATH];
        return !module || state.settings.enabledModules[module];
      }),
    })).filter((group) => group.routes.length > 0);

  const targetFor = (path: string) => `${path}?secteur=${secteur}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 28px", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
        <Link to="/" title="Retour à l'accueil" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 20 }}>←</span>
        </Link>
        <div style={{ flex: 1 }} />
        <span className="pill info">{stats.enStock + stats.arrivage} article(s) en stock/arrivage</span>
        <span className="pill">{eur(stats.stockEstimate)} de valeur estimée</span>
      </header>

      <main style={{ flex: 1 }}>
      <div className="hub-header">
        <span className="hub-header-ic">{meta.icon}</span>
        <div>
          <h2>{meta.label}</h2>
          <div className="hint">{meta.subtitle}</div>
        </div>
      </div>

      <div className="hub">
        {visibleGroups.map((group) => (
          <div className="hub-group" key={group.label}>
            <div className="hub-group-label">{group.label}</div>
            <div className="hub-grid">
              {group.routes.map((r) => {
                const IconComponent = r.icon;
                const count = navBadges[r.path];
                return (
                  <button
                    key={r.path}
                    type="button"
                    className="kpi hub-tile"
                    onClick={() => navigate(targetFor(r.path))}
                  >
                    <span className="hub-tile-ic">
                      <IconComponent size={20} />
                    </span>
                    <div className="hub-tile-lbl">{r.label}</div>
                    <div className="hub-tile-sub">{r.subtitle}</div>
                    {SECTOR_TRANSVERSE_PATHS.has(r.path) && (
                      <div className="hub-tile-transverse">Commun aux deux secteurs</div>
                    )}
                    {!!count && <span className="hub-tile-badge">{count}</span>}
                    <span className="go">
                      <ArrowRight size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="hub-group">
          <div className="hub-group-label">Comptes</div>
          <div className="hub-grid">
            <Link to="/comptabilite" className="kpi hub-tile">
              <span className="hub-tile-ic">
                <Scale size={20} />
              </span>
              <div className="hub-tile-lbl">Comptabilité</div>
              <div className="hub-tile-sub">Fournisseurs, charges, bilan, facturation & clients</div>
              <div className="hub-tile-transverse">Commun aux deux secteurs</div>
              <span className="go">
                <ArrowRight size={14} />
              </span>
            </Link>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}
