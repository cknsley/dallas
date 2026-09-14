# RESELL — Code Conventions & Patterns

## Stack & Setup
- **Framework**: React 18 + TypeScript + Vite
- **Routing**: React Router v6
- **State**: Zustand (store in `src/store/StoreContext.tsx`)
- **CSS**: Hand-written vanilla CSS in `src/index.css` (no Tailwind)
- **Charts**: Recharts
- **Icons**: Lucide React (ArrowRight, TrendingUp, etc.) + emoji
- **Date parsing**: ISO strings (YYYY-MM-DD), formatters in `src/lib/format.ts`

## File Structure
```
src/
  pages/          # Route pages (CentraleAchat, Stock, Dashboard, Ventes, etc.)
  components/     # Reusable UI (Layout, HeaderActions, Kpi, Modal, Photo, etc.)
  modals/         # Modal dialogs (ItemModal, OrderModal, SupplierModal, etc.)
  lib/            # Utilities
    calc.ts       # computeStats, costOf, qtyOf, marginOf, revenueOf, etc.
    format.ts     # eur(), eur2(), dshort(), num(), pct(), today()
    links.ts      # Navigation paths
    useSecteur.ts # Sector/domain filtering hook
    usePref.ts    # Preference persistence
    suppliers.ts  # Supplier list building
  types.ts        # Item, Supplier, CustomSector, etc.
  store/          # Zustand store + context
  modals/         # Modal components
```

## UI Components & Classes (in src/components/ui)

### Kpi Component
```jsx
<Kpi
  label="Stock actuel"
  value={eur(stockValue)}
  meta="123 article(s) disponibles"
  tone="ok"  // "ok" | "info" | "warn" | "bad"
  to={links.stock()}
  hint="Voir"
/>
```
- Used in `.kpi-grid` containers (row of KPIs)
- Always put metrics in a grid at top of page sections

### CSS Classes (Grids & Layout)

| Class | Purpose |
|-------|---------|
| `.kpi-grid` | Flex row of KPI pills — metrics bar at page top |
| `.action-grid-3x3` | 3-column grid of action cards (full width, no max-width limit) |
| `.action-grid-card` | Single action card (icon, title, desc) — hover lifts it |
| `.card` | Generic container (border, shadow, rounded) |
| `.card-h` | Card header (h3 + spacer + buttons) |
| `.card-b` | Card body (padding 24/16) |
| `.perf-kpis` | Dashboard KPI row (4 columns at top of Dashboard.tsx) |
| `.table-compact` | Tight table (no extra padding) |
| `.twrap` | Table wrapper (overflow-x auto on mobile) |
| `.cols two` | Two-column layout on desktop, stack on mobile |

### Common Patterns

**Page structure:**
```jsx
<HeaderActions>
  <RangePicker /> {/* Date range picker */}
  <input type="search" placeholder="…" />
  <button className="btn">+ Nouveau</button>
  <button className="btn primary">Action</button>
</HeaderActions>

<div className="kpi-grid">
  <Kpi ... />
  <Kpi ... />
</div>

<div className="card">
  <div className="card-h">
    <h3>Section Title</h3>
    <div className="spacer" />
    <a href="…">Voir plus →</a>
  </div>
  <div className="card-b">
    {/* content */}
  </div>
</div>
```

**Action grid (3×3 buttons):**
```jsx
<div className="action-grid-3x3">
  <button className="action-grid-card" onClick={() => …}>
    <span className="icon">🛍️</span>
    <span className="title">Article seul</span>
    <span className="desc">Description here</span>
  </button>
  {/* 5 more cards */}
</div>
```

### Buttons
- `.btn` — default button
- `.btn.primary` — accent color
- `.btn.ok` — green (save/accept)
- `.btn.ghost` — low-emphasis
- `.btn.sm` — small variant

## Common Utilities

### Import patterns
```ts
import { eur, eur2, dshort, num, pct } from "../lib/format";
import { costOf, qtyOf, marginOf, revenueOf, computeStats } from "../lib/calc";
import { links } from "../lib/links";
import { useStore } from "../store/StoreContext";
import { useSecteur } from "../lib/useSecteur";
import { useToast } from "../components/Toast";
import { useDateRange } from "../lib/useDateRange";
```

### Date helpers
```ts
today()                    // YYYY-MM-DD string for today
dshort(date)              // "14 sep" formatted
range.from / range.to     // From useDateRange hook
periodRange("all")        // All-time range object
```

### Numbers
```ts
eur(12500)      // "12 500 €"
eur2(12.50)     // "12,50 €"
num("12,5")     // Parses "12,5" → 12.5
pct(45.2)       // "45 %"
```

### Store operations
```ts
dispatch({ type: "upsertItem", item: { ... } })
dispatch({ type: "patchItem", id, patch: { cost: 50 } })
dispatch({ type: "removeItem", id })
dispatch({ type: "settings", patch: { vaultAmount: 1000 } })
```

## Recent Changes (Sept 2026)

**Centrale & Arrivage Refactor**
- Centrale d'achat: Kanban "Cette semaine" (Todo/Ventes/Livraison) + calendrier RangePicker
- Arrivage: Page dédiée, groupée par urgence (🔴 Retard / 🟡 J-7 / ⚪ Plus tard) + calendrier
- Sourcing: 3 colonnes (À rechercher / En négociation / Trouvé), métrique "En négociation", séparé par univers (`?secteur=...`) et centralisé dans l'accueil (`/sourcing` global avec filtres rapides + widget/KPI dans `Home.tsx`)
- Stock: Colonnes refactorisées (enlever Source, ajouter Coût/Frais/Prix/Estimation)
- Ventes: Dropdown livraison + toggle litiges perso (pas de "Ventes globales"), archivage auto à livraison
- Livraison: Kanban par défaut, tab "Arrivages fournisseurs" en toolbar toggle
- SAV: Litiges perso en toggle, retours en lien externe (→ `/retours`)

## How To Work On This Project

### Read Strategy
**Don't re-read entire files every session.** Use grep for patterns, then targeted edits.
- `grep -n "className" src/index.css` → find CSS class definitions
- `grep -n "function ComponentName" src/pages/X.tsx` → locate components
- `grep -n "kanban\|kcol\|kcard" src/index.css` → find Kanban styles (reused across pages)

### Typical Edit Pattern
1. Grep for the pattern/class you need to modify (e.g., `.action-grid-3x3`)
2. Edit only that CSS or that component
3. Test in dev server
4. Done — no need to re-read adjacent files

### CSS Grid Patterns
- `.action-grid-3x3` has `grid-template-columns: repeat(3, minmax(200px, 1fr))` — always **full width**, no max-width
- `.kpi-grid` is flex row, wraps on mobile
- Grids take `gap: 14px` (standard spacing)

### Modal Patterns
- All modals import from `../components/ui` or are in `src/modals/`
- Always include `onClose` callback
- Use `Modal` wrapper component (title, footer with buttons)

### New Pages
Copy structure from existing page (e.g., `CentraleAchat.tsx`):
1. HeaderActions at top
2. Kpi grid if metrics needed
3. Card sections (card > card-h + card-b)
4. Tables in `.twrap` for responsive scroll

## Areas to Avoid (Code Smell)
- Hardcoded widths (use grid/flex percentages)
- Inline styles for layout (use CSS classes)
- Re-reading files to understand context — grep first
- Max-width limits on grids that should be full-width

## Notes
- Commit messages: concise, type-prefix (feat, fix, refactor)
- No semicolons at end of JSX (linter set up that way)
- Color scheme vars: `--accent`, `--ink`, `--ink-3`, `--surface-2`, `--line`
