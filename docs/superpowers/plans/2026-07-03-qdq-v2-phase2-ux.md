# QDQ v2 Phase 2 — UX niveau marché Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UX niveau Bankin' — skeletons, insights automatiques, animations/micro-interactions, recherche avancée, Home desktop 2 colonnes.

**Architecture:** Logique d'insights en module pur testé (`src/lib/insights.ts`), affichage en carrousel sur Home. Animations via CSS global + petits hooks (`useSwipe`, `usePullToRefresh`). SearchScreen enrichi sans restructuration. Home desktop en grille 2 colonnes derrière `useBreakpoint`.

**Tech Stack:** React 18, TypeScript 5, Vitest. Aucune nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-07-03-qdq-v2-design.md` (Phase 2) + reliquat Phase 1 (Home desktop 2 colonnes)

**Pré-requis :** Phase 1 livrée (useTheme, useBreakpoint, Sidebar, expenseCategories, 96 tests verts).

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/components/Skeleton.tsx` | Create | Blocs shimmer réutilisables (ligne, carte, cercle) |
| `src/App.tsx` | Modify | Skeletons au chargement, PullToRefresh |
| `src/lib/insights.ts` | Create | Génération d'insights typés (pur) |
| `src/lib/__tests__/insights.test.ts` | Create | Tests insights |
| `src/components/InsightsCarousel.tsx` | Create | Cartes swipables dismissables |
| `src/screens/Home.tsx` | Modify | + InsightsCarousel, grille desktop 2 col |
| `src/index.css` ou CSS global existant | Modify | Animations (fadeIn, pressable, slideUp déjà là) |
| `src/hooks/useSwipe.ts` | Create | Détection swipe horizontal |
| `src/components/TxRow.tsx` | Modify | Swipe-to-delete |
| `src/components/PullToRefresh.tsx` | Create | Tirer pour rafraîchir |
| `src/screens/modals/SearchScreen.tsx` | Modify | Montant min/max, multi-cat, chips, total ; CATS_E partagé |

---

### Task 1: Composant Skeleton + remplacement des spinners

**Files:**
- Create: `src/components/Skeleton.tsx`
- Modify: `src/App.tsx` (le spinner du `renderMain` quand `loading && !data`)
- Modify: CSS global (animation shimmer)

- [ ] **Step 1: Créer le composant**

`src/components/Skeleton.tsx` :

```tsx
import type { Theme } from '../types'

interface SkeletonProps { w?: number | string; h?: number; r?: number; t: Theme; style?: React.CSSProperties }

export const Skeleton = ({ w = '100%', h = 16, r = 8, t, style }: SkeletonProps) => (
  <div aria-hidden style={{
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(90deg, ${t.el} 25%, ${t.bo} 50%, ${t.el} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
    ...style,
  }} />
)

/** Squelette de l'écran Home pendant le chargement initial */
export const HomeSkeleton = ({ t }: { t: Theme }) => (
  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Skeleton t={t} w={140} h={22} />
    <Skeleton t={t} h={120} r={16} />
    <div style={{ display: 'flex', gap: 10 }}>
      <Skeleton t={t} h={72} r={14} />
      <Skeleton t={t} h={72} r={14} />
    </div>
    <Skeleton t={t} w={100} h={14} />
    <Skeleton t={t} h={180} r={16} />
    <Skeleton t={t} h={64} r={14} />
    <Skeleton t={t} h={64} r={14} />
  </div>
)
```

- [ ] **Step 2: Animation shimmer dans le CSS global**

Trouver où sont définis les keyframes existants (`spin`, `slideUp`) — probablement `src/index.css` ou un `<style>` dans `index.html`. Ajouter au même endroit :

