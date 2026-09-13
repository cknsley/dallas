import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  Sun,
  Moon,
  Save,
  User,
  RotateCcw,
  CheckCircle2,
  Download,
  Upload,
  Building2,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { useStore } from "../store/StoreContext";
import { useTheme } from "./Theme";
import { Modal } from "./ui";
import { useToast } from "./Toast";
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

export function SidebarMiniMenu() {
  const { state, dispatch, sync, resetDemoData } = useStore();
  const theme = useTheme();
  const navigate = useNavigate();
  const toast = useToast();

  const [openBackupModal, setOpenBackupModal] = useState(false);
  const [openProfileModal, setOpenProfileModal] = useState(false);

  const businessName = state.settings.business?.trim() || "Ma Boutique Resell";
  const legalStatusLabel =
    state.settings.legalStatus === "auto"
      ? "Auto-entreprise"
      : state.settings.legalStatus === "sarl"
      ? "SARL"
      : state.settings.legalStatus === "sas"
      ? "SAS"
      : state.settings.legalStatus === "sasu"
      ? "SASU"
      : "Perso";

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported && typeof imported === "object" && Array.isArray(imported.items)) {
          dispatch({ type: "replace", state: imported });
          toast("Sauvegarde restaurée avec succès !");
          setOpenBackupModal(false);
        } else {
          toast("Fichier JSON invalide (format incompatible)");
        }
      } catch (err) {
        toast("Erreur lors de la lecture du fichier de sauvegarde");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mini-menu-container">
      {/* Visual Sync Badge */}
      <div className="sync-badge" title={sync.detail}>
        <span className={`dot ${sync.status}`} />
        <span className="sync-text">
          <b>{sync.label}</b>
          <small>{sync.detail}</small>
        </span>
      </div>

      {/* Profile summary header */}
      <div className="mini-menu-profile-card">
        <div className="mini-profile-avatar">
          <User size={16} />
        </div>
        <div className="mini-profile-info">
          <strong className="ellipsis">{businessName}</strong>
          <span className="mini-profile-tag">{legalStatusLabel}</span>
        </div>
      </div>

      {/* 4 Action Mini Buttons Grid */}
      <div className="mini-menu-grid">
        {/* 1. Réglages */}
        <button
          type="button"
          className="mini-menu-btn"
          onClick={() => navigate("/reglages")}
          title="Ouvrir les Réglages"
        >
          <Settings size={15} />
          <span>Réglages</span>
        </button>

        {/* 2. Thème */}
        <button
          type="button"
          className="mini-menu-btn"
          onClick={theme.cycle}
          title={`Thème actuel : ${theme.label}`}
        >
          {theme.mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme.mode === "dark" ? "Clair" : "Sombre"}</span>
        </button>

        {/* 3. Sauvegarde */}
        <button
          type="button"
          className="mini-menu-btn"
          onClick={() => setOpenBackupModal(true)}
          title="Sauvegarde & Export"
        >
          <Save size={15} />
          <span>Sauvegarde</span>
        </button>

        {/* 4. Profil */}
        <button
          type="button"
          className="mini-menu-btn"
          onClick={() => setOpenProfileModal(true)}
          title="Profil & Identité"
        >
          <User size={15} />
          <span>Profil</span>
        </button>
      </div>

      {/* Secondary Reset Button */}
      <button
        type="button"
        className="btn ghost sm mini-reset-btn"
        onClick={() => {
          if (window.confirm("Recharger toutes les données de démo (colis, stock, clients & fournisseurs) ?")) {
            resetDemoData();
            toast("Données de démo rechargées");
          }
        }}
      >
        <RotateCcw size={12} />
        <span>Démo RESET</span>
      </button>

      {/* MODAL SAUVEGARDE */}
      {openBackupModal && (
        <Modal
          title="💾 Sauvegarde & Restauration"
          onClose={() => setOpenBackupModal(false)}
          footer={
            <button className="btn" onClick={() => setOpenBackupModal(false)}>
              Fermer
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card-b" style={{ background: "var(--surface-2)", borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={16} style={{ color: "var(--ok)" }} />
                <span>État de la synchronisation locale</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                Toutes vos données (Stock, Ventes, Clients, Charges) sont enregistrées automatiquement en local dans votre navigateur ({sync.detail}).
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                type="button"
                className="btn primary"
                style={{ padding: "14px", flexDirection: "column", gap: 6, height: "auto" }}
                onClick={() => {
                  downloadBackup(state);
                  toast("Fichier de sauvegarde JSON téléchargé");
                }}
              >
                <Download size={20} />
                <span>Télécharger la Sauvegarde (.json)</span>
              </button>

              <label
                className="btn"
                style={{
                  padding: "14px",
                  flexDirection: "column",
                  gap: 6,
                  height: "auto",
                  cursor: "pointer",
                  textAlign: "center",
                  border: "1px dashed var(--accent)",
                }}
              >
                <Upload size={20} style={{ color: "var(--accent)" }} />
                <span>Restaurer un fichier (.json)</span>
                <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: "none" }} />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL PROFIL */}
      {openProfileModal && (
        <Modal
          title="👤 Profil & Identité de l'entreprise"
          onClose={() => setOpenProfileModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpenProfileModal(false)}>
                Fermer
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setOpenProfileModal(false);
                  navigate("/reglages");
                }}
              >
                <Settings size={14} /> Modifier dans Réglages
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, background: "var(--surface-2)" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>{businessName}</h3>
                <span className="pill info" style={{ marginTop: 4, display: "inline-block" }}>
                  {legalStatusLabel}
                </span>
              </div>
            </div>

            <div className="fgrid" style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
                <Mail size={15} style={{ color: "var(--accent)" }} />
                <span>{state.settings.email || "Email non renseigné"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)" }}>
                <Phone size={15} style={{ color: "var(--accent)" }} />
                <span>{state.settings.phone || "Téléphone non renseigné"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)", gridColumn: "span 2" }}>
                <MapPin size={15} style={{ color: "var(--accent)" }} />
                <span>{state.settings.address || "Adresse non renseignée"}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
