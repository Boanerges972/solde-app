import { fmt } from '../lib/currency'

interface DonutProps {
  spent: number
  budget: number
  col: string
  sz?: number
  sw?: number
}

export const Donut = ({ spent, budget, col, sz = 72, sw = 6 }: DonutProps) => {
  const r = (sz - sw * 2) / 2, cx = sz / 2, cy = sz / 2
  const circ = 2 * Math.PI * r, pct = Math.min(budget > 0 ? spent / budget : 0, 1)
  const pctLabel = Math.round(pct * 100)
  return (
    <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
      role="img" aria-label={`${pctLabel}% du budget utilisé (${fmt(spent, 0)} sur ${fmt(budget, 0)})`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={sw}
        strokeDasharray={String(pct * circ) + ' ' + String(circ)} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .7s ease' }} />
    </svg>
  )
}
