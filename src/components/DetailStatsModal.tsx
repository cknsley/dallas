import { Modal } from "./ui";
import { computeStats, periodRange, sectorMeta, type Stats } from "../lib/calc";
import { eur } from "../lib/format";
import { useStore } from "../store/StoreContext";
import type { Period } from "../types";
import { useMemo } from "react";

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{sub}</span>}
      </span>
    </div>
  );
}

function SectorBlock({ label, icon, s }: { label: string; icon: string; s: Stats }) {
  const marginPct = s.ca ? Math.round((s.margeNette / s.ca) * 100) : 0;
  return (
    <div style={{ padding: 16, borderRadius: "var(--r)", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontWeight: 600 }}>
        <span>{icon}</span> {label}
      </div>
      <Row label="Chiffre d'affaires" value={eur(s.ca)} />
      <Row label="Marge réalisée" value={eur(s.margeNette)} sub={`${marginPct}%`} />
      <Row label="Valeur du stock" value={eur(s.stockEstimate)} />
      <Row label="Articles vendus" value={String(s.count)} />
    </div>
  );
}

/**
 * Fenêtre popup avec les chiffres clés, à la place d'une navigation vers une
 * autre page : reste sur l'écran courant, montre le détail par secteur.
 */
export default function DetailStatsModal({ period, onClose }: { period: Period; onClose: () => void }) {
  const { state } = useStore();
  const range = useMemo(() => periodRange(period), [period]);
  const global = useMemo(() => computeStats(state, range), [state, range]);
  const customSectors = state.settings.customSectors ?? [];
  const sectorIds = useMemo(() => ["fashion", "tcg", ...customSectors.map((s) => s.id)], [customSectors]);
  const bySector = useMemo(
    () => sectorIds.map((id) => ({ id, meta: sectorMeta(id, customSectors), s: computeStats(state, range, id) })),
    [sectorIds, customSectors, state, range],
  );
  const marginPct = global.ca ? Math.round((global.margeNette / global.ca) * 100) : 0;

  return (
    <Modal title="Détail des chiffres" onClose={onClose} wide>
      <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, borderRadius: "var(--r)", background: "var(--accent-soft)", border: "1px solid var(--line-2)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tous les secteurs réunis</div>
          <Row label="Chiffre d'affaires" value={eur(global.ca)} />
          <Row label="Marge réalisée" value={eur(global.margeNette)} sub={`${marginPct}%`} />
          <Row label="Valeur estimée du stock" value={eur(global.stockEstimate)} />
          <Row label="Articles vendus" value={String(global.count)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {bySector.map(({ id, meta, s }) => (
            <SectorBlock key={id} label={meta.label} icon={meta.icon} s={s} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
