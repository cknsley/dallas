import { useMemo } from "react";
import { useStore } from "../store/StoreContext";
import { canFileLitige, soldItems, marginOf, revenueOf, sectorMeta, filterItemsByDomain } from "../lib/calc";
import { eur2 } from "../lib/format";
import { Empty, Section } from "../components/ui";
import RentabilitePanel from "../components/RentabilitePanel";

export default function VentesGlobales() {
  const { state } = useStore();
  const customSectors = state.settings.customSectors ?? [];
  const sectorIds = useMemo(
    () => ["fashion", "tcg", ...customSectors.map((s) => s.id)],
    [customSectors]
  );

  const ventes = useMemo(() => {
    return soldItems(state.items)
      .filter((i) => i.delivery === "livree" && !canFileLitige(i))
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [state.items]);

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <RentabilitePanel state={state} />
      </div>

      <Section title={`Historique des ventes (${ventes.length})`}>
        <div className="card-b">
          {ventes.length === 0 ? (
            <Empty glyph="🛒" title="Aucune vente archivée">
              Les ventes livrées apparaissent ici après la fenêtre SAV de 14 jours.
            </Empty>
          ) : (
            <div className="twrap">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Univers</th>
                    <th>Taille</th>
                    <th className="r">Prix</th>
                    <th className="r">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes.map((v) => {
                    const sectorId = sectorIds.find((id) => filterItemsByDomain([v], id).length > 0) || "fashion";
                    const meta = sectorMeta(sectorId, customSectors);
                    return (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.name || "Sans nom"}</td>
                        <td style={{ fontSize: 12 }}>{meta.icon} {meta.label}</td>
                        <td>{v.size || "—"}</td>
                        <td className="r num" style={{ fontWeight: 700, color: "var(--accent)" }}>{eur2(revenueOf(v))}</td>
                        <td className={`r num ${marginOf(v) >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 700 }}>{eur2(marginOf(v))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
