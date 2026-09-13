import { Link } from "react-router-dom";
import { ArrowRight, Building2, DollarSign, FileText, Scale, Users } from "lucide-react";
import { links } from "../lib/links";

const SECTIONS = [
  { to: links.fournisseurs(), icon: Building2, label: "Fournisseurs", subtitle: "Achats, dettes fournisseurs et créances clients" },
  { to: links.charges(), icon: DollarSign, label: "Charges", subtitle: "Matériel, emballages et abonnements de l'activité" },
  { to: links.bilan(), icon: Scale, label: "Bilan", subtitle: "Ce que vous possédez et ce que l'activité dégage" },
  { to: links.facturation(), icon: FileText, label: "Facturation", subtitle: "Factures, reçus et régime de TVA" },
  { to: links.clients(), icon: Users, label: "Clients", subtitle: "Acheteurs et historique d'achat" },
];

/**
 * Comptabilité : hub transverse qui regroupe toutes les sections "Comptes" —
 * jamais filtré par secteur, ces pages réunissent Vêtements et TCG.
 */
export default function Comptabilite() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 28px", borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
        <Link to="/" title="Retour à l'accueil" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
          <span style={{ fontSize: 20 }}>←</span>
        </Link>
      </header>

      <main style={{ flex: 1, padding: "28px" }}>
        <div className="hub-header">
          <span className="hub-header-ic">🧾</span>
          <div>
            <h2>Comptabilité</h2>
            <div className="hint">Toutes les sections comptables, communes aux deux secteurs</div>
          </div>
        </div>

        <div className="hub-grid" style={{ marginTop: 20 }}>
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.to} to={s.to} className="kpi hub-tile">
                <span className="hub-tile-ic">
                  <Icon size={20} />
                </span>
                <div className="hub-tile-lbl">{s.label}</div>
                <div className="hub-tile-sub">{s.subtitle}</div>
                <span className="go">
                  <ArrowRight size={14} />
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
