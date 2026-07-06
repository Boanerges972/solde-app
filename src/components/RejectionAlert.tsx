import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, Account, Recurring } from '../types'

export const calcARD = (accounts: Account[], recurrings: Recurring[], days = 31) => {
  const today = new Date()
  const result: Record<string, {
    ard: number
    committed: number
    debits: Array<Recurring & { next: Date; daysUntil: number; amt: number }>
    overdraft: number
    realAvail: number
    status: 'danger' | 'warning' | 'ok'
  }> = {}
  accounts.forEach(acc => {
    const debits = recurrings.filter(r => r.account_id === acc.id).map(r => {
      const dayOfMonth = parseInt(r.date_label || '1', 10)
      const next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
      if (next < today) next.setMonth(next.getMonth() + 1)
      const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...r, next, daysUntil, amt: parseFloat(String(r.amount)) }
    }).filter(r => r.daysUntil <= days)

    const committed = debits.reduce((s, r) => s + r.amt, 0)
    const overdraft = parseFloat(String(acc.overdraft || 0))
    const ard = acc.bal + overdraft - committed
    const realAvail = acc.bal + overdraft
    result[acc.id] = {
      ard, committed, debits, overdraft, realAvail,
      status: ard < 0 ? 'danger' : ard < Math.max(committed * 0.2, 50) ? 'warning' : 'ok',
    }
  })
  return result
}

interface Props {
  t: Theme
  accounts: Account[]
  recurrings: Recurring[]
  onManage: () => void
}

export const RejectionAlert = ({ t, accounts, recurrings, onManage }: Props) => {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('qdq-rej-dismissed') === new Date().toDateString()
  )
  const ard = calcARD(accounts, recurrings, 14)
  const risks = Object.entries(ard)
    .filter(([, v]) => {
      return v.status === 'danger' ||
        (v.debits.some(d => d.daysUntil <= 7) && v.ard < v.committed * 0.5)
    })
    .map(([id, v]) => ({ acc: accounts.find(a => a.id === id), ard: v }))
    .filter(r => r.acc)

  if (!risks.length || dismissed) return null

  const dismiss = () => {
    localStorage.setItem('qdq-rej-dismissed', new Date().toDateString())
    setDismissed(true)
  }

  return (
    <div style={{ margin: '8px 16px 0', borderRadius: 18, overflow: 'hidden',
      border: '1px solid ' + t.rose + '44', animation: 'slideDown .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: 'linear-gradient(135deg,' + t.rose + '22,' + t.rose + '0A)' }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🚨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, ...sp('o', 700), color: t.dangerText }}>Risque de rejet dans 14 jours</div>
          <div style={{ fontSize: 11, ...sp('o'), color: t.dangerText, opacity: .8, marginTop: 1 }}>
            {risks.length} compte{risks.length > 1 ? 's' : ''} insuffisant{risks.length > 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={dismiss} aria-label="Fermer l'alerte de rejet"
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: t.dangerText, opacity: .6, lineHeight: 1 }}>✕</button>
      </div>
      {risks.map(({ acc, ard: v }) => (
        <div key={acc!.id} style={{ padding: '10px 14px',
          borderTop: '1px solid ' + t.rose + '22',
          background: t.rD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: acc!.col, flexShrink: 0 }} />
            <span style={{ fontSize: 13, ...sp('s', 600), color: acc!.col, flex: 1 }}>{acc!.name}</span>
            <span style={{ fontSize: 13, ...sp('m', 600), color: v.ard < 0 ? t.rose : t.amber }}>
              ARD {v.ard < 0 ? '−' : ''}{fmt(Math.abs(v.ard), 0)}
            </span>
          </div>
          {v.debits.filter(d => d.daysUntil <= 14).slice(0, 3).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', borderTop: i > 0 ? '1px solid ' + t.rose + '11' : undefined }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>{d.icon || '📋'}</span>
              <span style={{ fontSize: 12, ...sp('o'), color: t.sub, flex: 1 }}>{d.name}</span>
              <span style={{ fontSize: 11, ...sp('o'), color: t.muted, marginRight: 6 }}>
                {d.daysUntil === 0 ? "Aujourd'hui" : d.daysUntil === 1 ? 'Demain' : 'Dans ' + d.daysUntil + 'j'}
              </span>
              <span style={{ fontSize: 12, ...sp('m', 600), color: t.dangerText }}>−{fmt(d.amt, 0)}</span>
            </div>
          ))}
        </div>
      ))}
      <button onClick={onManage}
        style={{ display: 'block', width: '100%', padding: '11px', background: t.rose + '18',
          border: 'none', borderTop: '1px solid ' + t.rose + '22', cursor: 'pointer',
          ...sp('o', 600), fontSize: 13, color: t.dangerText }}>
        Gérer mes prélèvements →
      </button>
    </div>
  )
}
