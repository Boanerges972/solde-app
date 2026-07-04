# Account Scoring & Recommandation — Design Spec

**Date:** 2026-05-25  
**Status:** Approved

## Goal

Enrichir la saisie de dépense (ExpEntry) avec un moteur de scoring qui évalue chaque compte sur 100 points et recommande automatiquement le meilleur compte à utiliser, avec score numérique visible, badges colorés et chiffres clés.

---

## Decisions

- **Layout:** recommandation intégrée dans ExpEntry — pas d'écran séparé
- **Scoring:** score numérique /100 + barre de progression par compte
- **Sélection:** compte le mieux scoré auto-sélectionné ; l'utilisateur peut tapper un autre compte pour override
- **Déclenchement:** calcul live dès que `amount > 0`

---

## Architecture

### New files
- `src/lib/scoreAccounts.ts` — fonction pure : prend accounts, recurrings, amount, AppData → retourne `AccountScore[]` trié score décroissant
- `src/components/AccountScoreCard.tsx` — carte compte avec barre score, badge coloré, 3 chiffres clés

### Modified files
- `src/screens/modals/ExpEntry.tsx` — remplace le dropdown compte par la zone scoring ; auto-sélection + override

### No new npm dependencies

---

## `src/lib/scoreAccounts.ts`

### Types exportés

```ts
export type ScoreStatus = 'recommended' | 'acceptable' | 'risky' | 'discouraged'

export interface AccountScore {
  accountId: string
  score: number           // 0–100
  status: ScoreStatus
  previsionnel: number    // acc.bal - amount - committed
  soldeApres: number      // acc.bal - amount
  committed: number       // prélèvements restants (31j)
  finDeMois: number       // previsionnel (alias lisible)
  breakdown: {
    previsionnel: number  // pts earned (0|20|40)
    marge: number         // pts earned (0|10|20)
    prelevements: number  // pts earned (0|15)
    revenus: number       // pts earned (0|10)
    budget: number        // pts earned (0|10)
    preference: number    // pts earned (always 5)
  }
}
```

### Signature

```ts
export function scoreAccounts(
  accounts: Account[],
  recurrings: Recurring[],
  amount: number,
  D: AppData,
  allHistory: Transaction[]
): AccountScore[]
```

### Algorithme (par compte)

```
1. Calcul committed (prélèvements restants dans 31j pour ce compte)
   = somme des recurrings[r.account_id === acc.id] dont date de passage ≤ today + 31j

2. soldeApres = acc.bal - amount
   previsionnel = soldeApres - committed

3. Points :

   a) Solde prévisionnel (40 pts)
      previsionnel > 0               → 40 pts
      previsionnel > -acc.overdraft  → 20 pts  (dans le découvert autorisé)
      sinon                          → 0 pts

   b) Marge de sécurité (20 pts)
      acc.bal > 0 && (soldeApres / acc.bal) >= 0.30  → 20 pts
      acc.bal > 0 && (soldeApres / acc.bal) >= 0.10  → 10 pts
      sinon                                           → 0 pts

   c) Prélèvements couverts (15 pts)
      soldeApres > committed  → 15 pts
      sinon                   → 0 pts

   d) Revenus récents sur ce compte (10 pts)
      allHistory a au moins 1 tx avec (acc === account.id && amt > 0)
      dans les 60 derniers jours  → 10 pts
      sinon                       → 0 pts

   e) Budget mensuel (10 pts)
      D.monthBudget > 0 && D.monthSpent / D.monthBudget < 0.80  → 10 pts
      sinon                                                       → 0 pts

   f) Préférence utilisateur (5 pts)
      Toujours 5 pts (extensible : futur compte favori)

4. score = somme des points (0–100)

5. Status :
   score >= 70  → 'recommended'   (vert  : t.mint)
   score >= 45  → 'acceptable'    (ambre : t.amber)
   score >= 20  → 'risky'         (rose  : t.rose avec opacité réduite)
   score < 20   → 'discouraged'   (rouge : t.rose)
```

**Tri :** retourner `AccountScore[]` trié par `score` décroissant.

**Comptes Pro exclus du scoring** si `D.persoAccs` existe et l'account n'y figure pas (sauf si tous les comptes sont Pro).

**Edge cases :**
- `amount <= 0` → retourner `[]`
- `accounts.length === 0` → retourner `[]`
- `acc.bal === 0 && amount > 0` → marge = 0pts, prévisionnel négatif

---

## `src/components/AccountScoreCard.tsx`

### Props

```ts
interface AccountScoreCardProps {
  acc: Account
  score: AccountScore
  selected: boolean
  onSelect: (accountId: string) => void
  t: Theme
}
```

