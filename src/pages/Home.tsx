import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CheckSquare, LayoutDashboard, Package, Plus, Scale, Truck, X } from "lucide-react";
import { useStore } from "../store/StoreContext";
import { computeNavBadges } from "../lib/badges";
import { computeStats, periodRange, sectorMeta } from "../lib/calc";
import { eur } from "../lib/format";
import { links } from "../lib/links";
import { uid } from "../lib/id";
import type { CustomSector } from "../types";

const BUILTIN_SECTORS = ["fashion", "tcg"] as const;
const EMOJI_CHOICES = ["📦", "👟", "👜", "💍", "🎮", "📱", "🧸", "🎨", "🏠", "⌚️", "📚", "🎧"];

/**
 * Écran d'accueil : une interface à part, avant le cockpit. À gauche les vues
 * collectives (les deux secteurs réunis), à droite les univers dans lesquels entrer —
 * les deux d'origine, plus ceux que l'utilisateur a ajoutés.
 */
export default function Home() {
  const { state, dispatch } = useStore();
  const [addOpen, setAddOpen] = useState(false);

  const allTime = useMemo(() => periodRange("all"), []);
  const global = useMemo(() => computeStats(state, allTime), [state, allTime]);
  const badges = useMemo(() => computeNavBadges(state), [state]);
  const customSectors = state.settings.customSectors ?? [];

  const allSectorIds = useMemo(
    () => [...BUILTIN_SECTORS, ...customSectors.map((s) => s.id)],
    [customSectors],
  );
  const statsById = useMemo(() => {
    const m: Record<string, ReturnType<typeof computeStats>> = {};
    allSectorIds.forEach((id) => { m[id] = computeStats(state, allTime, id); });
    return m;
  }, [state, allTime, allSectorIds]);

  // Vues volontairement non filtrées : elles réunissent tous les secteurs.
  const collectives = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Vue générale", meta: `${eur(global.stockEstimate)} de stock` },
    { to: links.performance(), icon: BarChart3, label: "Performances", meta: `${eur(global.margeNette)} de marge` },
    { to: links.todo(), icon: CheckSquare, label: "Todo collectif", meta: `${badges["/todo"] || 0} tâche(s) en cours` },
    { to: "/comptabilite", icon: Scale, label: "Comptabilité", meta: `${eur(global.stockEstimate)} de patrimoine` },
    { to: links.livraison(), icon: Truck, label: "Livraisons", meta: `${badges["/livraison"] || 0} colis à expédier` },
  ];

  const addSector = (sector: CustomSector) => {
    dispatch({ type: "settings", patch: { customSectors: [...customSectors, sector] } });
    setAddOpen(false);
  };

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
          <div className="home-menu-label">Les secteurs réunis</div>
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
          {allSectorIds.map((domain) => {
            const meta = sectorMeta(domain, customSectors);
            const s = statsById[domain];
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

          <button type="button" className="home-sector home-sector-add" onClick={() => setAddOpen(true)}>
            <span className="home-sector-add-ic">
              <Plus size={26} />
            </span>
            <span className="home-sector-add-lbl">Ajouter un univers</span>
            <span className="home-sector-add-sub">Un nouveau secteur, distinct des autres</span>
          </button>
        </div>
      </main>

      {addOpen && <AddSectorModal onClose={() => setAddOpen(false)} onCreate={addSector} />}
    </div>
  );
}

function AddSectorModal({ onClose, onCreate }: { onClose: () => void; onCreate: (s: CustomSector) => void }) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState(EMOJI_CHOICES[0]);
  const [subtitle, setSubtitle] = useState("");

  const canCreate = label.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(10, 8, 20, 0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(420px, 92vw)", borderRadius: "var(--r-lg)", background: "var(--surface-solid)",
          border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)", padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>Nouvel univers</h3>
          <button type="button" onClick={onClose} className="btn ghost sm" style={{ padding: 6 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Icône</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  style={{
                    width: 36, height: 36, borderRadius: 9, fontSize: 18,
                    border: e === icon ? "2px solid var(--accent)" : "1px solid var(--line)",
                    background: e === icon ? "var(--accent-soft)" : "var(--surface-2)",
                    cursor: "pointer",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Nom de l'univers</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. Sneakers vintage"
              autoFocus
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Sous-titre (optionnel)</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Ex. Paires rares et édition limitée"
              style={{ width: "100%" }}
            />
          </div>

          <div className="note info" style={{ fontSize: 12 }}>
            Cet univers réutilise les mêmes champs que les autres (marque, taille, type…).
            Vous rattachez un article à cet univers depuis sa fiche.
          </div>

          <button
            type="button"
            className="btn primary"
            disabled={!canCreate}
            onClick={() => onCreate({ id: uid(), label: label.trim(), icon, subtitle: subtitle.trim() })}
            style={{ marginTop: 4 }}
          >
            <Plus size={15} /> Créer cet univers
          </button>
        </div>
      </div>
    </div>
  );
}
