import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUp, ArrowDown, Plus, X, Trash2, DollarSign, TrendingUp, Wallet, Boxes, Sparkles, CheckSquare } from "lucide-react";
import { Confirm, Modal } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { computeStats, filterSourcingByDomain, periodRange, sectorMeta, todoDomain } from "../lib/calc";
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
  const [addOpen, setAddOpen] = useState(false);
  const [deletingSector, setDeletingSector] = useState<CustomSector | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [draftVault, setDraftVault] = useState("");

  const allTime = useMemo(() => periodRange("all"), []);
  const global = useMemo(() => computeStats(state, allTime), [state, allTime]);
  const last7 = useMemo(() => computeStats(state, lastNDaysRange(7)), [state]);
  const last30 = useMemo(() => computeStats(state, lastNDaysRange(30)), [state]);
  const vaultAmount = state.settings.vaultAmount || 0;
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

  // Tous les articles de sourcing actifs
  const allSourcing = useMemo(
    () => state.todos.filter((t) => t.isSourcing || t.col === "acheter"),
    [state.todos],
  );
  const activeSourcing = useMemo(
    () => allSourcing.filter((t) => !t.ordered && t.col !== "termine"),
    [allSourcing],
  );
  const sourcingBySector = useMemo(() => {
    const counts: Record<string, number> = {};
    allSectorIds.forEach((id) => {
      counts[id] = filterSourcingByDomain(activeSourcing, id).length;
    });
    return counts;
  }, [allSectorIds, activeSourcing]);


  const addSector = (sector: CustomSector) => {
    dispatch({ type: "settings", patch: { customSectors: [...customSectors, sector] } });
    setAddOpen(false);
  };

  const removeSector = (id: string) => {
    dispatch({ type: "settings", patch: { customSectors: customSectors.filter((s) => s.id !== id) } });
  };

  return (
    <div className="home-v2">
      {/* ── BANNIÈRE HERO : CHIFFRES CLÉS ── */}
      <section className="home-hero-cockpit">
        <div className="home-hero-top">
          <div className="home-stats-bar">
            <div className="home-kpi-pill index-card">
              <span className="ic-wrap"><TrendingUp size={16} /></span>
              <div>
                <span className="lbl">Chiffre d'Affaires</span>
                <b className="val">{eur(global.ca)}</b>
                <div className="kpi-trend-lines">
                  <TrendLine label="7j" value={last7.ca} />
                  <TrendLine label="30j" value={last30.ca} />
                </div>
              </div>
            </div>

            <div className="home-kpi-pill index-card good">
              <span className="ic-wrap"><DollarSign size={16} /></span>
              <div>
                <span className="lbl">Marge Nette</span>
                <b className="val">{eur(global.margeNette)}</b>
                <div className="kpi-trend-lines">
                  <TrendLine label="7j" value={last7.margeNette} />
                  <TrendLine label="30j" value={last30.margeNette} />
                </div>
              </div>
            </div>

            <button type="button" className="home-kpi-pill compact info clickable" onClick={() => { setDraftVault(vaultAmount ? String(vaultAmount) : ""); setVaultOpen(true); }} title="Cliquer pour modifier">
              <span className="ic-wrap"><Wallet size={16} /></span>
              <span className="lbl">Trésorerie</span>
              <b className="val">{eur(vaultAmount)}</b>
            </button>

            <div className="home-kpi-pill compact">
              <span className="ic-wrap"><Boxes size={16} /></span>
              <span className="lbl">Stock</span>
              <b className="val">{eur(global.stockEstimate)} · {global.enStock + global.arrivage} art.</b>
            </div>

            <Link
              to="/todo"
              className="home-kpi-pill compact clickable"
              title="Ouvrir le Todo centralisé de tous les univers"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="ic-wrap"><CheckSquare size={16} /></span>
              <span className="lbl">Todo Global</span>
              <b className="val">{state.todos.filter(t => t.col !== 'termine' && !t.isSourcing && t.col !== 'acheter').length} à faire</b>
            </Link>

            <Link
              to="/sourcing"
              className="home-kpi-pill compact clickable"
              title="Ouvrir le Sourcing centralisé de tous les univers"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="ic-wrap"><Sparkles size={16} /></span>
              <span className="lbl">Sourcing</span>
              <b className="val">{activeSourcing.length} à trouver</b>
            </Link>
          </div>
        </div>
      </section>

      {vaultOpen && (
        <Modal
          title="🔒 Trésorerie"
          onClose={() => setVaultOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setVaultOpen(false)}>Annuler</button>
              <button
                className="btn primary"
                onClick={() => {
                  dispatch({ type: "settings", patch: { vaultAmount: num(draftVault) } });
                  setVaultOpen(false);
                }}
              >
                Enregistrer
              </button>
            </>
          }
        >
          <label style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, display: "block", marginBottom: 6 }}>
            Montant de trésorerie disponible
          </label>
          <input
            type="number"
            step="0.01"
            autoFocus
            value={draftVault}
            onChange={(e) => setDraftVault(e.target.value)}
            placeholder="0,00"
            style={{ width: "100%" }}
          />
        </Modal>
      )}

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
            const isCustom = customSectors.some((s) => s.id === domain);
            return (
              <Link key={domain} to={`/achats?secteur=${domain}`} className="home-sector">
                {isCustom && (
                  <button
                    type="button"
                    className="home-sector-del"
                    title="Supprimer cet univers"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeletingSector(customSectors.find((s) => s.id === domain) ?? null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
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
                  <div>
                    <dt>Sourcing</dt>
                    <dd>{sourcingBySector[domain] || 0}</dd>
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

      {/* ── SOURCING CENTRALISÉ — TOUS UNIVERS ── */}
      <section className="home-section" style={{ marginTop: 24 }}>
        <div className="home-section-title">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2>🛒 Sourcing Centralisé</h2>
              <span className="hint">Toutes vos opportunités et recherches d'achat réunies par univers (Vêtements, TCG...)</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link to="/sourcing" className="btn sm primary" style={{ textDecoration: "none" }}>
                Ouvrir Sourcing ({activeSourcing.length}) <ArrowRight size={14} style={{ marginLeft: 4 }} />
              </Link>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <div className="pill info" style={{ padding: "6px 12px", fontSize: 12 }}>
              🔎 <b>{activeSourcing.filter((t) => !t.dueDate).length}</b> &nbsp; À rechercher
            </div>
            <div className="pill warn" style={{ padding: "6px 12px", fontSize: 12 }}>
              💬 <b>{activeSourcing.filter((t) => !!t.dueDate).length}</b> &nbsp; En négociation
            </div>
            <div className="pill good" style={{ padding: "6px 12px", fontSize: 12 }}>
              ✓ <b>{allSourcing.filter((t) => t.ordered || t.col === "termine").length}</b> &nbsp; Trouvés / Commandés
            </div>
          </div>

          {activeSourcing.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--ink-3)" }}>
              <p style={{ margin: "0 0 12px 0", fontSize: 14 }}>Aucun produit en sourcing actif pour le moment.</p>
              <Link to="/sourcing" className="btn sm primary">
                🛒 + Ajouter un produit à sourcer
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {activeSourcing.slice(0, 4).map((t) => {
                const sDom = todoDomain(t);
                const sMeta = sectorMeta(sDom, customSectors);
                const isNego = !!t.dueDate;
                return (
                  <div
                    key={t.id}
                    className="card"
                    style={{
                      padding: "14px 16px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                        <span className="pill info" style={{ fontSize: 11, fontWeight: 600 }}>
                          {sMeta.icon} {sMeta.label}
                        </span>
                        <span className={`pill ${isNego ? "warn" : "ghost"}`} style={{ fontSize: 10 }}>
                          {isNego ? "💬 En négo" : "🔎 À chercher"}
                        </span>
                      </div>
                      <b style={{ fontSize: 14, display: "block", color: "var(--ink)" }}>{t.text}</b>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, fontSize: 11 }}>
                        {t.sourcingBrand && <span className="pill ghost">{t.sourcingBrand}</span>}
                        {t.sourcingPrice && t.sourcingPrice > 0 ? (
                          <span className="pill good">Budget: {eur(t.sourcingPrice)}</span>
                        ) : null}
                        {t.supplierName && <span className="pill ghost">🏢 {t.supplierName}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <Link to={`/sourcing?secteur=${sDom}`} className="btn sm ghost" style={{ fontSize: 11 }}>
                        Voir dans {sMeta.label} →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── NÉGOCIER : ACHAT / VENTE ── */}
      <section className="home-section" style={{ marginTop: 24 }}>
        <div className="home-section-title">
          <h2>🤝 Négocier</h2>
          <span className="hint">Simulez un rachat ou une vente avant de vous engager</span>
        </div>

        <div className="home-sectors">
          <Link to="/deal/achat" className="home-sector">
            <span className="home-sector-ic">🎯</span>
            <h2>Achat</h2>
            <p>Simuler un rachat — article seul ou lot — avant de s'engager</p>
            <span className="home-sector-go">
              Ouvrir Achat <ArrowRight size={15} />
            </span>
          </Link>

          <Link to="/deal/vente" className="home-sector">
            <span className="home-sector-ic">🏷️</span>
            <h2>Vente</h2>
            <p>Simuler une vente ou une remise — lot ou article seul</p>
            <span className="home-sector-go">
              Ouvrir Vente <ArrowRight size={15} />
            </span>
          </Link>
        </div>
      </section>

      {addOpen && <AddSectorModal onClose={() => setAddOpen(false)} onCreate={addSector} />}

      {deletingSector && (
        <Confirm
          title="Supprimer cet univers ?"
          body={
            <>
              « {deletingSector.label} » disparaîtra de l'accueil. Les articles déjà rattachés restent en stock,
              mais leur page dédiée n'existera plus.
            </>
          }
          onConfirm={() => removeSector(deletingSector.id)}
          onClose={() => setDeletingSector(null)}
        />
      )}
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

/** Ligne de tendance façon indice boursier : flèche + période + montant, colorée selon le signe. */
function TrendLine({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <span className={`kpi-trend-line ${positive ? "up" : "down"}`}>
      {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {label} · {eur(Math.abs(value))}
    </span>
  );
}
