import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, X, DollarSign, TrendingUp, Package, Wallet, Boxes } from "lucide-react";
import { Modal } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { computeStats, periodRange, sectorMeta } from "../lib/calc";
import { eur, num } from "../lib/format";
import { uid } from "../lib/id";
import type { CustomSector } from "../types";

/** Un intervalle glissant de n jours se terminant aujourd'hui (inclus). */
function lastNDaysRange(n: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (n - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), label: `${n} derniers jours`, bounded: true };
}

const BUILTIN_SECTORS = ["fashion", "tcg"] as const;
const EMOJI_CHOICES = ["📦", "👟", "👜", "💍", "🎮", "📱", "🧸", "🎨", "🏠", "⌚️", "📚", "🎧"];

export default function Home() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const allTime = useMemo(() => periodRange("all"), []);
  const global = useMemo(() => computeStats(state, allTime), [state, allTime]);
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


  const addSector = (sector: CustomSector) => {
    dispatch({ type: "settings", patch: { customSectors: [...customSectors, sector] } });
    setAddOpen(false);
  };

  return (
    <div className="home-v2">
      {/* ── BANNIÈRE HERO : CHIFFRES CLÉS & +NOUVEAU & ONGLETS DE L'ACCUEIL ── */}
      <section className="home-hero-cockpit">
        {/* En-tête Chiffres Clés (CA, Marge, Trésorerie / Stock) */}
        <div className="home-hero-top">
          <div className="home-stats-bar">
            <div className="home-kpi-pill">
              <span className="ic-wrap"><TrendingUp size={16} /></span>
              <div>
                <span className="lbl">Chiffre d'Affaires</span>
                <b className="val">{eur(global.ca)}</b>
              </div>
            </div>

            <div className="home-kpi-pill good">
              <span className="ic-wrap"><DollarSign size={16} /></span>
              <div>
                <span className="lbl">Marge Nette</span>
                <b className="val">{eur(global.margeNette)}</b>
              </div>
            </div>

            <div className="home-kpi-pill info">
              <span className="ic-wrap"><Wallet size={16} /></span>
              <div>
                <span className="lbl">Trésorerie & Stock</span>
                <b className="val">{eur(global.stockEstimate)}</b>
              </div>
            </div>

            <div className="home-kpi-pill">
              <span className="ic-wrap"><Package size={16} /></span>
              <div>
                <span className="lbl">Articles</span>
                <b className="val">{global.enStock + global.arrivage} en stock</b>
              </div>
            </div>
          </div>

          <div className="home-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Bouton + Nouveau qui lie à la Centrale d'achat avec choix de la catégorie */}
            <MenuButton
              label="+ Nouveau"
              options={[
                { value: "fashion", label: "👕 Nouveau dans Vêtements", note: "Ouvrir la centrale Vêtements" },
                { value: "tcg", label: "🏷️ Nouveau dans Tag / Cartes", note: "Ouvrir la centrale TCG" },
                ...customSectors.map((cs) => ({
                  value: cs.id,
                  label: `${cs.icon} Nouveau dans ${cs.label}`,
                  note: `Ouvrir la centrale ${cs.label}`,
                })),
              ]}
              onSelect={(v) => navigate(`/achats?secteur=${v}`)}
            />
          </div>
        </div>
      </section>

      {/* ── ACCÈS AUX PAGES UNIVERS JUSTE EN DESSOUS ── */}
      <section className="home-section" style={{ marginTop: 24 }}>
        <div className="home-section-title">
          <h2>🌐 Accès aux Pages Univers</h2>
          <span className="hint">Choisissez un univers pour accéder au Pilotage (Centrale, Stock, Arrivage) et à l'Activité (Sourcing, Ventes, SAV)</span>
        </div>

        <div className="home-sectors">
          {allSectorIds.map((domain) => {
            const meta = sectorMeta(domain, customSectors);
            const s = statsById[domain];
            return (
              <Link key={domain} to={`/achats?secteur=${domain}`} className="home-sector">
                <span className="home-sector-ic">{meta.icon}</span>
                <h2>Page {meta.label}</h2>
                <p>{meta.subtitle}</p>
                <dl className="home-sector-stats">
                  <div>
                    <dt>Stock estimé</dt>
                    <dd>{eur(s.stockEstimate)}</dd>
                  </div>
                  <div>
                    <dt>Articles</dt>
                    <dd>{s.enStock + s.arrivage}</dd>
                  </div>
                  <div>
                    <dt>CA</dt>
                    <dd>{eur(s.ca)}</dd>
                  </div>
                </dl>
                <span className="home-sector-go">
                  Ouvrir la page {meta.label} <ArrowRight size={15} />
                </span>
              </Link>
            );
          })}

          <button type="button" className="home-sector home-sector-add" onClick={() => setAddOpen(true)}>
            <span className="home-sector-add-ic">
              <Plus size={26} />
            </span>
            <span className="home-sector-add-lbl">Ajouter un univers</span>
            <span className="home-sector-add-sub">Créer une nouvelle page secteur sur-mesure</span>
          </button>
        </div>
      </section>

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
