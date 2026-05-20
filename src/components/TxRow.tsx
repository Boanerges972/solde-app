import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, Transaction } from '../types'

interface Props {
  tx: Transaction
  t: Theme
  onDelete: (id: string) => void
}

export const TxRow = ({ tx, t, onDelete }: Props) => {
  const [expanded, setExpanded] = useState(false)
  const isIncome = tx.amt >= 0
  const isTransfer = tx.isTransfer
  const amtCol = isTransfer ? t.sub : isIncome ? t.mint : t.tx
  return (
    <div style={{ overflow: 'hidden' }}>
      <div onClick={() => setExpanded(s => !s)}
        style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 0', cursor: 'pointer',
          opacity: tx.pending ? 0.6 : 1,
          borderBottom: expanded ? 'none' : '1px solid ' + t.bo + '66' }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0,
          background: isTransfer ? t.el : isIncome ? t.mD : t.el,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
          {tx.ico || '💳'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {tx.pending ? '⏳ ' : ''}{tx.m}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
            {tx.isPro && !isTransfer && (
              <span style={{ fontSize: 8, ...sp('o', 700), color: '#C084FC',
                background: '#C084FC18', padding: '1px 5px', borderRadius: 4, letterSpacing: .3,
                flexShrink: 0 }}>PRO</span>
            )}
            {tx.isProPerso && (
              <span style={{ fontSize: 8, ...sp('o', 700), color: t.amber,
                background: t.aD, padding: '1px 5px', borderRadius: 4, letterSpacing: .3,
                flexShrink: 0 }}>PRO·PERSO</span>
            )}
            <span style={{ fontSize: 11, ...sp('o'), color: t.muted, lineHeight: 1 }}>
              {isTransfer ? 'Virement interne' : tx.cat}
              {tx.dt !== 'today' && tx.dt !== 'yesterday' &&
                <span style={{ color: t.el + '99' }}>{' · '}{tx.dt}</span>}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 15, ...sp('m', 600), color: amtCol, flexShrink: 0, lineHeight: 1 }}>
          {isIncome ? '+' : '−'}{fmt(Math.abs(tx.amt))}
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 0 10px',
          borderBottom: '1px solid ' + t.bo + '66' }}>
          <button onClick={async () => { setExpanded(false); await onDelete(tx.id) }}
            style={{ flex: 1, padding: '8px', borderRadius: 10, background: t.rD,
              border: 'none', cursor: 'pointer', ...sp('o', 600), fontSize: 12, color: t.rose }}>
            Supprimer
          </button>
          <button onClick={() => setExpanded(false)}
            style={{ flex: 1, padding: '8px', borderRadius: 10, background: t.el,
              border: 'none', cursor: 'pointer', ...sp('o', 600), fontSize: 12, color: t.sub }}>
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
