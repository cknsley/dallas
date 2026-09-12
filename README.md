# Atelier — achat / revente

Web app de suivi d'achat-revente (vêtements, sacs, accessoires) :
stock, ventes, logistique colis, marge, todo et facturation.

## Démarrer

```bash
npm install
npm run dev
```

L'app est servie sur http://localhost:5180.
`npm run build` produit un dossier `dist/` déployable sur n'importe quel hébergeur statique
(Vercel, Netlify, GitHub Pages…). Le routage est en `hash` : aucune configuration serveur n'est nécessaire.

## Ce que fait l'app

| Onglet | Contenu |
| --- | --- |
| **Dashboard** | 4 KPI (CA, marge réalisée, valeur estimée du stock, nombre de ventes), sélecteur de période (mois / année / depuis le début), évolution 12 mois en barres, courbes ou aires, pipeline du stock, meilleures ventes par article / marque / type / taille en chiffré, barres ou anneau |
| **Stock** | Statuts Arrivage → En stock → Livraison, fiche complète par pièce, filtres + recherche, tri sur toutes les colonnes, vue tableau ou grille photo, actions Vendre / Réceptionner / Éditer / Supprimer, export CSV |
| **Ventes** | Historique complet : canal, acheteur, encaissé (port compris), frais détaillés, coût d'achat, marge nette et ROI, livraison et suivi modifiables en ligne, lien vers le document associé, filtres par livraison / canal / marque |
| **Livraison** | Deux volets : *À faire* (ventes à expédier puis à marquer livrées) et *À recevoir* (transporteur, n° de suivi, arrivée prévue, alerte retard, réception en un clic) |
| **Marge** | Capital engagé, coût des ventes, marge réalisée, marge nette après TVA, répartition par marque, calculatrice « et si » (sélection libre de pièces + lignes manuelles, total en direct) |
| **Todo** | Kanban glisser-déposer ou liste — À acheter / À faire / À envoyer / Terminé, plus les tâches automatiques déduites des colis et des factures |
| **Facturation** | Statut juridique, pays, n° de TVA, moteur de TVA automatique avec alerte de seuil, génération de facture ou de reçu, suivi payé/impayé, numérotation séquentielle, aperçu et impression/PDF |
| **Charges** | Dépenses générales de l'activité (matériel, emballages, abonnements) — comptées en une fois ou étalées sur plusieurs mois ; leur part mensuelle réduit la marge nette du mois où elle tombe |

## Comment les sections se répondent

Rien n'est saisi deux fois : une action quelque part met à jour partout ailleurs.

- **Le statut Livraison ne se choisit pas** : dans la fiche, seuls *Arrivage* et *En stock* sont sélectionnables,
  et le bouton **Vendre** enregistre la fiche puis ouvre le formulaire de vente. Tant qu'une pièce n'est pas
  vendue, son prix est une **estimation de revente** — c'est elle qui alimente la valeur estimée du stock au
  dashboard (une pièce sans estimation est comptée à son coût, jamais à une valeur inventée).
- **Vendre** (depuis Stock, la grille photo, la fiche, Ventes ou Livraison) ouvre le formulaire de vente — plateforme, acheteur,
  commission, port encaissé, port à ma charge, transporteur, suivi — avec la marge calculée en direct.
  À l'enregistrement la pièce passe en *Livraison*, apparaît dans **Ventes**, entre dans **Colis → Envois**,
  alimente le **Dashboard** et la **Marge**, et propose de générer son document.
- **Tâches automatiques** : le Todo se remplit tout seul à partir de l'état réel — un colis vendu non expédié
  crée « Expédier … » dans *À envoyer*, un arrivage dont la date est dépassée crée « Réceptionner … » dans
  *À faire*, une facture échue crée « Relancer le paiement … ». Les cocher **exécute l'action** (expédier,
  réceptionner, marquer payé) et la tâche disparaît d'elle-même ; cliquer leur texte ouvre la section concernée.
- **Chiffres cliquables** : chaque KPI mène à la liste qu'il résume, déjà filtrée — « Valeur du stock » ouvre
  le stock sur *En stock*, « À expédier » ouvre les envois, « Impayés » filtre les documents, « En retard »
  ne montre que les colis en retard, une ligne du classement ouvre les pièces de cette marque ou de ce type.
- **Filtres dans l'URL** : chaque écran est adressable (`#/stock?status=stock&brand=Nike`), donc partageable,
  rechargeable et atteignable depuis n'importe quelle autre section.
- **Noms cliquables** : le nom d'une pièce ouvre sa fiche depuis le stock, les ventes ou les colis.
- **Garde-fous** : supprimer une pièce rattachée à un document le signale avant confirmation, et la facture
  reste émise avec son montant d'origine.

## Moteur de TVA

