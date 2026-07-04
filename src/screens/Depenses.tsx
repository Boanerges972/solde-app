import { useState } from 'react'
import { TxRow } from '../components/TxRow'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, AppData } from '../types'

interface Props {
  D: AppData
  t: Theme
  onDelete: (id: string) => void
  onSearch: () => void
}

export const Depenses = ({ D, t, onDelete, onSearch }: Props) => {
  const [selectedAcc, setSelectedAcc] = useState('tous')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  // === LOGIC ===
  const baseTxs = D.persoTxs || D.txs
  const filtered = selectedAcc === 'tous'
    ? baseTxs
    : baseTxs.filter(tx => (tx.acc || '__sans__') === selectedAcc)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageTxs = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const groups: { date: string; txs: typeof D.txs }[] = []
  let lastDate = ''
  pageTxs.forEach(tx => {
    const d = tx.dt === 'today' ? "Aujourd'hui" : tx.dt === 'yesterday' ? 'Hier' : tx.dt
    if (d !== lastDate) { groups.push({ date: d, txs: [] }); lastDate = d }
    groups[groups.length - 1].txs.push(tx)
  })

  // === RENDER ===
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Dark navy header */}
      <div style={{ background: '#0D1B3E', padding: '48px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Dépenses
          </div>
          <button onClick={onSearch}
            style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.12)',
              border: 'none', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🔍
          </button>
        </div>
        {/* Monthly summary pill */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          {filtered.length} transaction{filtered.length > 1 ? 's' : ''}
          {D.monthSpent > 0 && ` · −${fmt(D.monthSpent, 0)} € ce mois`}
        </div>
      </div>

      {/* Account filter pills */}
      <div style={{ background: '#0D1B3E', paddingBottom: 16 }}>
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'inline-flex', gap: 8, padding: '0 20px', flexWrap: 'nowrap', minWidth: '100%' }}>
            <button
              onClick={() => { setSelectedAcc('tous'); setPage(0) }}
              style={{ flex: '0 0 auto', padding: '7px 14px', borderRadius: 20, border: 'none',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                background: selectedAcc === 'tous' ? '#fff' : 'rgba(255,255,255,0.15)',
                color: selectedAcc === 'tous' ? '#0D1B3E' : 'rgba(255,255,255,0.8)',
                transition: 'all .2s' }}>
              Tous
            </button>
            {D.accounts.map(a => {
              const isSelected = selectedAcc === a.id
              return (
                <button key={a.id}
                  onClick={() => { setSelectedAcc(isSelected ? 'tous' : a.id); setPage(0) }}
                  style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                    background: isSelected ? '#fff' : 'rgba(255,255,255,0.15)',
                    color: isSelected ? '#0D1B3E' : 'rgba(255,255,255,0.8)',
                    transition: 'all .2s', whiteSpace: 'nowrap' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: a.col, flexShrink: 0 }} />
                  {a.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Transactions content area */}
      <div style={{ flex: 1, padding: '16px 20px 0', background: t.bg }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: .4 }}>💸</div>
            <div style={{ fontSize: 14, ...sp('o'), color: t.muted }}>Aucune transaction</div>
          </div>
        ) : groups.map((g, gi) => (
          <div key={gi}>
            <div style={{ fontSize: 11, ...sp('o', 600), color: t.muted, padding: '12px 0 6px', letterSpacing: .3 }}>
              {g.date}
            </div>
            <div style={{ background: t.card, borderRadius: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              padding: '0 14px', overflow: 'hidden', border: '1px solid ' + t.bo, marginBottom: 4 }}>
              {g.txs.map((tx, i) => (
                <div key={tx.id} style={{ borderTop: i > 0 ? '1px solid ' + t.bo + '66' : 'none' }}>
                  <TxRow tx={tx} t={t} onDelete={onDelete} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ width: i === safePage ? 18 : 6, height: 6, borderRadius: 3,
                    border: 'none', cursor: 'pointer', transition: 'all .25s',
                    background: i === safePage ? '#0A3D91' : t.el }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {safePage > 0 && (
                <button onClick={() => setPage(p => p - 1)}
                  style={{ fontSize: 12, ...sp('o', 600), color: t.sub, background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Précédentes
                </button>
              )}
              {safePage < totalPages - 1 && (
                <button onClick={() => setPage(p => p + 1)}
                  style={{ fontSize: 12, ...sp('o', 600), color: '#0A3D91', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Suivantes →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
