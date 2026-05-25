import type { Theme, Account } from '../types'
import type { AccountScore, ScoreStatus } from '../lib/scoreAccounts'

function letterBadge(acc: Account, size: number) {
  const letters = (acc.short || acc.name.slice(0, 2)).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: acc.col, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>
        {letters}
      </span>
    </div>
  )
}

interface AccountScoreCardProps {
  acc: Account
  score: AccountScore
  selected: boolean
  onSelect: (accountId: string) => void
  t: Theme
}

const STATUS_LABEL: Record<ScoreStatus, string> = {
  recommended: 'Meilleur choix',
  acceptable: 'Correct',
  risky: 'Risqué',
  discouraged: 'Déconseillé',
}

function getDescription(score: AccountScore): string {
  const solde = score.soldeApres
  if (score.status === 'recommended') {
    return `Après cette dépense, il vous restera ${Math.round(solde).toLocaleString('fr-FR')} € et vos prélèvements seront couverts.`
  }
  if (score.status === 'acceptable') {
    return `Marge correcte. Fin de mois estimée : ${Math.round(score.finDeMois).toLocaleString('fr-FR')} €.`
  }
  if (score.status === 'risky') {
    return score.committed > 0 ? 'Risque : solde juste après prélèvements.' : 'Solde faible après cette dépense.'
  }
  return 'Solde insuffisant — utilisation du découvert.'
}

function statusColors(status: ScoreStatus, t: Theme) {
  switch (status) {
    case 'recommended': return { border: t.mint, bg: t.mD, badgeBg: t.mD, text: t.mint, barColor: t.mint }
    case 'acceptable':  return { border: t.amber, bg: t.aD, badgeBg: t.aD, text: t.amber, barColor: t.amber }
    case 'risky':       return { border: t.rose, bg: t.rD + '88', badgeBg: t.rD + '88', text: t.rose, barColor: t.rose }
    case 'discouraged': return { border: t.rose, bg: t.rD, badgeBg: t.rD, text: t.rose, barColor: t.rose }
    default: return { border: t.bo, bg: t.el, badgeBg: t.el, text: t.sub, barColor: t.bo }
  }
}

export const AccountScoreCard = ({ acc, score, selected, onSelect, t }: AccountScoreCardProps) => {
  const cols = statusColors(score.status, t)

  if (selected) {
    const desc = getDescription(score)
    return (
      <button
        onClick={() => onSelect(acc.id)}
        style={{
          display: 'block', width: '100%', padding: '14px 16px',
          borderRadius: 20, background: cols.bg,
          border: `1.5px solid ${cols.border}`,
          cursor: 'pointer', textAlign: 'left', marginBottom: 10,
        }}
      >
        {/* Header: nom + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {letterBadge(acc, 36)}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.tx }}>{acc.name}</div>
              <div style={{ fontSize: 12, color: t.sub, marginTop: 1 }}>{acc.type}</div>
            </div>
          </div>
          <div style={{
            background: cols.border, color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            letterSpacing: 0.3,
          }}>
            {STATUS_LABEL[score.status]}
          </div>
        </div>

        {/* Balance */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: t.tx }}>
            {score.soldeApres < 0 ? '−' : ''}{Math.abs(score.soldeApres).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
          <span style={{ fontSize: 12, color: t.sub }}>après dépense</span>
        </div>

        {/* Description */}
        <div style={{
          fontSize: 13, color: t.sub, lineHeight: 1.5,
          padding: '8px 10px', borderRadius: 10,
          background: cols.border + '12',
          marginBottom: 8,
        }}>
          {desc}
        </div>

        {/* Score bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: t.el, borderRadius: 2 }}>
            <div style={{
              width: `${score.score}%`, height: '100%', background: cols.barColor,
              borderRadius: 2, transition: 'width .3s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: cols.text, minWidth: 42, textAlign: 'right' }}>
            Score {score.score}/100
          </span>
        </div>
      </button>
    )
  }

  // Non-selected : compact
  return (
    <button
      onClick={() => onSelect(acc.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '12px 14px', borderRadius: 16,
        background: t.card, border: `1px solid ${t.bo}`,
        cursor: 'pointer', textAlign: 'left', marginBottom: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {letterBadge(acc, 32)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>{acc.name}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>
            {score.soldeApres.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
        </div>
        <div style={{ fontSize: 11, color: score.status === 'risky' || score.status === 'discouraged' ? cols.text : t.sub }}>
          {getDescription(score)}
        </div>
      </div>
    </button>
  )
}