```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 3: Remplacer le spinner de chargement dans App.tsx**

Dans `renderMain`, le bloc `if (loading && !data)` retourne actuellement un spinner. Remplacer par :

```tsx
if (loading && !data) return <HomeSkeleton t={t} />;
```

avec `import { HomeSkeleton } from './components/Skeleton'`. Garder le spinner de l'écran de démarrage session (avant auth) tel quel — c'est un splash, pas un chargement de données.

- [ ] **Step 4: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — tout vert.
Vérif visuelle : recharger l'app connectée → shimmer à la place du spinner.

- [ ] **Step 5: Commit**

```bash
git add src/components/Skeleton.tsx src/App.tsx
git commit -m "feat(ux): skeleton loaders shimmer à la place des spinners"
```

*(+ le fichier CSS modifié)*

---

### Task 2: Module insights.ts (pur, TDD)

**Files:**
- Create: `src/lib/insights.ts`
- Test: `src/lib/__tests__/insights.test.ts`

Champs `Transaction` : `m` (marchand), `amt` (négatif = dépense), `cat`, `dt` (ISO YYYY-MM-DD), `ico`. Vérifier dans `src/types/index.ts`.

- [ ] **Step 1: Test qui échoue**

`src/lib/__tests__/insights.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { buildInsights } from '../insights'
import type { Transaction } from '../../types'

const tx = (dt: string, amt: number, cat = 'Courses', m = 'Carrefour'): Transaction =>
  ({ id: Math.random().toString(), dt, amt, cat, m, ico: '🛒' } as Transaction)

const NOW = new Date('2026-07-15T12:00:00')

