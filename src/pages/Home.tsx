import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CheckSquare, LayoutDashboard, Package, Truck } from "lucide-react";
import { useStore } from "../store/StoreContext";
import { computeNavBadges } from "../lib/badges";
import { DOMAIN_META, computeStats, periodRange } from "../lib/calc";
import { eur } from "../lib/format";
import { links } from "../lib/links";

const SECTORS = ["fashion", "tcg"] as const;

/**
 * Écran d'accueil : une interface à part, avant le cockpit. À gauche les vues
 * collectives (les deux secteurs réunis), à droite l'univers dans lequel entrer.
 */
export default function Home() {
  const { state } = useStore();

  const allTime = useMemo(() => periodRange("all"), []);
  const global = useMemo(() => computeStats(state, allTime), [state, allTime]);
  const badges = useMemo(() => computeNavBadges(state), [state]);
  const bySector = useMemo(
    () => ({
      fashion: computeStats(state, allTime, "fashion"),
      tcg: computeStats(state, allTime, "tcg"),
    }),
    [state, allTime],
  );

  // Vues volontairement non filtrées : elles réunissent les deux secteurs.
  const collectives = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Vue générale", meta: `${eur(global.stockEstimate)} de stock` },
    { to: links.performance(), icon: BarChart3, label: "Performances", meta: `${eur(global.margeNette)} de marge` },
    { to: links.todo(), icon: CheckSquare, label: "Todo collectif", meta: `${badges["/todo"] || 0} tâche(s) en cours` },
    { to: links.livraison(), icon: Truck, label: "Livraisons", meta: `${badges["/livraison"] || 0} colis à expédier` },
  ];

  return (
    <div className="home">
      <aside className="home-side">
        <div className="home-brand">
          <span className="home-brand-logo">
            <Package size={22} />
          </span>
          <div>
            <b>RESELL</b>
            <span>Cockpit ERP</span>
          </div>
        </div>

        <nav className="home-menu">
          <div className="home-menu-label">Les deux secteurs réunis</div>
          {collectives.map(({ to, icon: Icon, label, meta }) => (
            <Link key={to} to={to} className="home-menu-item">
              <span className="home-menu-ic">
                <Icon size={17} />
              </span>
              <span className="home-menu-txt">
                <b>{label}</b>
                <small>{meta}</small>
              </span>
              <ArrowRight size={14} />
            </Link>
          ))}
        </nav>
      </aside>

      <main className="home-main">
        <p className="home-baseline">Dans quel univers travaillez-vous&nbsp;?</p>

        <div className="home-sectors">
          {SECTORS.map((domain) => {
            const meta = DOMAIN_META[domain];
            const s = bySector[domain];
            return (
              <Link key={domain} to={links.secteur(domain)} className="home-sector">
                <span className="home-sector-ic">{meta.icon}</span>
                <h2>{meta.label}</h2>
                <p>{meta.subtitle}</p>
                <dl className="home-sector-stats">
                  <div>
                    <dt>Stock</dt>
                    <dd>{eur(s.stockEstimate)}</dd>
                  </div>
                  <div>
                    <dt>Articles</dt>
                    <dd>{s.enStock + s.arrivage}</dd>
                  </div>
                  <div>
                    <dt>Marge</dt>
                    <dd>{eur(s.margeNette)}</dd>
                  </div>
                </dl>
                <span className="home-sector-go">
                  Entrer <ArrowRight size={15} />
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
