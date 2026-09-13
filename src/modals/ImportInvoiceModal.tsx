import { useState } from "react";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { extractPdfText, parseInvoiceText, type ParsedInvoiceLine } from "../lib/invoiceImport";
import { eur2, num } from "../lib/format";
import { uid } from "../lib/id";
import type { OrderPresetLine } from "./OrderModal";

interface DraftLine extends ParsedInvoiceLine { key: string; }

/**
 * Import de facture PDF : extraction du texte réel (pas d'OCR, pas d'IA) puis
 * reconnaissance des lignes par motifs. Toujours relu et corrigeable avant de
 * créer la commande — l'extraction se trompe sur les mises en page complexes.
 */
export default function ImportInvoiceModal({
  onClose, onConfirm,
}: {
  onClose: () => void;
  onConfirm: (source: string, lines: OrderPresetLine[]) => void;
}) {
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showRaw, setShowRaw] = useState(false);

  const patch = (key: string, p: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast("Seuls les PDF sont lus pour l'instant — pas de photo scannée");
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const text = await extractPdfText(file);
      const parsed = parseInvoiceText(text);
      setRawText(parsed.rawText);
      setSupplier(parsed.supplier);
      setLines(parsed.lines.map((l) => ({ ...l, key: uid() })));
      if (parsed.lines.length === 0) {
        toast("Aucune ligne reconnue automatiquement — vérifiez le texte brut ou saisissez à la main");
        setShowRaw(true);
      } else {
        toast(`${parsed.lines.length} ligne${parsed.lines.length > 1 ? "s" : ""} détectée${parsed.lines.length > 1 ? "s" : ""} — à vérifier avant de valider`);
      }
    } catch {
      toast("Impossible de lire ce PDF (peut-être une image scannée sans texte)");
    } finally {
      setLoading(false);
    }
  };

  const addLine = () => setLines((ls) => [...ls, { key: uid(), label: "", quantity: 1, unitPrice: 0 }]);
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const total = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
  const valid = lines.filter((l) => l.label.trim() && l.unitPrice > 0);

  const confirm = () => {
    if (valid.length === 0) {
      toast("Ajoutez au moins une ligne avec un libellé et un prix");
      return;
    }
    onConfirm(
      supplier.trim(),
      valid.map((l) => ({ name: l.label.trim(), cost: String(l.unitPrice), fees: "0", estimate: "", quantity: String(l.quantity) })),
    );
  };

  return (
    <Modal
      title="📄 Importer une facture"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={confirm} disabled={valid.length === 0}>
            Créer la commande ({valid.length} ligne{valid.length > 1 ? "s" : ""})
          </button>
        </>
      }
    >
      <div className="note info">
        <span className="glyph">≡</span>
        <div>
          Lecture du texte du PDF, puis reconnaissance des lignes par motifs — pas d'IA, pas d'envoi en ligne.
          Fonctionne sur une facture avec du texte réel (StockX, Vinted Pro…), pas sur une photo scannée.
          Relisez toujours avant de valider.
        </div>
      </div>

      <Field label="Fichier PDF">
        <input type="file" accept="application/pdf" onChange={(e) => handleFile(e.target.files?.[0])} />
        {fileName && <span className="hint">{loading ? "Lecture en cours…" : fileName}</span>}
      </Field>

      {lines.length > 0 && (
        <>
          <Field label="Fournisseur">
            <input type="text" value={supplier} placeholder="Nom du fournisseur" onChange={(e) => setSupplier(e.target.value)} />
          </Field>

          <hr className="sep" />
          <div className="field"><span>Lignes détectées — à corriger si besoin</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lines.map((l) => (
              <div key={l.key} className="calc-line">
                <div className="calc-line-h">
                  <input type="text" value={l.label} placeholder="Nom de l'article" onChange={(e) => patch(l.key, { label: e.target.value })} />
                  <button className="iconbtn del" title="Retirer" onClick={() => removeLine(l.key)}>✕</button>
                </div>
                <div className="calc-line-grid">
                  <label><span>Quantité</span><input type="number" min="1" step="1" value={l.quantity} onChange={(e) => patch(l.key, { quantity: Math.max(1, Math.round(num(e.target.value)) || 1) })} /></label>
                  <label><span>Prix unitaire</span><input type="number" step="0.01" value={l.unitPrice} onChange={(e) => patch(l.key, { unitPrice: num(e.target.value) })} /></label>
                </div>
              </div>
            ))}
          </div>
          <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={addLine}>+ Ajouter une ligne manquée</button>

          <div className="totrow big" style={{ marginTop: 4 }}>
            <span>Total reconnu</span>
            <b className="num">{eur2(total)}</b>
          </div>
        </>
      )}

      {rawText && (
        <>
          <button className="btn ghost sm" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "Masquer" : "Voir"} le texte brut extrait
          </button>
          {showRaw && (
            <textarea readOnly rows={8} value={rawText} style={{ fontSize: 11, fontFamily: "var(--ff-mono)" }} />
          )}
        </>
      )}
    </Modal>
  );
}