### Layout (variant selected vs non-selected)

**Selected (meilleur compte ou override utilisateur) :**
- `border: 1.5px solid t.mint` (recommended) / t.amber / t.rose selon status
- `background: t.mD` (recommended) ou variante amber/rose
- Nom compte + badge status
- Barre score pleine largeur avec gradient coloré + label `XX/100`
- 3 mini-cartes : Solde après / Prélèvements / Fin mois

**Non-selected (comptes alternatifs) :**
- `border: 1px solid t.bo` neutre
- `background: t.el`
- Nom compte compact + barre score fine + badge status
- Pas de mini-cartes (expand on select)

### Badge colors

| Status | Label | Background | Text |
|---|---|---|---|
| recommended | RECOMMANDÉ | `t.mD` | `t.mint` |
| acceptable | ACCEPTABLE | `t.aD` | `t.amber` |
| risky | RISQUÉ | `t.rD + '88'` | `t.rose` |
| discouraged | DÉCONSEILLÉ | `t.rD` | `t.rose` |

---

## Changes to `src/screens/modals/ExpEntry.tsx`

### New state

```ts
const [selectedAccId, setSelectedAccId] = useState<string>(() => D.accounts[0]?.id ?? '')
```

### Calcul scores (useMemo)

```ts
const scores = useMemo(() => {
  const n = parseFloat(String(amount)) || 0
  if (n <= 0) return []
  return scoreAccounts(D.accounts, recurrings, n, D, allHistory)
}, [amount, D, recurrings, allHistory])
```

### Auto-sélection

```ts
useEffect(() => {
  if (scores.length > 0) {
    setSelectedAccId(scores[0].accountId)  // meilleur score auto-sélectionné
  }
}, [scores])
```

### Zone scoring dans le JSX

Remplace l'actuel `<select>` compte par :

```
{ amount > 0 && scores.length > 0 ? (
  <div>
    <label>QUEL COMPTE UTILISER ?</label>
    {scores.map(score => (
      <AccountScoreCard
        key={score.accountId}
        acc={D.accounts.find(a => a.id === score.accountId)!}
        score={score}
        selected={selectedAccId === score.accountId}
        onSelect={setSelectedAccId}
        t={t}
      />
    ))}
  </div>
) : (
  <select> ... </select>  // fallback si amount = 0 ou pas de scores
)}
```

### Bouton valider

Affiche le nom du compte sélectionné :
```
"✓ Enregistrer avec {selectedAcc.name}"
```

### Payload `onSave`

`account_id: selectedAccId` (inchangé, déjà dans le payload)

---

## Data Flow

```
1. User tape montant
   → useMemo recalcule scores (scoreAccounts)
   → useEffect auto-sélectionne scores[0].accountId
   → Zone scoring affiche AccountScoreCard pour chaque compte

2. User tape sur un autre compte
   → setSelectedAccId(accountId)
   → carte sélectionnée s'expand avec chiffres clés

3. User valide
   → onSave({ ..., account_id: selectedAccId })
   → ExpEntry se ferme, transaction enregistrée
```

---

## Tests

**`src/lib/__tests__/scoreAccounts.test.ts`**

Cas à tester :
1. `amount <= 0` → retourne `[]`
2. Compte avec solde largement suffisant → status 'recommended', score ≥ 70
3. Compte avec solde juste suffisant → status 'acceptable'
4. Compte avec prélèvements non couverts → score criterion c = 0
5. Compte avec solde négatif après dépense → status 'discouraged' ou 'risky'
6. Tri : meilleur score en premier
7. Compte Pro exclu si persoAccs disponible
8. Marge de sécurité : solde 1000, dépense 300 → marge 70% → 20pts
9. Revenus récents : tx positive ≤ 60j → 10pts ; sinon 0pts
10. Budget dépassé à 85% → criterion e = 0pts

---

## Error / Edge Cases

| Condition | Comportement |
|---|---|
| `amount = 0` | Zone scoring cachée, dropdown compte standard affiché |
| Tous comptes DÉCONSEILLÉ | Affiche quand même le meilleur disponible avec warning |
| 1 seul compte | Affiche juste ce compte avec son score |
| Compte Pro only | Scoring sur tous les comptes (pas de filtrage perso) |
| `allHistory` vide | Criterion d = 0pts pour tous les comptes |

---

## What Is NOT in Scope

- Historique des recommandations
- Export PDF/CSV
- Score influencé par préférence utilisateur explicite (toujours 5pts)
- Recommandation pour dépôts ou virements
- Notifications proactives liées au scoring
