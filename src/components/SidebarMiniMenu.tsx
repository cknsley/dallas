import { useNavigate } from "react-router-dom";
import { Settings, Sun, Moon, User } from "lucide-react";
import { useTheme } from "./Theme";
import type { AppState } from "../types";

export function downloadBackup(state: AppState) {
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resell-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pied de sidebar réduit au strict nécessaire : Réglages et bascule de thème. */
export function SidebarMiniMenu() {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <div className="mini-menu-container">
      <div className="mini-menu-grid">
        <button
          type="button"
          className="mini-menu-btn"
          onClick={() => navigate("/reglages")}
          title="Ouvrir les Réglages"
        >
          <Settings size={15} />
          <span>Réglages</span>
        </button>

        <button
          type="button"
          className="mini-menu-btn"
          onClick={theme.cycle}
          title={`Thème actuel : ${theme.label}`}
        >
          {theme.mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme.mode === "dark" ? "Clair" : "Sombre"}</span>
        </button>
      </div>

      <button type="button" className="mini-menu-btn mini-menu-btn-wide" title="Mon compte">
        <User size={15} />
        <span>Mon compte</span>
      </button>
    </div>
  );
}
