import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HeaderActions } from "../components/Layout";
import { Empty, Field, Kpi, Photo, Segmented } from "../components/ui";
import TrackingLink from "../components/TrackingLink";
import { useToast } from "../components/Toast";
import { useStore } from "../store/StoreContext";
import { useQueryState } from "../lib/useQueryState";
import { links } from "../lib/links";
import { revenueOf } from "../lib/calc";
import { dfr, eur, eur2, today } from "../lib/format";
import ItemModal from "../modals/ItemModal";
import SellModal from "../modals/SellModal";
import type { Item } from "../types";

type SavTab = "avalider" | "litiges" | "all";

export default function Sav() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [tabParam, setTab] = useQueryState("tab", "avalider");
  const tab = tabParam as SavTab;

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [selling, setSelling] = useState<Item | null>(null);

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
    () => state.items.filter((i) => i.status === "vendu" && !isExpiredAfter14Days(i)),
    [state.items]
  );

  // Commandes à valider (pas encore entièrement clôturées)
  const aValider = useMemo(
    () => soldItems.filter((i) => !(i.delivery === "livree" && i.shipping === "recu")),
    [soldItems]
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

  const displayedList = useMemo(() => {
    let list = tab === "avalider" ? aValider : tab === "litiges" ? litiges : soldItems;
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
  }, [tab, aValider, litiges, soldItems, query]);

  const patch = (id: string, p: Partial<Item>) => dispatch({ type: "patchItem", id, patch: p });

  /** Valider la vente -> transfert direct vers Ventes & démarrage du compte à rebours 14j */
  const validateSale = (i: Item) => {
    const nowIso = today();
    patch(i.id, {
      delivery: "livree",
      shipping: "recu",
      validationDate: nowIso,
      shipDate: i.shipDate || nowIso,
    });
    toast(`✓ Vente « ${i.name || "Article"} » validée ! Transférée vers Ventes (disparaît du SAV dans 14 jours).`, {
      label: "Voir dans Ventes",
      onClick: () => navigate(links.ventes()),
    });
  };

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

  const totalAValider = aValider.reduce((a, i) => a + revenueOf(i), 0);

  return (
    <>
      <HeaderActions>
        <Segmented<string>
          value={tab}
          onChange={setTab}
          options={[
            { value: "avalider", label: `À valider (${aValider.length})` },
            { value: "litiges", label: `Litiges (${litiges.length})` },
            { value: "all", label: `Toutes les ventes (${soldItems.length})` },
          ]}
        />
      </HeaderActions>

      <div className="kpi-grid">
        <Kpi
          label="Commandes reçues & à valider"
          value={String(aValider.length)}
          meta={`${eur(totalAValider)} encaissés en attente de clôture`}
          tone="info"
          hint="À valider"
        />
        <Kpi
          label="Ventes validées (< 14j)"
          value={String(soldItems.filter((i) => i.delivery === "livree" && i.shipping === "recu").length)}
          meta="Nettoyage automatique après 14 jours"
          tone="ok"
          to={links.ventes({ delivery: "livree" })}
          hint="Voir Ventes"
        />
        <Kpi
          label="Dossiers Litiges / SAV"
          value={String(litiges.length)}
          meta={litiges.length ? `${litiges.length} dossier${litiges.length > 1 ? "s" : ""} actif${litiges.length > 1 ? "s" : ""}` : "Aucun litige actif"}
          tone={litiges.length ? "warn" : "ok"}
          hint="Litiges"
        />
      </div>

      <div className="card">
        <div className="card-h" style={{ gap: 12 }}>
          <h3>Service Après-Vente & Validation Réception</h3>
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
          <Empty glyph="🛠" title="Aucune commande dans cette sélection">
            {tab === "avalider"
              ? "Toutes les commandes reçues sont validées ! Elles basculent vers Ventes et s'effacent automatiquement au bout de 14 jours."
              : "Aucun dossier de litige en cours."}
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
                  <th>Statut Réception</th>
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
                              <span>{i.brand || "—"}{i.size ? ` · ${i.size}` : ""}</span>
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

                      <td style={{ verticalAlign: "middle" }}>
                        <select
                          value={i.shipping === "recu" || i.delivery === "livree" ? "recu" : "a_deposer"}
                          style={{
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            borderRadius: "var(--r-sm)",
                            background: "var(--surface-solid)",
                            border: "1px solid var(--line-2)",
                            color: "var(--ink)",
                            cursor: "pointer",
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "recu") {
                              patch(i.id, { shipping: "recu" });
                            } else {
                              patch(i.id, { shipping: "a_deposer" });
                            }
                          }}
                        >
                          <option value="a_deposer">🚚 À aller chercher</option>
                          <option value="recu">📦 Reçu</option>
                        </select>
                      </td>

                      <td className="r" style={{ verticalAlign: "middle" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          {isValidated ? (
                            <span className="pill ok" style={{ fontSize: 11, padding: "5px 10px" }}>
                              ✓ Validé (effacé dans {daysLeft}j)
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn primary"
                              style={{
                                padding: "7px 16px",
                                fontSize: 12,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                color: "#ffffff",
                                border: "1px solid rgba(16, 185, 129, 0.5)",
                                borderRadius: "var(--r-sm)",
                                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                                cursor: "pointer",
                              }}
                              onClick={() => validateSale(i)}
                            >
                              ✓ Valider
                            </button>
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
                      <div className="segmented" style={{ background: "rgba(0,0,0,0.3)" }}>
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

      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} onSell={(i) => setSelling(i)} />}
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
