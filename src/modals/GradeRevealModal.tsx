import { useState } from "react";
import { Award, Sparkles, CheckCircle2, TrendingUp, ShieldCheck } from "lucide-react";
import { Modal } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { useToast } from "../components/Toast";
import { eur } from "../lib/format";
import { costOf } from "../lib/calc";
import type { Item } from "../types";

const GRADING_COMPANIES = ["PSA", "BGS (Beckett)", "PCA", "CGC", "SGS", "Autre"];

const POPULAR_GRADES = [
  { grade: "PSA 10 Gem Mint", multiplier: 2.5, badge: "💎 Gem Mint", color: "#3b82f6" },
  { grade: "PSA 9 Mint", multiplier: 1.4, badge: "🌟 Mint", color: "#6366f1" },
  { grade: "PSA 8 Near Mint", multiplier: 1.0, badge: "⭐ NM-MT", color: "#a855f7" },
  { grade: "BGS 10 Pristine", multiplier: 4.0, badge: "👑 Pristine / Black", color: "#eab308" },
  { grade: "BGS 9.5 Gem Mint", multiplier: 2.2, badge: "🔮 Gem Mint", color: "#06b6d4" },
  { grade: "PCA 10 Gem Mint", multiplier: 2.0, badge: "🇫🇷 Gem Mint", color: "#ef4444" },
  { grade: "PCA 9.5", multiplier: 1.5, badge: "🇫🇷 Mint+", color: "#f97316" },
  { grade: "CGC 10 Pristine", multiplier: 3.0, badge: "✨ Pristine", color: "#10b981" },
];

export default function GradeRevealModal({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();

  const [company, setCompany] = useState(item.gradingCompany || "PSA");
  const [selectedGrade, setSelectedGrade] = useState("PSA 10 Gem Mint");
  const [isRevealed, setIsRevealed] = useState(false);

  const rawCost = costOf(item);
  const currentEst = item.estimatedPrice || rawCost * 1.5;

  const [newEstimate, setNewEstimate] = useState<string>(() => {
    return String(Math.round(currentEst * 2));
  });

  const handleSelectGrade = (gradeName: string, mult: number) => {
    setSelectedGrade(gradeName);
    const suggested = Math.round(Math.max(rawCost * mult, currentEst * (mult > 1 ? mult * 0.8 : 1)));
    setNewEstimate(String(suggested));
  };

  const handleConfirmReveal = () => {
    const finalGrade = selectedGrade;
    const finalPrice = parseFloat(newEstimate) || currentEst;

    // Mise à jour de l'article avec la note révélée
    const updatedName = item.name.includes("[")
      ? item.name.replace(/\[.*?\]/, `[${finalGrade}]`)
      : `${item.name} [${finalGrade}]`;

    const updatedItem: Item = {
      ...item,
      name: updatedName,
      isTcg: true,
      tcgCategory: "graded",
      tcgGrade: finalGrade,
      gradingCompany: company,
      estimatedPrice: finalPrice,
      status: "stock",
    };

    dispatch({ type: "upsertItem", item: updatedItem });

    setIsRevealed(true);
    toast(`🎉 Note révélée avec succès ! ${finalGrade} attribué à ${item.name}`);
  };

  return (
    <Modal
      title="✨ Reveal de Note TCG — Gradation Retour"
      onClose={onClose}
      wide
    >
      <div style={{ padding: "8px 0" }}>
        {!isRevealed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header info carte */}
            <div
              style={{
                background: "rgba(255, 215, 0, 0.08)",
                border: "1px solid rgba(255, 215, 0, 0.25)",
                borderRadius: 12,
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(234, 179, 8, 0.4)",
                  flexShrink: 0,
                }}
              >
                <Award size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                  Carte retour de gradation
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-main)" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                  {item.tcgGame ? `Jeu: ${item.tcgGame}` : "TCG"} {item.tcgSet ? `· Set: ${item.tcgSet}` : ""} · Coût d'achat: {eur(rawCost)}
                </div>
              </div>
            </div>

            {/* Organisme de gradation */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>
                1. Organisme de gradation
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {GRADING_COMPANIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`btn ${company === c ? "primary" : "secondary"}`}
                    onClick={() => setCompany(c)}
                    style={{ fontSize: 13, padding: "6px 14px" }}
                  >
                    {company === c && <ShieldCheck size={14} style={{ marginRight: 4 }} />}
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Sélection de la note obtenue */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>
                2. Note attribuée (Découverte) ✨
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {POPULAR_GRADES.map((g) => {
                  const isSelected = selectedGrade === g.grade;
                  return (
                    <button
                      key={g.grade}
                      type="button"
                      onClick={() => handleSelectGrade(g.grade, g.multiplier)}
                      style={{
                        padding: "12px",
                        borderRadius: 10,
                        textAlign: "left",
                        cursor: "pointer",
                        border: isSelected ? `2px solid ${g.color}` : "1px solid var(--border-color, rgba(255,255,255,0.1))",
                        background: isSelected ? `${g.color}15` : "rgba(255,255,255,0.03)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: isSelected ? g.color : "inherit" }}>
                        {g.grade}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                        <span>{g.badge}</span>
                        <span style={{ fontWeight: 700 }}>~x{g.multiplier}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ajustement de l'estimation du prix */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 10 }}>
              <TrendingUp size={24} style={{ color: "#10b981", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Prix de revente estimé avec cette note
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Mise à jour recommandée selon la cotation du marché pour {selectedGrade}.
                </div>
              </div>
              <div style={{ width: 110 }}>
                <input
                  type="number"
                  className="input"
                  value={newEstimate}
                  onChange={(e) => setNewEstimate(e.target.value)}
                  placeholder="ex: 150"
                  style={{ textAlign: "right", fontWeight: 800, fontSize: 15 }}
                />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>€</div>
            </div>

            {/* Bouton de confirmation */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button type="button" className="btn secondary" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleConfirmReveal}
                style={{
                  background: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)",
                  borderColor: "#ca8a04",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                }}
              >
                <Sparkles size={18} />
                <span>Révéler & Sauvegarder en Stock</span>
              </button>
            </div>
          </div>
        ) : (
          /* Écran de célébration post reveal */
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                boxShadow: "0 10px 25px rgba(16, 185, 129, 0.4)",
              }}
            >
              <CheckCircle2 size={44} color="#fff" />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
              Note Débloquée : {selectedGrade} !
            </h3>
            <p style={{ fontSize: 14, opacity: 0.8, maxWidth: 400, margin: "0 auto 20px auto" }}>
              Votre carte <strong>{item.name}</strong> a été mise à jour en Stock avec une valeur estimée à{" "}
              <strong>{eur(parseFloat(newEstimate) || currentEst)}</strong>.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button type="button" className="btn primary" onClick={onClose}>
                Terminer
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
