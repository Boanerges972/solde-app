import { sp } from '../lib/theme'
import { fmtS } from '../lib/currency'
import type { Theme, AppData } from '../types'

interface Props {
  D: AppData
  t: Theme
  threshold: number
  onDismiss: () => void
}

export const BudgetAlert = ({ D, t, threshold, onDismiss }: Props) => {
  const pct = D.budget > 0 ? D.spent / D.budget * 100 : 0
  const over = pct >= 100
  const warn = pct >= threshold && pct < 100
  if (!over && !warn) return null
  const col = over ? t.rose : t.amber
  const bg = over ? t.rD : t.aD
  return (
    <div role="alert" style={{ margin: '8px 16px 0', padding: '12px 14px', borderRadius: 16,
      background: bg, border: '1px solid ' + col + '55',
      display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown .3s ease' }}>
      <span aria-hidden="true" style={{ fontSize: 22, flexShrink: 0 }}>{over ? '🚨' : '⚠️'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, ...sp('o', 700), color: col }}>{over ? 'Budget dépassé !' : 'Attention, budget bientôt épuisé'}</div>
        <div style={{ fontSize: 11, ...sp('o'), color: col, opacity: .85, marginTop: 2 }}>
          {over ? 'Dépassé de ' + fmtS(D.spent - D.budget) : Math.round(pct) + '% utilisé · ' + fmtS(D.rem) + ' restant'}
        </div>
      </div>
      <button onClick={onDismiss} aria-label="Fermer l'alerte budget" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: col, opacity: .6, lineHeight: 1 }}>✕</button>
    </div>
  )
}
