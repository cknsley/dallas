import { HeaderActions } from "../components/Layout";
import { useSecteur } from "../lib/useSecteur";

export default function Gradation() {
  const secteur = useSecteur();
  return (
    <>
      <HeaderActions>
        <span className="hint">Espace Gradation ({secteur.domain})</span>
      </HeaderActions>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-h">
          <h3>Gradation des Cartes</h3>
        </div>
        <div className="card-b">
          <p className="hint">Suivi des cartes envoyées en gradation.</p>
        </div>
      </div>
    </>
  );
}
