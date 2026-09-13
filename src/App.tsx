import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import PerformancePage from "./pages/PerformancePage";
import Stock from "./pages/Stock";
import TcgPage from "./pages/TcgPage";
import CentraleAchat from "./pages/CentraleAchat";
import Ventes from "./pages/Ventes";
import Livraison from "./pages/Livraison";
import Sav from "./pages/Sav";
import Bilan from "./pages/Bilan";
import Deal from "./pages/Deal";
import Clients from "./pages/Clients";
import Fournisseurs from "./pages/Fournisseurs";
import Charges from "./pages/Charges";
import Todo from "./pages/Todo";
import Sourcing from "./pages/Sourcing";
import Facturation from "./pages/Facturation";
import Reglages from "./pages/Reglages";
import SecteurHub from "./pages/SecteurHub";
import Home from "./pages/Home";

export default function App() {
  return (
    <Routes>
      {/* L'accueil est une interface à part : pas de cockpit, on y choisit son univers. */}
      <Route index element={<Home />} />

      <Route element={<Layout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="secteur" element={<SecteurHub />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="stock" element={<Stock />} />
        <Route path="tcg" element={<TcgPage />} />
        <Route path="achats" element={<CentraleAchat />} />
        <Route path="arrivage" element={<Navigate to="/achats" replace />} />
        <Route path="ventes" element={<Ventes />} />
        <Route path="livraison" element={<Livraison />} />
        <Route path="sav" element={<Sav />} />
        <Route path="retours" element={<Navigate to="/sav?tab=retours" replace />} />
        <Route path="colis" element={<Navigate to="/livraison" replace />} />
        <Route path="bilan" element={<Bilan />} />
        <Route path="deal" element={<Deal />} />
        <Route path="clients" element={<Clients />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
        <Route path="marge" element={<Navigate to="/bilan" replace />} />
        <Route path="charges" element={<Charges />} />
        <Route path="todo" element={<Todo />} />
        <Route path="sourcing" element={<Sourcing />} />
        <Route path="facturation" element={<Facturation />} />
        <Route path="reglages" element={<Reglages />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
