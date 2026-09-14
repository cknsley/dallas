import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import CentraleAchat from "./pages/CentraleAchat";
import Arrivage from "./pages/Arrivage";
import Ventes from "./pages/Ventes";
import VentesGlobales from "./pages/VentesGlobales";
import Livraison from "./pages/Livraison";
import Sav from "./pages/Sav";
import Bilan from "./pages/Bilan";
import Balance from "./pages/Balance";
import { DealAchat, DealVente } from "./pages/Deal";
import Clients from "./pages/Clients";
import Fournisseurs from "./pages/Fournisseurs";
import Charges from "./pages/Charges";
import Todo from "./pages/Todo";
import Sourcing from "./pages/Sourcing";
import Facturation from "./pages/Facturation";
import Reglages from "./pages/Reglages";
import SecteurHub from "./pages/SecteurHub";
import Home from "./pages/Home";
import Comptabilite from "./pages/Comptabilite";
import Gradation from "./pages/Gradation";

export default function App() {
  return (
    <Routes>
      <Route path="secteur" element={<SecteurHub />} />

      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ventes-globales" element={<VentesGlobales />} />
        <Route path="performance" element={<Navigate to="/dashboard" replace />} />
        <Route path="comptabilite" element={<Comptabilite />} />
        <Route path="stock" element={<Stock />} />
        {/* L'ancienne page TCG isolée : l'espace TCG vit désormais dans les pages secteur, comme Vêtements. */}
        <Route path="tcg" element={<Navigate to="/stock?secteur=tcg" replace />} />
        <Route path="achats" element={<CentraleAchat />} />
        <Route path="arrivage" element={<Arrivage />} />
        <Route path="ventes" element={<Ventes />} />
        <Route path="livraison" element={<Livraison />} />
        <Route path="sav" element={<Sav />} />
        <Route path="retours" element={<Navigate to="/sav?tab=retours" replace />} />
        <Route path="colis" element={<Navigate to="/livraison" replace />} />
        <Route path="balance" element={<Balance />} />
        <Route path="bilan" element={<Bilan />} />
        <Route path="deal" element={<DealAchat />} />
        <Route path="deal/achat" element={<DealAchat />} />
        <Route path="deal/vente" element={<DealVente />} />
        <Route path="clients" element={<Clients />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
        <Route path="marge" element={<Navigate to="/bilan" replace />} />
        <Route path="charges" element={<Charges />} />
        <Route path="todo" element={<Todo />} />
        <Route path="sourcing" element={<Sourcing />} />
        <Route path="facturation" element={<Facturation />} />
        <Route path="reglages" element={<Reglages />} />
        <Route path="gradation" element={<Gradation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
