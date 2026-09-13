import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard, Package } from "lucide-react";
import { useStore } from "../store/StoreContext";
import { DOMAIN_META, computeStats, periodRange } from "../lib/calc";
import { eur } from "../lib/format";
import { links } from "../lib/links";

const SECTORS = ["fashion", "tcg"] as const;

/**
 * Écran d'accueil : une interface à part, avant le cockpit. On y choisit
 * l'univers dans lequel on entre ; tout le reste de l'app en découle.
 */
export default function Home() {
  const { state } = useStore();

  const allTime = useMemo(() => periodRange("all"), []);
  const global = useMemo(() => computeStats(state, allTime), [state, allTime]);
  const bySector = useMemo(
    () => ({
      fashion: computeStats(state, allTime, "fashion"),
      tcg: computeStats(state, allTime, "tcg"),
    }),
    [state, allTime],
  );

  return (
    <div className="home">
      <header className="home-head">
        <div className="home-brand">
          <span className="home-brand-logo">
            <Package size={22} />
          </span>
          <div>
            <b>RESELL</b>
            <span>Cockpit ERP</span>
          </div>
        </div>
        <p className="home-baseline">Dans quel univers travaillez-vous&nbsp;?</p>
      </header>

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

      <Link to="/dashboard" className="home-global">
        <LayoutDashboard size={17} />
        <div>
          <b>Vue générale</b>
          <span>Les deux secteurs réunis · {eur(global.stockEstimate)} de stock</span>
        </div>
        <ArrowRight size={15} />
      </Link>
    </div>
  );
}
