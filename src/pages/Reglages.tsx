import { useMemo } from "react";
import { Field } from "../components/ui";
import { useStore } from "../store/StoreContext";
import { caOfYear } from "../lib/calc";
import { num } from "../lib/format";
import { COUNTRIES, isSociete, VAT_BY_COUNTRY, vatRegime } from "../lib/vat";
import type { LegalStatus, OptionalModule, Settings } from "../types";

const LEGAL: { value: LegalStatus; label: string; hint: string }[] = [
  { value: "rien", label: "Aucun statut", hint: "Usage personnel, preuve de vente uniquement" },
  { value: "auto", label: "Auto-entreprise", hint: "Franchise de TVA selon votre seuil" },
  { value: "sarl", label: "SARL", hint: "Société assujettie à la TVA" },
  { value: "sas", label: "SAS", hint: "Société assujettie à la TVA" },
  { value: "sasu", label: "SASU", hint: "Société unipersonnelle assujettie à la TVA" },
];

import { Users, HelpCircle, FileText } from "lucide-react";

const MODULES: { key: OptionalModule; label: string; hint: string; icon: any }[] = [
  { key: "clients", label: "Clients", hint: "Base acheteurs et historique des ventes", icon: Users },
  { key: "sav", label: "SAV & Litiges", hint: "Litiges, retours clients et remboursements fournisseurs", icon: HelpCircle },
  { key: "facturation", label: "Facturation", hint: "Factures, reçus, TVA et impayés", icon: FileText },
];

