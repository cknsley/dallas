import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Stock from "./pages/Stock";
import Ventes from "./pages/Ventes";
import Livraison from "./pages/Livraison";
import Bilan from "./pages/Bilan";
import Deal from "./pages/Deal";
import Clients from "./pages/Clients";
import Charges from "./pages/Charges";
import Todo from "./pages/Todo";
import Facturation from "./pages/Facturation";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="stock" element={<Stock />} />
        <Route path="ventes" element={<Ventes />} />
        <Route path="livraison" element={<Livraison />} />
        <Route path="colis" element={<Navigate to="/livraison" replace />} />
        <Route path="bilan" element={<Bilan />} />
        <Route path="deal" element={<Deal />} />
        <Route path="clients" element={<Clients />} />
        <Route path="marge" element={<Navigate to="/bilan" replace />} />
        <Route path="charges" element={<Charges />} />
        <Route path="todo" element={<Todo />} />
        <Route path="facturation" element={<Facturation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
