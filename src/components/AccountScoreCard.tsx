import { fmt } from '../lib/currency'
import type { Theme, Account } from '../types'
import type { AccountScore, ScoreStatus } from '../lib/scoreAccounts'

interface AccountScoreCardProps {
  acc: Account
  score: AccountScore
  selected: boolean
  onSelect: (accountId: string) => void
  t: Theme
}

const STATUS_LABEL: Record<ScoreStatus, string> = {
  recommended: 'RECOMMANDÉ',
  acceptable: 'ACCEPTABLE',
  risky: 'RISQUÉ',
  discouraged: 'DÉCONSEILLÉ',
}

function statusColors(status: ScoreStatus, t: Theme) {
  switch (status) {
    case 'recommended': return { border: t.mint, bg: t.mD, badgeBg: t.mD, text: t.mint, barColor: t.mint }
    case 'acceptable':  return { border: t.amber, bg: t.aD, badgeBg: t.aD, text: t.amber, barColor: t.amber }
    case 'risky':       return { border: t.rose, bg: t.rD + '88', badgeBg: t.rD + '88', text: t.rose, barColor: t.rose }
    case 'discouraged': return { border: t.rose, bg: t.rD, badgeBg: t.rD, text: t.rose, barColor: t.rose }
  }
}

export const AccountScoreCard = ({ acc, score, selected, onSelect, t }: AccountScoreCardProps) => {
  const cols = statusColors(score.status, t)
  const barPct = `${score.score}%`

  if (selected) {
    return (
      <button
        onClick={() => onSelect(acc.id)}
        style={{
          display: 'block', width: '100%', padding: '12px 14px',
          borderRadius: 14, background: cols.bg,
          border: `1.5px solid ${cols.border}`,
          cursor: 'pointer', textAlign: 'left', marginBottom: 8,
        }}
      >
        {/* Header: nom + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: acc.col, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: cols.border }}>{acc.name}</span>
          </div>
          <div style={{
            background: cols.badgeBg, color: cols.text,
            fontSize: 8, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
          }}>
            {STATUS_LABEL[score.status]}
          </div>
        </div>

        {/* Barre score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 5, background: t.el, borderRadius: 3 }}>
            <div style={{
              width: barPct, height: '100%', background: cols.barColor,
              borderRadius: 3, transition: 'width .3s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: cols.text, minWidth: 38 }}>
            {score.score}/100
          </span>
        </div>

        {/* 3 mini-cartes : Solde après / Prélèvements / Fin mois */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>Solde après</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: score.soldeApres >= 0 ? t.tx : t.rose }}>
              {score.soldeApres < 0 ? '−' : ''}{fmt(Math.abs(score.soldeApres), 0)}
            </div>
          </div>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>Prélèvements</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: score.committed > 0 ? t.amber : t.muted }}>
              {score.committed > 0 ? `−${fmt(score.committed, 0)}` : '— €'}
            </div>
          </div>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, color: t.muted, marginBottom: 2 }}>Fin mois</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: score.finDeMois >= 0 ? t.tx : t.rose }}>
              {score.finDeMois < 0 ? '−' : ''}{fmt(Math.abs(score.finDeMois), 0)}
            </div>
          </div>
        </div>
      </button>
    )
  }

  // Non-selected : compact
  return (
    <button
      onClick={() => onSelect(acc.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', borderRadius: 12,
        background: t.el, border: `1px solid ${t.bo}`,
        cursor: 'pointer', textAlign: 'left', marginBottom: 6,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, background: acc.col, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: t.sub }}>{acc.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <div style={{ flex: 1, height: 3, background: t.bo, borderRadius: 2 }}>
            <div style={{ width: barPct, height: '100%', background: cols.barColor, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 600, color: cols.text, minWidth: 30 }}>
            {score.score}/100
          </span>
        </div>
      </div>
      <div style={{
        background: cols.badgeBg, color: cols.text,
        fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
      }}>
        {STATUS_LABEL[score.status]}
      </div>
    </button>
  )
}