export default function Reglages() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    dispatch({ type: "settings", patch: { [key]: value } as Partial<Settings> });
  const legal = LEGAL.find((entry) => entry.value === s.legalStatus) ?? LEGAL[0];

  const year = new Date().getFullYear();
  const regime = useMemo(
    () => vatRegime(s, caOfYear(state.items, year)),
    [s, state.items, year],
  );

  const toggleModule = (key: OptionalModule) => {
    setSetting("enabledModules", { ...s.enabledModules, [key]: !s.enabledModules[key] });
  };

  return (
    <div className="settings-page">
      <div className="card settings-hero">
        <div>
          <span className="eyebrow">Configuration de l’espace</span>
          <h2>Une interface adaptée à votre activité</h2>
          <p>Activez seulement les outils dont vous avez besoin. Masquer un module ne supprime aucune donnée.</p>
        </div>
        <div className="settings-status-chip">
          <span>Statut actuel</span>
          <strong>{legal.label}</strong>
        </div>
      </div>

      {regime.alert && (
        <div className={`note ${regime.alert.level === "bad" ? "bad" : "warn"}`} style={{ marginBottom: 16 }}>
          <span className="glyph">⚠</span>
          <div><b>{regime.alert.title}</b><br />{regime.alert.text}</div>
        </div>
      )}

      <div className="cols two settings-grid">
        <div className="card">
          <div className="card-h">
            <div>
              <span className="eyebrow">Entreprise</span>
              <h3>Statut et TVA</h3>
            </div>
          </div>
          <div className="card-b settings-stack">
            <Field label="Forme juridique">
              <select value={s.legalStatus} onChange={(e) => setSetting("legalStatus", e.target.value as LegalStatus)}>
                {LEGAL.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
              </select>
            </Field>
            <div className="settings-explainer">
              <strong>{legal.label}</strong>
              <span>{legal.hint}</span>
            </div>

            <label className={`mode-switch${s.vatEnabled ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={s.vatEnabled}
                onChange={(e) => setSetting("vatEnabled", e.target.checked)}
              />
              <div>
                <b>Facture pro</b>
                <div className="hint">
                  {s.vatEnabled
                    ? "TVA calculée sur les ventes, le bilan et les documents émis."
                    : "Éteint : reçus simples, aucune TVA nulle part dans l'app."}
                </div>
              </div>
            </label>

            <div className="fgrid">
              <Field label="Pays">
                <select
                  value={s.country}
                  onChange={(e) => {
                    setSetting("country", e.target.value);
                    setSetting("vatRate", VAT_BY_COUNTRY[e.target.value] ?? 20);
                  }}
                >
                  {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </Field>
              {s.vatEnabled && (
                <>
                  <Field label="N° de TVA intracommunautaire">
                    <input type="text" value={s.vatNumber} placeholder="FR00123456789" onChange={(e) => setSetting("vatNumber", e.target.value)} />
                  </Field>
                  <Field label="Taux de TVA (%)">
                    <input type="number" step="0.1" value={s.vatRate} onChange={(e) => setSetting("vatRate", num(e.target.value))} />
                  </Field>
                  <Field label="Seuil de franchise (€)">
                    <input
                      type="number"
                      step="100"
                      value={s.threshold}
                      disabled={isSociete(s.legalStatus)}
                      onChange={(e) => setSetting("threshold", num(e.target.value))}
                    />
                  </Field>
                </>
              )}
            </div>

            {s.vatEnabled && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.marginScheme}
                    onChange={(e) => setSetting("marginScheme", e.target.checked)}
                  />
                  Régime de la marge (biens d'occasion) — la TVA porte sur la marge, pas sur le prix de vente
                </label>
                <div className={`note ${regime.subject ? "info" : "ok"}`}>
                  <span className="glyph">§</span>
                  <div><b>{regime.label}</b><br />{regime.mention}</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <span className="eyebrow">Navigation</span>
              <h3>Modules actifs</h3>
            </div>
          </div>
          <div className="card-b module-switches">
            {MODULES.map((module) => {
              const IconComponent = module.icon;
              return (
                <label key={module.key} className={`module-switch ${s.enabledModules[module.key] ? "on" : ""}`}>
                  <span className="module-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconComponent size={18} />
                  </span>
                  <span className="module-copy">
                    <strong>{module.label}</strong>
                    <small>{module.hint}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={s.enabledModules[module.key]}
                    onChange={() => toggleModule(module.key)}
                  />
                  <span className="switch-track" aria-hidden="true"><i /></span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div>
            <span className="eyebrow">Documents</span>
            <h3>Identité sur les factures et reçus</h3>
          </div>
          <div className="spacer" />
          <span className="hint">Reprises telles quelles sur chaque document émis</span>
        </div>
        <div className="card-b">
          <div className="fgrid">
            <Field label="Nom / raison sociale" span>
              <input type="text" value={s.business} placeholder="Votre nom commercial" onChange={(e) => setSetting("business", e.target.value)} />
            </Field>
            <Field label="Adresse" span>
              <textarea rows={2} value={s.address} onChange={(e) => setSetting("address", e.target.value)} />
            </Field>
            <Field label="E-mail">
              <input type="email" value={s.email} onChange={(e) => setSetting("email", e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <input type="text" value={s.phone} onChange={(e) => setSetting("phone", e.target.value)} />
            </Field>
            <Field label="Délai de paiement (jours)">
              <input type="number" step="1" value={s.paymentTerms} onChange={(e) => setSetting("paymentTerms", num(e.target.value))} />
            </Field>
            <Field label="IBAN" span>
              <input type="text" value={s.iban} onChange={(e) => setSetting("iban", e.target.value)} />
            </Field>
            <Field label="Pied de page des documents" span>
              <textarea rows={2} value={s.footer} placeholder="Mentions légales, conditions de retour…" onChange={(e) => setSetting("footer", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="cols two" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h">
            <div>
              <span className="eyebrow">Automatisation</span>
              <h3>Frais de plateforme</h3>
            </div>
            <div className="spacer" />
            <span className="hint">Appliqués automatiquement à la vente</span>
          </div>
          <div className="card-b platform-settings-grid">
            {Object.entries(s.platformFees).map(([name, rate]) => (
              <label className="platform-setting" key={name}>
                <span>{name}</span>
                <span className="rate-input">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setSetting("platformFees", { ...s.platformFees, [name]: num(e.target.value) })}
                  />
                  <b>%</b>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <span className="eyebrow">Logistique</span>
              <h3>Suivi des transporteurs</h3>
            </div>
            <div className="spacer" />
            <span className="hint">« {"{code}"} » est remplacé par le numéro</span>
          </div>
          <div className="card-b rate-list">
            {Object.entries(s.trackingUrls).map(([name, url]) => (
              <label className="rate-row wide" key={name}>
                <span>{name}</span>
                <input
                  type="url"
                  value={url}
                  placeholder="https://…/suivi?code={code}"
                  onChange={(e) => setSetting("trackingUrls", { ...s.trackingUrls, [name]: e.target.value })}
                />
              </label>
            ))}
            <div className="hint">
              Aucune API n'est appelée : le numéro de suivi devient un lien vers la page publique du
              transporteur. Si une adresse change, corrigez-la ici.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
