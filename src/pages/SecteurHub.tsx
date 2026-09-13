import { useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  HeaderActions,
  MODULE_BY_PATH,
  NAV_GROUPS,
  SECTOR_SCOPED_PATHS,
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

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    routes: group.routes.filter((r) => {
      if (r.path === "/") return false;
      const module = MODULE_BY_PATH[r.path as keyof typeof MODULE_BY_PATH];
      return !module || state.settings.enabledModules[module];
    }),
  })).filter((group) => group.routes.length > 0);

  const targetFor = (path: string) => (SECTOR_SCOPED_PATHS.has(path) ? `${path}?secteur=${secteur}` : path);

  return (
    <>
      <HeaderActions>
        <span className="pill info">{stats.enStock + stats.arrivage} article(s) en stock/arrivage</span>
        <span className="pill">{eur(stats.stockEstimate)} de valeur estimée</span>
      </HeaderActions>

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
      </div>
    </>
  );
}