describe('buildInsights', () => {
  it('détecte une variation de catégorie > +15% vs mois précédent', () => {
    const txs = [
      tx('2026-06-05', -100), tx('2026-06-20', -100),   // juin : 200
      tx('2026-07-03', -150), tx('2026-07-10', -150),   // juillet : 300 → +50%
    ]
    const ins = buildInsights(txs, NOW)
    const varIns = ins.find(i => i.kind === 'category-trend')
    expect(varIns).toBeDefined()
    expect(varIns!.title).toContain('Courses')
    expect(varIns!.title).toContain('+50')
  })

  it('ignore les variations < 15%', () => {
    const txs = [tx('2026-06-05', -100), tx('2026-07-03', -110)] // +10%
    expect(buildInsights(txs, NOW).find(i => i.kind === 'category-trend')).toBeUndefined()
  })

  it('trouve la plus grosse dépense de la semaine', () => {
    const txs = [tx('2026-07-13', -25), tx('2026-07-14', -180, 'Loisirs', 'Fnac')]
    const big = buildInsights(txs, NOW).find(i => i.kind === 'biggest-week')
    expect(big).toBeDefined()
    expect(big!.title).toContain('Fnac')
  })

  it('détecte une dépense inhabituelle (> 2× moyenne de sa catégorie)', () => {
    const txs = [
      tx('2026-05-01', -20), tx('2026-05-15', -25), tx('2026-06-01', -22),
      tx('2026-07-10', -90), // ~4× la moyenne
    ]
    const unusual = buildInsights(txs, NOW).find(i => i.kind === 'unusual')
    expect(unusual).toBeDefined()
  })

  it('liste vide → aucun insight, pas de crash', () => {
    expect(buildInsights([], NOW)).toEqual([])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- --run src/lib/__tests__/insights.test.ts`
Expected: FAIL — Cannot find module '../insights'

- [ ] **Step 3: Implémenter**

`src/lib/insights.ts` :

```typescript
import type { Transaction } from '../types'
import { fmt } from './currency'

export type InsightKind = 'category-trend' | 'biggest-week' | 'unusual'

export interface Insight {
  id: string
  kind: InsightKind
  icon: string
  title: string
  detail: string
  tone: 'up' | 'down' | 'neutral'   // up = dépense en hausse (négatif), down = baisse (positif)
}

const monthKey = (d: string) => d.slice(0, 7)

export function buildInsights(txs: Transaction[], now: Date = new Date()): Insight[] {
  const out: Insight[] = []
  const spent = txs.filter(t => t.amt < 0 && t.cat !== 'Virement interne')
  if (spent.length === 0) return out

  const curMonth = now.toISOString().slice(0, 7)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const prevMonth = prev.toISOString().slice(0, 7)
  const prevLabel = prev.toLocaleDateString('fr-FR', { month: 'long' })

  // 1) Variation par catégorie vs mois précédent (seuil ±15 %)
  const byCatMonth: Record<string, Record<string, number>> = {}
  spent.forEach(t => {
    const mk = monthKey(t.dt)
    if (mk !== curMonth && mk !== prevMonth) return
    const cat = t.cat || 'Autre'
    byCatMonth[cat] = byCatMonth[cat] || {}
    byCatMonth[cat][mk] = (byCatMonth[cat][mk] || 0) + Math.abs(t.amt)
  })
  Object.entries(byCatMonth).forEach(([cat, months]) => {
    const cur = months[curMonth] || 0
    const before = months[prevMonth] || 0
    if (before < 10 || cur === 0) return
    const pct = Math.round(((cur - before) / before) * 100)
    if (Math.abs(pct) < 15) return
    out.push({
      id: `trend-${cat}`,
      kind: 'category-trend',
      icon: pct > 0 ? '📈' : '📉',
      title: `${cat} : ${pct > 0 ? '+' : ''}${pct}% vs ${prevLabel}`,
      detail: `${fmt(cur)} ce mois contre ${fmt(before)} le mois dernier`,
      tone: pct > 0 ? 'up' : 'down',
    })
  })

  // 2) Plus grosse dépense des 7 derniers jours
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const nowIso = now.toISOString().slice(0, 10)
  const week = spent.filter(t => t.dt >= weekAgo && t.dt <= nowIso)
  if (week.length > 0) {
    const biggest = week.reduce((a, b) => (Math.abs(b.amt) > Math.abs(a.amt) ? b : a))
    out.push({
      id: 'biggest-week',
      kind: 'biggest-week',
      icon: biggest.ico || '💸',
      title: `Plus grosse dépense : ${biggest.m}`,
      detail: `${fmt(Math.abs(biggest.amt))} cette semaine (${biggest.cat || 'Autre'})`,
      tone: 'neutral',
    })
  }

  // 3) Dépense inhabituelle ce mois (> 2× la moyenne historique de sa catégorie)
  const histByCat: Record<string, number[]> = {}
  spent.forEach(t => {
    if (monthKey(t.dt) === curMonth) return
    const cat = t.cat || 'Autre'
    ;(histByCat[cat] = histByCat[cat] || []).push(Math.abs(t.amt))
  })
  const curTxs = spent.filter(t => monthKey(t.dt) === curMonth)
  for (const t of curTxs) {
    const hist = histByCat[t.cat || 'Autre']
    if (!hist || hist.length < 3) continue
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length
    if (Math.abs(t.amt) > 2 * avg) {
      out.push({
        id: `unusual-${t.id}`,
        kind: 'unusual',
        icon: '👀',
        title: `Dépense inhabituelle : ${t.m}`,
        detail: `${fmt(Math.abs(t.amt))}, soit ${Math.round(Math.abs(t.amt) / avg)}× votre moyenne ${t.cat || 'Autre'}`,
        tone: 'up',
      })
      break // un seul insight de ce type
    }
  }

  return out
}
```

Note : si les assertions du test échouent sur un détail de format (`fmt`), ajuster le TEST pour matcher le format réel de `fmt` (ex. espace insécable) — le comportement compte, pas la chaîne exacte.

- [ ] **Step 4: Vérifier**

Run: `npm test -- --run src/lib/__tests__/insights.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/__tests__/insights.test.ts
git commit -m "feat(insights): moteur d'insights pur — tendances, record hebdo, dépense inhabituelle"
```

---

### Task 3: InsightsCarousel sur Home

**Files:**
- Create: `src/components/InsightsCarousel.tsx`
- Modify: `src/screens/Home.tsx`

- [ ] **Step 1: Composant carrousel**

`src/components/InsightsCarousel.tsx` :

```tsx
import { useState } from 'react'
import { sp } from '../lib/theme'
import type { Theme } from '../types'
import type { Insight } from '../lib/insights'

interface Props { insights: Insight[]; t: Theme }

const DISMISS_KEY = 'qdq-insights-dismissed'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
}

export const InsightsCarousel = ({ insights, t }: Props) => {
  const [dismissed, setDismissed] = useState<string[]>(getDismissed)
  const visible = insights.filter(i => !dismissed.includes(i.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50) // borne la liste
    setDismissed(next)
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
  }

  const toneColor = (tone: Insight['tone']) =>
    tone === 'up' ? t.rose : tone === 'down' ? t.mint : t.primary

  return (
    <div style={{ margin: '0 0 16px' }}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 20px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {visible.map(i => (
          <div key={i.id} style={{
            minWidth: 260, maxWidth: 280, scrollSnapAlign: 'start', flexShrink: 0,
            background: t.card, border: '1px solid ' + t.bo, borderRadius: 14,
            padding: '12px 14px', position: 'relative',
          }}>
            <button onClick={() => dismiss(i.id)} aria-label="Masquer cet insight"
              style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{i.icon}</span>
              <span style={{ fontSize: 13, ...sp('o', 600), color: toneColor(i.tone) }}>{i.title}</span>
            </div>
            <div style={{ fontSize: 11.5, ...sp('o'), color: t.sub, lineHeight: 1.4 }}>{i.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans Home**

Dans `src/screens/Home.tsx` (lire le fichier — le JSX commence après les valeurs dérivées) :

```typescript
import { buildInsights } from '../lib/insights'
import { InsightsCarousel } from '../components/InsightsCarousel'
```

Dans le corps : `const insights = buildInsights(D.txs || [])` (mémoïser avec `useMemo` sur `[D.txs]`).
Dans le JSX : insérer `<InsightsCarousel insights={insights} t={t} />` juste sous le bloc « Situation globale » (la carte solde total) et avant « Aperçu du mois ».

- [ ] **Step 3: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — vert.
Vérif visuelle : avec des transactions sur 2 mois, cartes d'insights visibles, swipe horizontal, ✕ masque durablement.

- [ ] **Step 4: Commit**

```bash
git add src/components/InsightsCarousel.tsx src/screens/Home.tsx
git commit -m "feat(insights): carrousel d'insights sur l'accueil — dismissable, scroll snap"
```

---

### Task 4: Micro-interactions — press feedback + fadeIn global

**Files:**
- Modify: CSS global (même fichier que Task 1)

- [ ] **Step 1: CSS global**

Ajouter :

```css
/* Press feedback sur tous les boutons */
button { transition: transform .12s ease, opacity .12s ease; }
button:active { transform: scale(0.97); }

/* Apparition douce des écrans */
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
main > * { animation: fadeSlideIn .22s ease; }

@media (prefers-reduced-motion: reduce) {
  button, main > * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Vérifier visuellement**

`npm run dev` : boutons s'enfoncent au clic, changement d'onglet fait apparaître l'écran en fondu. Aucune régression de layout.

- [ ] **Step 3: Commit**

```bash
git add <fichier css>
git commit -m "feat(ux): press feedback boutons + transition fadeIn entre écrans"
```

---

### Task 5: Swipe-to-delete sur TxRow

**Files:**
- Create: `src/hooks/useSwipe.ts`
- Modify: `src/components/TxRow.tsx`

**Lire TxRow.tsx en entier d'abord.** Il reçoit déjà un `onDelete` (vérifier la prop exacte et le flux de confirmation existant — s'il y a un ConfirmDialog, le réutiliser).

- [ ] **Step 1: Hook useSwipe**

`src/hooks/useSwipe.ts` :

```typescript
import { useRef, useState } from 'react'

/** Suivi d'un swipe horizontal ; expose l'offset courant et un reset. */
export function useSwipe(maxOffset = 88) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (Math.abs(dy) > Math.abs(dx)) return          // scroll vertical → ignorer
    if (dx < 0) setOffset(Math.max(dx, -maxOffset))  // swipe gauche seulement
  }
  const onTouchEnd = () => {
    startX.current = null
    startY.current = null
    setOffset(o => (o < -maxOffset * 0.6 ? -maxOffset : 0)) // snap ouvert/fermé
  }
  const reset = () => setOffset(0)

  return { offset, handlers: { onTouchStart, onTouchMove, onTouchEnd }, reset, open: offset <= -maxOffset * 0.9 }
}
```

- [ ] **Step 2: Intégrer dans TxRow**

Structure cible (adapter au JSX réel de TxRow) :

```tsx
const { offset, handlers, reset, open } = useSwipe()
// wrapper relatif :
<div style={{ position: 'relative', overflow: 'hidden' }}>
  {/* bouton révélé derrière, aligné à droite */}
  <button onClick={() => { reset(); /* déclencher le flux delete existant */ }}
    aria-label="Supprimer la transaction" tabIndex={open ? 0 : -1}
    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 88, background: t.rose, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
    Supprimer
  </button>
  {/* la ligne existante, translatée */}
  <div {...handlers} style={{ transform: `translateX(${offset}px)`, transition: offset === 0 || offset === -88 ? 'transform .18s ease' : 'none', background: t.bg /* couvrir le bouton */ }}>
    {/* contenu existant de la ligne */}
  </div>
</div>
```

Contraintes :
- Si TxRow a déjà un bouton delete visible, le garder (desktop n'a pas de touch) — le swipe est un chemin additionnel.
- Le tap normal sur la ligne (s'il y a un onClick) ne doit pas se déclencher pendant/après un swipe : si `offset !== 0`, `reset()` au clic au lieu d'exécuter l'action.
- Réutiliser le flux de confirmation existant (ConfirmDialog ou window.confirm — regarder comment le delete actuel fonctionne).

- [ ] **Step 3: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — vert.
Vérif device/devtools mobile : swipe gauche révèle « Supprimer », tap dessus déclenche la confirmation existante, swipe droit/scroll vertical inertes.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSwipe.ts src/components/TxRow.tsx
git commit -m "feat(ux): swipe-to-delete sur les lignes de transaction"
```

---

### Task 6: Pull-to-refresh

**Files:**
- Create: `src/components/PullToRefresh.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Composant**

`src/components/PullToRefresh.tsx` :

```tsx
import { useRef, useState } from 'react'
import type { Theme } from '../types'

interface Props { onRefresh: () => Promise<unknown> | void; t: Theme; children: React.ReactNode }

const THRESHOLD = 70

export const PullToRefresh = ({ onRefresh, t, children }: Props) => {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    // uniquement si le scroll parent est en haut
    const scroller = containerRef.current?.closest('main')
    if (scroller && scroller.scrollTop > 0) return
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setPull(Math.min(dy * 0.5, THRESHOLD + 30))
  }
  const onTouchEnd = async () => {
    startY.current = null
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try { await onRefresh() } finally { setRefreshing(false); setPull(0) }
    } else {
      setPull(0)
    }
  }

  return (
    <div ref={containerRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div aria-hidden style={{
        height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: startY.current == null ? 'height .2s ease' : 'none', overflow: 'hidden',
      }}>
        <div style={{
          width: 22, height: 22, border: '2.5px solid ' + t.primary + '33', borderTop: '2.5px solid ' + t.primary,
          borderRadius: '50%', opacity: Math.min(pull / THRESHOLD, 1),
          animation: refreshing ? 'spin .8s linear infinite' : 'none',
          transform: refreshing ? undefined : `rotate(${pull * 3}deg)`,
        }} />
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Envelopper les onglets Accueil et Dépenses dans App.tsx**

Dans `renderMain`, envelopper les retours des onglets `accueil` et `depenses` :

```tsx
if (tab === 'accueil') return (
  <PullToRefresh onRefresh={async () => { reload(); }} t={t}>
    {/* contenu existant de l'onglet accueil */}
  </PullToRefresh>
);
```

Idem pour `depenses`. Import : `import { PullToRefresh } from './components/PullToRefresh'`.

- [ ] **Step 3: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — vert.
Devtools mode mobile : tirer vers le bas depuis le haut de l'Accueil → spinner, données rechargées. Le scroll normal de la liste ne déclenche rien.

- [ ] **Step 4: Commit**

```bash
git add src/components/PullToRefresh.tsx src/App.tsx
git commit -m "feat(ux): pull-to-refresh sur Accueil et Dépenses"
```

---

### Task 7: Recherche avancée

**Files:**
- Modify: `src/screens/modals/SearchScreen.tsx`

État actuel (lire le fichier) : filtres `q`, `filterCat` (simple), `filterAcc` (simple), `filterType`, `dateFrom/dateTo`, pagination 15, constante CATS_E dupliquée en tête de fichier.

- [ ] **Step 1: Dédupliquer CATS_E**

Supprimer la constante locale `CATS_E` et importer : `import { CATS_E } from '../../lib/expenseCategories'`.

- [ ] **Step 2: Filtres montant min/max**

Ajouter états `amtMin` / `amtMax` (string, input `inputMode="decimal"`), dans le panneau de filtres existant (`showFilters`) :

```tsx
<div style={{ display: 'flex', gap: 8 }}>
  <input value={amtMin} onChange={e => { setAmtMin(e.target.value); resetPage() }} placeholder="Min €" inputMode="decimal"
    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.el, color: t.tx, fontSize: 13, ...sp('o') }} />
  <input value={amtMax} onChange={e => { setAmtMax(e.target.value); resetPage() }} placeholder="Max €" inputMode="decimal"
    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.el, color: t.tx, fontSize: 13, ...sp('o') }} />
</div>
```

Dans le filtre : `const min = parseFloat(amtMin.replace(',', '.'))` — si non-NaN, exiger `Math.abs(tx.amt) >= min` ; idem max.

- [ ] **Step 3: Multi-sélection catégories et comptes**

Remplacer `filterCat: string` par `filterCats: string[]` (toggle au clic sur les chips existantes du panneau, état sélectionné visible). Idem `filterAccs: string[]`. Filtre : `filterCats.length === 0 || filterCats.includes(tx.cat)`.

- [ ] **Step 4: Chips de filtres actifs + total agrégé**

Sous la barre de recherche, quand des filtres sont actifs :

```tsx
{activeChips.length > 0 && (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0' }}>
    {activeChips.map(c => (
      <button key={c.key} onClick={c.clear}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: t.mD, border: '1px solid ' + t.primary + '44', color: t.primary, fontSize: 11, ...sp('o', 600), cursor: 'pointer' }}>
        {c.label} ✕
      </button>
    ))}
  </div>
)}
```

`activeChips` construit depuis chaque filtre actif (catégories sélectionnées, comptes, min/max, dates, type), chacun avec son `clear`.

Au-dessus des résultats, ligne de synthèse :

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 10px', fontSize: 12, ...sp('o'), color: t.sub }}>
  <span>{results.length} opération{results.length > 1 ? 's' : ''}</span>
  <span style={{ ...sp('m', 600), color: total < 0 ? t.rose : t.mint }}>{fmt(total)}</span>
</div>
```

avec `const total = results.reduce((s, tx) => s + tx.amt, 0)`.

- [ ] **Step 5: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — vert.
Vérif visuelle : combiner catégorie ×2 + plage de montant + dates → chips visibles, total juste, suppression d'une chip relance le filtre.

- [ ] **Step 6: Commit**

```bash
git add src/screens/modals/SearchScreen.tsx
git commit -m "feat(search): filtres montant + multi-sélection + chips actives + total agrégé"
```

---

### Task 8: Home desktop 2 colonnes (reliquat Phase 1)

**Files:**
- Modify: `src/screens/Home.tsx`

- [ ] **Step 1: Grille conditionnelle**

Dans Home.tsx :

```typescript
import { useBreakpoint } from '../hooks/useBreakpoint'
```

`const { isDesktop } = useBreakpoint()`.

Identifier les deux groupes du JSX : (A) synthèse — header, situation globale, insights, aperçu du mois ; (B) listes — comptes, feed transactions/récurrents.

Wrapper :

```tsx
<div style={isDesktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start', padding: '0 20px' } : undefined}>
  <div>{/* groupe A */}</div>
  <div>{/* groupe B */}</div>
</div>
```

Mobile : les deux `<div>` internes se suivent naturellement (aucun changement visuel). Ajuster les paddings horizontaux internes si le wrapper desktop les double.

- [ ] **Step 2: Vérifier**

Run: `npm test -- --run && npx tsc --noEmit && npm run build` — vert.
Vérif : <768px identique à avant ; ≥768px deux colonnes équilibrées.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Home.tsx
git commit -m "feat(responsive): Home en 2 colonnes sur desktop"
```

---

### Task 9: Vérification finale Phase 2

- [ ] **Step 1: Suite complète**

Run: `npm test -- --run && npx tsc --noEmit && npm run build`
Expected: ~101 tests verts (96 + 5 insights), 0 erreur.

- [ ] **Step 2: Parcours manuel**

1. Recharge connectée → skeletons shimmer
2. Home : cartes insights (avec données 2 mois), dismiss persiste
3. Boutons : feedback press ; onglets : fondu
4. Mobile : swipe gauche sur transaction → Supprimer ; pull-to-refresh Accueil
5. Recherche : combiner filtres, chips, total
6. Desktop : Home 2 colonnes
7. Thème sombre : tout reste lisible (skeletons, insights, chips)

- [ ] **Step 3: Push**

```bash
git push
```
