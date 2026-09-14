import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Field, Kpi, Modal, Photo } from "../components/ui";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { useSecteur } from "../lib/useSecteur";
import { itemAttr } from "../lib/sectorFields";
import { links } from "../lib/links";
import { revenueOf } from "../lib/calc";
import { dfr, eur, eur2, today } from "../lib/format";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import ReturnModal, { emptyReturn } from "../modals/ReturnModal";
import type { Item, LitigeStatus, PersonalLitige } from "../types";

const blankPersonalLitige = (): PersonalLitige => ({
  id: `pl-${Date.now()}`,
  title: "",
  counterparty: "",
  category: "Perso",
  status: "en_cours",
  openedDate: today(),
  notes: "",
  createdAt: Date.now(),
});

export default function Sav() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const secteur = useSecteur();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);
  const [convertingReturn, setConvertingReturn] = useState<Item | null>(null);
  const [personalOpen, setPersonalOpen] = useState(true);
  const [editingPersonal, setEditingPersonal] = useState<PersonalLitige | null>(null);

  // Formulaire Litige
  const [litigeItem, setLitigeItem] = useState<Item | null>(null);
  const [litigeState, setLitigeState] = useState<"en_cours" | "attente" | "resolu">("en_cours");
  const [noteCategory, setNoteCategory] = useState("💬 Échange Acheteur");
  const [noteText, setNoteText] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string } | null>(null);

  // Helper : vérifier si une vente validée a dépassé 14 jours
  const isExpiredAfter14Days = (i: Item): boolean => {
    if (i.delivery !== "livree" || i.shipping !== "recu") return false;
    const dateStr = i.validationDate || i.shipDate || i.saleDate;
    if (!dateStr) return false;
    const vTime = new Date(dateStr + "T12:00:00").getTime();
    const diffDays = (Date.now() - vTime) / (1000 * 60 * 60 * 24);
    return diffDays > 14;
  };

  // Articles vendus pertinents pour le SAV (non expirés après 14j si validés)
  const soldItems = useMemo(
    () => secteur.items.filter((i) => i.status === "vendu" && !isExpiredAfter14Days(i)),
    [secteur.items]
  );

  // Commandes avec litige / notes SAV actifs
  const litiges = useMemo(
    () =>
      soldItems.filter(
        (i) =>
          i.litigeState === "en_cours" ||
          i.litigeState === "attente" ||
          (i.notes && (i.notes.toLowerCase().includes("litige") || i.notes.toLowerCase().includes("sav"))) ||
          (i.litigeLogs && i.litigeLogs.length > 0)
      ),
    [soldItems]
  );

  /** Les ventes récentes : le point d'entrée pour ouvrir un dossier. */
  const displayedList = useMemo(() => {
    let list = soldItems;
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.brand?.toLowerCase().includes(q) ||
          i.buyer?.toLowerCase().includes(q) ||
          i.tracking?.toLowerCase().includes(q) ||
          i.platform?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [soldItems, query]);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  /** Ouvrir le formulaire de litige pour un article */
  const openLitigeSection = (i: Item) => {
    setLitigeItem(i);
    setLitigeState(i.litigeState || "en_cours");
    setNoteCategory("💬 Échange Acheteur");
    setNoteText("");
    setAttachedFile(
      i.litigeFile ? { url: i.litigeFile, name: i.litigeFileName || "Pièce jointe" } : null
    );
  };

  /** Enregistrer une nouvelle note / mise à jour du litige avec horodatage et pièce jointe */
  const saveLitigeNote = () => {
    if (!litigeItem) return;
    const nowStr = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const newLog = {
      id: "log-" + Date.now(),
      date: nowStr,
      category: noteCategory,
      text: noteText.trim(),
      fileUrl: attachedFile?.url,
      fileName: attachedFile?.name,
    };

    const updatedLogs = [...(litigeItem.litigeLogs || []), newLog];

    patch(litigeItem.id, {
      litigeState: litigeState,
      litigeFile: attachedFile?.url || litigeItem.litigeFile,
      litigeFileName: attachedFile?.name || litigeItem.litigeFileName,
      notes: `⚠️ Litige [${litigeState === "en_cours" ? "En cours" : litigeState === "attente" ? "En attente" : "Résolu"}]: ${noteCategory} ${noteText ? `— ${noteText}` : ""}`.trim(),
      litigeLogs: updatedLogs,
    });

    toast(`Note & mise à jour du litige enregistrées pour « ${litigeItem.name || "Article"} »`);
    setNoteText("");
  };

  /** Changer directement l'état d'un litige (Toggle d'état) */
  const changeLitigeState = (i: Item, newState: "en_cours" | "attente" | "resolu") => {
    if (newState === "resolu") {
      patch(i.id, {
        litigeState: "resolu",
        notes: i.notes ? i.notes.replace("⚠️ Litige", "✓ Litige résolu") : "✓ Litige résolu",
      });
      toast(`✓ Litige marqué comme résolu pour « ${i.name || "Article"} » !`);
    } else {
      patch(i.id, { litigeState: newState });
      toast(`État du litige mis à jour : ${newState === "en_cours" ? "En cours" : "En attente"}`);
    }
  };

  /** Charger un fichier (image / document) */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        url: reader.result as string,
        name: file.name,
      });
      toast(`📁 Fichier « ${file.name} » prêt à être joint !`);
    };
    reader.readAsDataURL(file);
  };

  const openPersonalLitiges = state.personalLitiges.filter((l) => l.status !== "resolu");

  const openReturns = state.returns.filter(
    (r) => !["rembourse", "clos"].includes(r.status) && secteur.matchesLinked([r.itemId]),
  ).length;

  return (
    <>
      <HeaderActions>
        <span className="hint">{litiges.length} litige{litiges.length > 1 ? "s" : ""} suivi{litiges.length > 1 ? "s" : ""}</span>
        <button className="btn" onClick={() => navigate(links.retours())}>↩️ Retours &amp; refunds ({openReturns})</button>
        <button className="btn primary" onClick={() => setEditingPersonal(blankPersonalLitige())}>+ Litige perso</button>
      </HeaderActions>

      <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div
          className="card-h"
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setPersonalOpen((v) => !v)}
        >
          <h3>Mes litiges ouverts ({openPersonalLitiges.length})</h3>
          <div className="spacer" />
          <button className="btn sm ghost">{personalOpen ? "▲ Masquer" : "▼ Afficher"}</button>
          <button
            className="btn sm primary"
            onClick={(e) => { e.stopPropagation(); setEditingPersonal(blankPersonalLitige()); }}
          >
            + Litige perso
          </button>
        </div>
        {personalOpen && (
          <div className="card-b">
            {openPersonalLitiges.length === 0 ? (
              <Empty glyph="!" title="Aucun litige perso ouvert">
                Ajoutez un dossier perso pour suivre un souci non lié à une vente.
              </Empty>
            ) : (
              <div className="twrap">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th>Litige</th>
                      <th>Contact</th>
                      <th>Catégorie</th>
                      <th>Ouvert</th>
                      <th>Statut</th>
                      <th className="r">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPersonalLitiges.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <button className="linkish" style={{ fontWeight: 700 }} onClick={() => setEditingPersonal(l)}>
                            {l.title || "Litige sans titre"}
                          </button>
                          {l.notes && <div className="hint ellipsis">{l.notes}</div>}
                        </td>
                        <td>{l.counterparty || "—"}</td>
                        <td>{l.category || "Perso"}</td>
                        <td>{dfr(l.openedDate)}</td>
                        <td>
                          <select
                            value={l.status}
                            onChange={(e) => dispatch({
                              type: "patchPersonalLitige",
                              id: l.id,
                              patch: { status: e.target.value as LitigeStatus },
                            })}
                          >
                            <option value="en_cours">En cours</option>
                            <option value="attente">En attente</option>
                            <option value="resolu">Résolu</option>
                          </select>
                        </td>
                        <td className="r">
                          <div className="rowact">
                            <button className="btn sm" onClick={() => setEditingPersonal(l)}>Éditer</button>
                            <button
                              className="btn sm ghost"
                              onClick={() => dispatch({ type: "patchPersonalLitige", id: l.id, patch: { status: "resolu" } })}
                            >
                              Clore
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Dossiers litiges ouverts"
          value={String(litiges.length)}
          meta={litiges.length ? `${eur(litiges.reduce((a, i) => a + revenueOf(i), 0))} concernés` : "Aucun litige actif"}
          tone={litiges.length ? "warn" : "ok"}
        />
        <Kpi
          label="Litiges perso"
          value={String(openPersonalLitiges.length)}
          meta={openPersonalLitiges.length ? "Dossiers hors ventes" : "Aucun dossier perso"}
          tone={openPersonalLitiges.length ? "warn" : "ok"}
        />
        <Kpi
          label="Ventes suivies"
          value={String(soldItems.length)}
          meta="Livrées depuis moins de 14 jours, ou encore ouvertes"
          to={links.ventes()}
          hint="Voir Ventes"
        />
      </div>

      <div className="card">
        <div className="card-h" style={{ gap: 12 }}>
          <h3>Ventes suivies — ouvrir un dossier</h3>
          <div className="spacer" />
          <input
            type="search"
            placeholder="Rechercher par client, article, suivi..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 260, fontSize: 12.5 }}
          />
        </div>

        {displayedList.length === 0 ? (
          <Empty glyph="🛠" title="Aucune vente suivie">
            Les ventes apparaissent ici jusqu'à 14 jours après leur livraison — le temps qu'un litige
            puisse encore être ouvert.
          </Empty>
        ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Acheteur & Plateforme</th>
                  <th>Lien de suivi</th>
                  <th>Date Vente</th>
                  <th className="r">Prix Vente</th>
                  <th className="r">Actions SAV</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.map((i) => {
                  const isValidated = i.delivery === "livree" && i.shipping === "recu";
                  const hasLitige =
                    i.litigeState === "en_cours" ||
                    i.litigeState === "attente" ||
                    (i.notes && i.notes.toLowerCase().includes("litige"));

                  // Calcul des jours restants avant disparition (14j)
                  let daysLeft = 14;
                  if (isValidated) {
                    const vTime = new Date((i.validationDate || i.shipDate || i.saleDate) + "T12:00:00").getTime();
                    const elapsedDays = Math.floor((Date.now() - vTime) / (1000 * 60 * 60 * 24));
                    daysLeft = Math.max(0, 14 - elapsedDays);
                  }

                  return (
                    <tr key={i.id} style={{ opacity: isValidated ? 0.85 : 1 }}>
                      <td style={{ verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Photo
                            id={i.photoId}
                            style={{
                              width: 50,
                              height: 60,
                              borderRadius: "var(--r-sm)",
                              objectFit: "cover",
                              flexShrink: 0,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                            }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                            <button
                              className="linkish"
                              style={{ textAlign: "left", fontWeight: 700, fontSize: 13.5 }}
                              onClick={() => setEditing(i)}
                              title="Cliquer pour ouvrir la fiche produit & infos acheteur"
                            >
                              {i.name || "Sans nom"}
                            </button>
                            <div className="hint" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
                              <span>{itemAttr(i, "brand") || "—"}{itemAttr(i, "size") ? ` · ${itemAttr(i, "size")}` : ""}</span>
                              {i.sku && <span className="pill ghost" style={{ fontSize: 9.5, padding: "0 5px" }}>{i.sku}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ verticalAlign: "middle" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <button
                            className="linkish"
                            style={{ textAlign: "left", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}
                            onClick={() => setEditing(i)}
                          >
                            {i.buyer || "Acheteur non renseigné"}
                          </button>
                          <span className="pill neutral" style={{ fontSize: 10, width: "fit-content" }}>
                            {i.platform || "Direct"}
                          </span>
                        </div>
                      </td>

                      <td style={{ verticalAlign: "middle" }}>
                        {i.tracking ? (
                          <TrackingLink carrier={i.carrier} code={i.tracking} />
                        ) : (
                          <button
                            className="btn sm ghost"
                            style={{ fontSize: 11, opacity: 0.7 }}
                            onClick={() => setEditing(i)}
                          >
                            + Ajouter le lien
                          </button>
                        )}
                      </td>

                      <td className="num" style={{ fontSize: 12, verticalAlign: "middle" }}>
                        {dfr(i.saleDate)}
                      </td>

                      <td className="r num" style={{ fontSize: 14, fontWeight: 700, verticalAlign: "middle" }}>
                        {eur2(revenueOf(i))}
                      </td>

                      <td className="r" style={{ verticalAlign: "middle" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          {isValidated && (
                            <span className="pill ok" style={{ fontSize: 11, padding: "5px 10px" }}>
                              ✓ Livré (effacé dans {daysLeft}j)
                            </span>
                          )}

                          <button
                            type="button"
                            className="btn"
                            style={{
                              padding: "7px 14px",
                              fontSize: 12,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              background: hasLitige
                                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                                : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                              color: "#ffffff",
                              border: "1px solid rgba(245, 158, 11, 0.5)",
                              borderRadius: "var(--r-sm)",
                              cursor: "pointer",
                            }}
                            onClick={() => openLitigeSection(i)}
                          >
                            ⚠️ Litige
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION PERMANENTE : LISTE DES LITIGES EN COURS (Rectangle Orange) */}
      <div
        className="card"
        style={{
          marginTop: 24,
          border: "1px solid rgba(245, 158, 11, 0.4)",
          background: "linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, rgba(20, 16, 30, 0.6) 100%)",
          borderRadius: "var(--r)",
          boxShadow: "0 8px 32px rgba(245, 158, 11, 0.12)",
        }}
      >
        <div
          className="card-h"
          style={{
            borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
            padding: "14px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <h3 style={{ color: "#f59e0b", fontSize: 15, fontWeight: 700, margin: 0 }}>
              Dossiers & Litiges en cours ({litiges.length})
            </h3>
          </div>
          <div className="spacer" />
          <span className="hint" style={{ color: "rgba(245, 158, 11, 0.8)", fontSize: 11.5 }}>
            Suivi des réclamations avec statut, historique horodaté et pièces jointes
          </span>
        </div>

        {litiges.length === 0 && !litigeItem ? (
          <div style={{ padding: "28px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 28, opacity: 0.5, marginBottom: 6 }}>🛡️</div>
            <div style={{ color: "var(--ink-2)", fontSize: 13, fontWeight: 500 }}>
              Aucun litige actif en cours.
            </div>
            <div className="hint" style={{ fontSize: 11.5, marginTop: 4 }}>
              Cliquez sur le bouton « ⚠️ Litige » d'une commande ci-dessus pour déclarer un dossier.
            </div>
          </div>
        ) : (
          <div className="card-b" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {litiges.map((item) => {
              const curState = item.litigeState || "en_cours";
              const logs = item.litigeLogs || [];

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: "14px 16px",
                    borderRadius: "var(--r-sm)",
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.28)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Photo
                        id={item.photoId}
                        style={{
                          width: 44,
                          height: 54,
                          borderRadius: 6,
                          objectFit: "cover",
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                          {item.name || "Sans nom"}
                        </div>
                        <div className="hint" style={{ fontSize: 11.5, marginTop: 2 }}>
                          Acheteur : <b>{item.buyer || "Non renseigné"}</b> ({item.platform || "Direct"}) · Vendu le {dfr(item.saleDate)}
                        </div>
                      </div>
                    </div>

                    {/* Toggle avec État du litige */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="seg">
                        <button
                          type="button"
                          className={curState === "en_cours" ? "on" : ""}
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            background: curState === "en_cours" ? "#ef4444" : undefined,
                            color: curState === "en_cours" ? "#fff" : undefined,
                          }}
                          onClick={() => changeLitigeState(item, "en_cours")}
                        >
                          🔴 En cours
                        </button>
                        <button
                          type="button"
                          className={curState === "attente" ? "on" : ""}
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            background: curState === "attente" ? "#f59e0b" : undefined,
                            color: curState === "attente" ? "#fff" : undefined,
                          }}
                          onClick={() => changeLitigeState(item, "attente")}
                        >
                          ⏳ En attente
                        </button>
                        <button
                          type="button"
                          className={curState === "resolu" ? "on" : ""}
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            background: curState === "resolu" ? "#10b981" : undefined,
                            color: curState === "resolu" ? "#fff" : undefined,
                          }}
                          onClick={() => changeLitigeState(item, "resolu")}
                        >
                          🟢 Résolu
                        </button>
                      </div>

                      <button
                        className="btn sm"
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          color: "var(--ink)",
                        }}
                        onClick={() => openLitigeSection(item)}
                      >
                        + Ajouter une note / fichier
                      </button>

                      <button
                        className="btn sm ghost"
                        title="Ouvrir un dossier retour : remboursement, avoir ou remise en stock"
                        onClick={() => setConvertingReturn(item)}
                      >
                        ↩ Retour / remboursement
                      </button>
                    </div>
                  </div>

                  {/* Fichier joint principal si présent */}
                  {(item.litigeFile || item.litigeFileName) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.25)", padding: "8px 12px", borderRadius: 6 }}>
                      <span style={{ fontSize: 16 }}>📎</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>Pièce jointe du dossier</div>
                        <a
                          href={item.litigeFile}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {item.litigeFileName || "Télécharger / Voir la preuve (Photo / Document)"}
                        </a>
                      </div>
                      {item.litigeFile?.startsWith("data:image") && (
                        <img
                          src={item.litigeFile}
                          alt="Preuve"
                          style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                        />
                      )}
                    </div>
                  )}

                  {/* Historique des Notes Horodatées par Catégorie */}
                  {logs.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        Historique des échanges & notes ({logs.length})
                      </div>
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          style={{
                            background: "rgba(0, 0, 0, 0.25)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 6,
                            padding: "8px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <span className="pill info" style={{ fontSize: 10, fontWeight: 700 }}>
                              {log.category}
                            </span>
                            <span className="hint" style={{ fontSize: 10.5 }}>
                              📅 {log.date}
                            </span>
                          </div>
                          {log.text && <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.35 }}>{log.text}</div>}
                          {log.fileUrl && (
                            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                              <span>📎</span>
                              <a href={log.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                                {log.fileName || "Fichier joint"}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Formulaire d'édition / création de note avec Pièce Jointe et Catégorie */}
        {litigeItem && (
          <div
            style={{
              padding: 16,
              borderTop: "1px solid rgba(245, 158, 11, 0.3)",
              background: "rgba(0, 0, 0, 0.35)",
              borderBottomLeftRadius: "var(--r)",
              borderBottomRightRadius: "var(--r)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#f59e0b" }}>
                📝 Ajouter une note horodatée & fichier pour : « {litigeItem.name || "Article"} »
              </div>
              <button className="btn sm ghost" onClick={() => setLitigeItem(null)}>
                ✕ Fermer le formulaire
              </button>
            </div>

            <div className="fgrid">
              <Field label="État du Litige (Toggle)">
                <select
                  value={litigeState}
                  onChange={(e) => setLitigeState(e.target.value as "en_cours" | "attente" | "resolu")}
                >
                  <option value="en_cours">🔴 En cours (Litige actif)</option>
                  <option value="attente">⏳ En attente (Réponse client / support)</option>
                  <option value="resolu">🟢 Résolu / Clôturé</option>
                </select>
              </Field>

              <Field label="Catégorie de la note">
                <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)}>
                  <option value="💬 Échange Acheteur">💬 Échange avec l'acheteur</option>
                  <option value="🎧 Support Plateforme">🎧 Support Plateforme (Vinted / Vestiaire / Leboncoin...)</option>
                  <option value="📦 Transporteur / Bordereau">📦 Suivi Transporteur / Bordereau</option>
                  <option value="⚠️ Motif de réclamation">⚠️ Motif de réclamation initiale</option>
                  <option value="📝 Note interne">📝 Note interne</option>
                </select>
              </Field>

              <Field label="Texte de la note (horodaté automatiquement)">
                <textarea
                  rows={2}
                  value={noteText}
                  placeholder="Tapez le détail de la note ou l'avancement..."
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </Field>

              <Field label="Fichier / Pièce jointe (Photo, Bordereau, Preuve PDF/Image)">
                <input type="file" accept="image/*,.pdf" onChange={handleFileUpload} />
                {attachedFile && (
                  <div className="hint" style={{ color: "#10b981", marginTop: 4, fontWeight: 600 }}>
                    ✓ Fichier joint sélectionné : {attachedFile.name}
                  </div>
                )}
              </Field>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn" onClick={() => setLitigeItem(null)}>
                  Annuler
                </button>
                <button className="btn primary" onClick={saveLitigeNote} style={{ background: "#f59e0b", color: "#000", fontWeight: 700, border: 0 }}>
                  💾 Enregistrer la note horodatée
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </>

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} onSell={(i) => setSelling(i)} />}
      {convertingReturn && (
        <ReturnModal
          initial={emptyReturn("client", convertingReturn)}
          candidates={soldItems}
          isEditing={false}
          onClose={() => setConvertingReturn(null)}
        />
      )}
      {editingPersonal && (
        <Modal
          title={state.personalLitiges.some((l) => l.id === editingPersonal.id) ? "Litige perso" : "Nouveau litige perso"}
          onClose={() => setEditingPersonal(null)}
          footer={
            <>
              {state.personalLitiges.some((l) => l.id === editingPersonal.id) && (
                <button
                  className="btn danger"
                  onClick={() => {
                    dispatch({ type: "removePersonalLitige", id: editingPersonal.id });
                    toast("Litige perso supprimé");
                    setEditingPersonal(null);
                  }}
                >
                  Supprimer
                </button>
              )}
              <div className="spacer" />
              <button className="btn" onClick={() => setEditingPersonal(null)}>Annuler</button>
              <button
                className="btn primary"
                onClick={() => {
                  const title = editingPersonal.title.trim();
                  if (!title) {
                    toast("Ajoutez un titre au litige");
                    return;
                  }
                  dispatch({
                    type: "upsertPersonalLitige",
                    litige: {
                      ...editingPersonal,
                      title,
                      counterparty: editingPersonal.counterparty.trim(),
                      category: editingPersonal.category.trim() || "Perso",
                      notes: editingPersonal.notes.trim(),
                    },
                  });
                  toast("Litige perso enregistré");
                  setEditingPersonal(null);
                }}
              >
                Enregistrer
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Titre" span>
              <input
                value={editingPersonal.title}
                placeholder="Ex. Litige fournisseur, remboursement perso, colis perdu..."
                onChange={(e) => setEditingPersonal({ ...editingPersonal, title: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Contact">
              <input
                value={editingPersonal.counterparty}
                placeholder="Plateforme, fournisseur, transporteur..."
                onChange={(e) => setEditingPersonal({ ...editingPersonal, counterparty: e.target.value })}
              />
            </Field>
            <Field label="Catégorie">
              <input
                value={editingPersonal.category}
                placeholder="Perso, fournisseur, transport..."
                onChange={(e) => setEditingPersonal({ ...editingPersonal, category: e.target.value })}
              />
            </Field>
            <Field label="Ouvert le">
              <input
                type="date"
                value={editingPersonal.openedDate}
                onChange={(e) => setEditingPersonal({ ...editingPersonal, openedDate: e.target.value })}
              />
            </Field>
            <Field label="Statut">
              <select
                value={editingPersonal.status}
                onChange={(e) => setEditingPersonal({ ...editingPersonal, status: e.target.value as LitigeStatus })}
              >
                <option value="en_cours">En cours</option>
                <option value="attente">En attente</option>
                <option value="resolu">Résolu</option>
              </select>
            </Field>
            <Field label="Notes" span>
              <textarea
                rows={4}
                value={editingPersonal.notes}
                placeholder="Détail, prochaines actions, pièces à demander..."
                onChange={(e) => setEditingPersonal({ ...editingPersonal, notes: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}
      {selling && (
        <SellModal
          item={selling}
          onClose={() => setSelling(null)}
          onInvoice={(i) => navigate(links.newDoc(i.id))}
          onSold={() => toast("Vente mise à jour !")}
        />
      )}
    </>
  );
}
