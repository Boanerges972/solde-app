import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import { projectBalanceWithMin, type ProjRecurring } from '../lib/projection'
import type { Theme, Account, Recurring, Transaction } from '../types'

interface Props {
  t: Theme
  accounts: Account[]
  recurrings: Recurring[]
  txs: Transaction[]
}

/** Convertit le date_label d'un prélèvement en jour du mois (1-31). */
function dayFromLabel(label: string): number {
  const lower = (label || '').toLowerCase()
  if (lower.includes('fin') || lower.includes('dernier') || lower.includes('last')) return 28
  const m = (label || '').match(/\d+/)
  const d = m ? parseInt(m[0]) : 1
  return d >= 1 && d <= 31 ? d : 1
}

const HORIZONS = [30, 60, 90] as const

export const ProjectionChart = ({ t, accounts, recurrings, txs }: Props) => {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30)

  const balance = accounts.reduce((s, a) => s + (a.bal || 0), 0)

  const projRecs: ProjRecurring[] = useMemo(() =>
    (recurrings || [])
      .map(r => ({ name: r.name, amount: Math.abs(parseFloat(String(r.amount)) || 0), day: dayFromLabel(r.date_label) }))
      .filter(r => r.amount > 0),
    [recurrings])

  const { points, minPoint } = useMemo(
    () => projectBalanceWithMin(balance, projRecs, txs || [], horizon),
    [balance, projRecs, txs, horizon])

  const goesNegative = minPoint.balance < 0
  const data = points.map(p => ({
    ...p,
    label: new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  }))

  return (
    <div style={{ background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, padding: '18px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: 1, textTransform: 'uppercase' }}>
          Projection du solde
        </div>
        <div role="group" aria-label="Horizon" style={{ display: 'flex', gap: 4 }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} aria-pressed={horizon === h}
              style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, ...sp('o', horizon === h ? 600 : 400), cursor: 'pointer',
                background: horizon === h ? t.primary : t.el, color: horizon === h ? '#fff' : t.sub,
                border: '1px solid ' + (horizon === h ? t.primary : t.bo) }}>
              {h}j
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 22, ...sp('m', 700), color: t.tx }}>{fmt(points[points.length - 1].balance, 0)}</span>
        <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>dans {horizon} jours</span>
        {goesNegative && (
          <span style={{ fontSize: 10.5, ...sp('o', 600), color: t.dangerText, background: t.rD, padding: '2px 8px', borderRadius: 6 }}>
            ⚠️ passe sous 0 le {new Date(minPoint.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </span>
        )}
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={goesNegative ? t.rose : t.primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={goesNegative ? t.rose : t.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: t.muted }} tickLine={false} axisLine={false}
              interval={Math.floor(data.length / 5)} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: t.card, border: '1px solid ' + t.bo, borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: t.sub }}
              formatter={(v: number) => [fmt(v), 'Solde']} />
            <ReferenceLine y={0} stroke={t.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
            <Area type="monotone" dataKey="balance" stroke={goesNegative ? t.rose : t.primary}
              strokeWidth={2} fill="url(#projGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: 10, ...sp('o'), color: t.muted, marginTop: 6 }}>
        Basé sur vos prélèvements confirmés + votre moyenne de dépenses des 90 derniers jours
      </div>
    </div>
  )
}
