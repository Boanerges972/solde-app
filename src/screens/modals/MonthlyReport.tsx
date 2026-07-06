import { useMemo } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { CATS_E } from '../../lib/expenseCategories'
import type { Theme, Transaction } from '../../types'

interface Props {
  t: Theme
  txs: Transaction[]
  onClose: () => void
}

function monthStats(txs: Transaction[], month: string) {
  const inMonth = txs.filter(tx => tx.dt.slice(0, 7) === month && tx.cat !== 'Virement interne')
  const spent = inMonth.filter(tx => tx.amt < 0)
  const totalSpent = spent.reduce((s, tx) => s + Math.abs(tx.amt), 0)
  const totalIncome = inMonth.filter(tx => tx.amt > 0).reduce((s, tx) => s + tx.amt, 0)
  const byCat: Record<string, number> = {}
  spent.forEach(tx => { byCat[tx.cat || 'Autre'] = (byCat[tx.cat || 'Autre'] || 0) + Math.abs(tx.amt) })
  const cats = Object.entries(byCat).sort(([, a], [, b]) => b - a)
  const top = [...spent].sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)).slice(0, 10)
  return { totalSpent, totalIncome, cats, top }
}

export const MonthlyReport = ({ t, txs, onClose }: Props) => {
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const prevMonth = prevDate.toISOString().slice(0, 7)
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const prevLabel = prevDate.toLocaleDateString('fr-FR', { month: 'long' })

  const cur = useMemo(() => monthStats(txs, month), [txs, month])
  const prev = useMemo(() => monthStats(txs, prevMonth), [txs, prevMonth])
  const deltaPct = prev.totalSpent > 0 ? Math.round(((cur.totalSpent - prev.totalSpent) / prev.totalSpent) * 100) : null

  return (
    <div className="qdq-report-overlay" style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .qdq-report, .qdq-report * { visibility: visible !important; }
          .qdq-report { position: absolute !important; inset: 0 !important; max-height: none !important; overflow: visible !important; border-radius: 0 !important; background: #fff !important; color: #000 !important; }
          .qdq-report-actions { display: none !important; }
          .qdq-report-overlay { position: static !important; background: none !important; backdrop-filter: none !important; }
        }
      `}</style>
      <div role="dialog" aria-modal={true} aria-labelledby="report-title" onClick={e => e.stopPropagation()}
        className="qdq-report"
        style={{ background: t.card, margin: 'auto', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: 18, padding: '24px 24px 32px' }}>

        <div className="qdq-report-actions" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.sub, cursor: 'pointer', fontSize: 14, ...sp('o') }}>Fermer</button>
          <button onClick={() => window.print()}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: t.primary, color: '#fff', fontSize: 13, ...sp('o', 600), cursor: 'pointer' }}>
            🖨️ Imprimer / PDF
          </button>
        </div>

        <div id="report-title" style={{ fontSize: 20, ...sp('s', 700), color: t.tx, marginBottom: 2 }}>
          Rapport mensuel — {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </div>
        <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginBottom: 20 }}>Généré par QDQ · {now.toLocaleDateString('fr-FR')}</div>

        {/* Synthèse */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, background: t.rD, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>Dépenses</div>
            <div style={{ fontSize: 18, ...sp('m', 700), color: t.dangerText }}>{fmt(cur.totalSpent)}</div>
            {deltaPct != null && (
              <div style={{ fontSize: 10.5, ...sp('o', 600), color: deltaPct > 0 ? t.dangerText : t.mintText }}>
                {deltaPct > 0 ? '+' : ''}{deltaPct}% vs {prevLabel}
              </div>
            )}
          </div>
          <div style={{ flex: 1, background: t.mD, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>Revenus</div>
            <div style={{ fontSize: 18, ...sp('m', 700), color: t.mintText }}>{fmt(cur.totalIncome)}</div>
          </div>
          <div style={{ flex: 1, background: t.el, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>Solde du mois</div>
            <div style={{ fontSize: 18, ...sp('m', 700), color: cur.totalIncome - cur.totalSpent >= 0 ? t.mintText : t.dangerText }}>
              {fmt(cur.totalIncome - cur.totalSpent)}
            </div>
          </div>
        </div>

        {/* Répartition par catégorie */}
        <div style={{ fontSize: 13, ...sp('s', 600), color: t.tx, marginBottom: 10 }}>Répartition par catégorie</div>
        {cur.cats.length === 0 && <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginBottom: 16 }}>Aucune dépense ce mois.</div>}
        {cur.cats.map(([cat, amt]) => {
          const c = CATS_E.find(x => x.n === cat)
          const pct = cur.totalSpent > 0 ? (amt / cur.totalSpent) * 100 : 0
          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span style={{ width: 22, fontSize: 14 }}>{c?.ico || '📦'}</span>
              <span style={{ width: 110, fontSize: 12, ...sp('o'), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
              <div style={{ flex: 1, height: 7, borderRadius: 4, background: t.bo, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: c?.col || t.primary, borderRadius: 4 }} />
              </div>
              <span style={{ width: 76, textAlign: 'right', fontSize: 11.5, ...sp('m', 600), color: t.tx }}>{fmt(amt)}</span>
            </div>
          )
        })}

        {/* Top 10 */}
        {cur.top.length > 0 && (
          <>
            <div style={{ fontSize: 13, ...sp('s', 600), color: t.tx, margin: '20px 0 10px' }}>Top {cur.top.length} des dépenses</div>
            {cur.top.map((tx, i) => (
              <div key={tx.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid ' + t.bo, fontSize: 12, ...sp('o') }}>
                <span style={{ width: 18, color: t.muted }}>{i + 1}.</span>
                <span style={{ fontSize: 14 }}>{tx.ico || '💸'}</span>
                <span style={{ flex: 1, color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.m}</span>
                <span style={{ color: t.muted, fontSize: 10.5 }}>{new Date(tx.dt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                <span style={{ width: 70, textAlign: 'right', ...sp('m', 600), color: t.dangerText }}>{fmt(Math.abs(tx.amt))}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
