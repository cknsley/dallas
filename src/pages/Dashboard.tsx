import { useMemo, useState } from "react";
import { BarChart3, ArrowRight } from "lucide-react";
import { HeaderActions } from "../components/Layout";
import { Segmented } from "../components/ui";
import DetailStatsModal from "../components/DetailStatsModal";
import { useStore } from "../store/StoreContext";
import { usePref } from "../lib/usePref";
import { computeStats, periodRange } from "../lib/calc";
import { eur } from "../lib/format";
import type { Period } from "../types";

/**
 * Vue générale simplifée : 4 KPIs principales + bouton qui ouvre le détail
 * en popup sur place (pas de navigation vers une autre page/route).
 */
export default function Dashboard() {
  const { state } = useStore();
  const [detailOpen, setDetailOpen] = useState(false);
  const [period, setPeriod] = usePref<Period>("period", "month");

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(state, range), [state, range]);

  // Infer margin percentage
  const marginPct = stats.ca ? Math.round((stats.margeNette / stats.ca) * 100) : 0;

  const kpis = [
    { label: "Chiffre d'affaires", value: eur(stats.ca), icon: "📊" },
    { label: "Marge réalisée", value: eur(stats.margeNette), subtext: `${marginPct}%`, icon: "📈" },
    { label: "Valeur estimée du stock", value: eur(stats.stockEstimate), icon: "📦" },
    { label: "Articles vendus", value: String(stats.count), icon: "🛍️" },
  ];

  return (
    <>
      <HeaderActions>
        <button className="btn primary" onClick={() => setDetailOpen(true)}>
          <BarChart3 size={15} /> Voir le détail complet
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="kpi"
            style={{
              padding: 24,
              borderRadius: "var(--r-lg)",
              background: "var(--surface)",
              backdropFilter: "var(--blur)",
              border: "1px solid var(--line)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>{kpi.icon}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {kpi.value}
            </div>
            {kpi.subtext && (
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{kpi.subtext}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button
          className="btn primary"
          onClick={() => setDetailOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px" }}
        >
          Accéder au détail complet <ArrowRight size={16} />
        </button>
      </div>

      {detailOpen && <DetailStatsModal period={period} onClose={() => setDetailOpen(false)} />}
    </>
  );
}