`src/lib/vat.ts` déduit le régime applicable du statut juridique, du pays et du CA de l'année :

- **Particulier** — hors champ de la TVA, la facture est bloquée, seul le reçu est émis.
- **Micro-entreprise** — franchise en base (mention art. 293 B du CGI) tant que le CA reste sous le seuil ;
  alerte dès 80 % du seuil, bascule automatique en TVA due au-delà.
- **Société** — assujettie dès le premier euro.

Le **régime de la marge** (art. 297 A du CGI, biens d'occasion) est activé par défaut : la TVA porte sur la
marge et non sur le prix de vente. Il se désactive dans les réglages de l'onglet Facturation.
Les taux par pays sont pré-remplis et restent modifiables.

## Données

- **Local d'abord** : l'état (pièces, todos, documents, réglages) est écrit dans `localStorage`,
  les photos dans IndexedDB (redimensionnées et recompressées à l'import).
- **Multi-onglets** : les onglets d'un même navigateur se synchronisent via `BroadcastChannel`.
- **Multi-appareil** : renseignez un point de synchro dans un fichier `.env.local` à la racine —

  ```
  VITE_SYNC_URL=https://exemple.com/atelier-state
  VITE_SYNC_KEY=une-cle-partagee
  ```

  L'app bascule alors automatiquement dessus (le voyant de la barre latérale passe au vert).
  Contrat attendu : `GET` renvoie l'état JSON (ou 404 s'il n'existe pas encore), `PUT` l'enregistre ;
  la clé voyage dans l'en-tête `X-Sync-Key`. Sans serveur configuré, tout reste local et l'app fonctionne
  hors ligne.

## Structure

```
src/
  lib/        calculs, formats, moteur TVA, export CSV, constantes, helpers réutilisables
  store/      état global (reducer + contexte), persistance, synchro, photos IndexedDB
  components/ layout, briques d'interface, thème, toasts, modals réutilisables
  pages/      Dashboard, Stock, Ventes, Livraison, Marge, Todo, Facturation, Charges, etc.
  modals/     fiche pièce, vente, création de document, aperçu, clients, dépenses, todo-link
```

Mode nuit manuel : bouton en bas de la barre latérale (système → nuit → jour).

## Dev — conventions et patterns

### Types d'abord
Les types en `src/types.ts` sont le contrat. Déclarer la shape avant de coder la UI qui l'utilise.
Les types ajoutés doivent être utilisés — pas de champs fantasmes qui traînent sans lecteur.

### State & store
L'état vit dans `StoreContext` (reducers) et se persiste dans localStorage. Pour décider si une valeur va en store ou en `useState` local :
- **Store** : tout ce qui se sauve (pièces, ventes, documents, réglages, photos)
- **Local** : état de la page/modal (ouvrir/fermer un modal, sélection temporaire, édition en cours)

Quand tu touche à un type (ajouter un champ à `Item`, `Document`, etc.), passe par `StoreContext` pour que la persistance l'attrape.

### Helpers & lib
- `calc.ts` : toute la math (marge, stats, TVA) — pas de calculs épars dans les pages
- `format.ts` : formatage (dates, euros, nombres, %a) — utilise `eur()`, `num()`, `pct()` partout
- `constants.ts` : énums, labels, ordres (STATUS_ORDER, SHIPPING_LABEL, etc.)
- `clients.ts` : logique client (matching par nom, déduplique)
- Si une fonction sert 2+ fichiers, elle va en `lib/`, sinon reste inline

Noms courts OK (`idx`, `e`, `cat`) pour les boucles/évènements ; explicites pour les données (`itemId`, `expenseAmount`).

### Pages & modals
- Pages : écrans principaux (Stock, Ventes, etc.), pas de logique calculée — c'est `lib/` qui fait
- Modals : formulaires pour créer/éditer une entité (ItemModal, OrderModal, etc.) ou choisir/picker (PickLinkModal, PickMultiItemsModal)
- Limiter à ~400 lignes par fichier, sinon scinder en components

### Anti-patterns à éviter
- Pas de `as any` — typer proprement ou remonter le problème
- Pas de `console.log()` oublié
- Pas de fichier > 400 lignes
- Les styles inline OK pour du one-off ; couleurs/espacements en CSS réutilisable

### Navigation & linking
`src/lib/links.ts` centralise les routes (ex: `links.stock({ brand: "Nike" })`).
Passe par là plutôt que des strings `/stock` éparpillées.

## Tests & build

```bash
npm run typecheck    # TypeScript — aucun bug type n'échappe
npm run build        # Produit dist/ prêt à déployer
npm run preview      # Sert le build local sur http://localhost:4173
```

Pas de tests unitaires. Type-check + intégration manuelle dans le navigateur suffisent pour du solo dev à cette échelle.
