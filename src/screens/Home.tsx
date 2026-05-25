import { useState } from 'react'
import { TxRow } from '../components/TxRow'
import { RejectionAlert, calcARD } from '../components/RejectionAlert'
import { IOSBanner } from '../components/IOSBanner'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, AppData, Recurring } from '../types'

interface Props {
  D: AppData; t: Theme
  onAcc: () => void; onAdd: () => void; onEditBudget: () => void
  onDelete: (id: string) => void; rtConnected: boolean; profile: any
  onSearch: () => void; recurrings: Recurring[]; onManageRecurring: () => void
  onTransfer: () => void
}

export const Home = ({ D, t, onAcc, onAdd, onEditBudget, onDelete, rtConnected, profile, onSearch, recurrings, onManageRecurring, onTransfer }: Props) => {
  const [selectedAcc, setSelectedAcc] = useState('tous')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  const [period, setPeriod] = useState(() => localStorage.getItem('qdq-period') || 'week')
  const setPeriodSaved = (p: string) => { setPeriod(p); localStorage.setItem('qdq-period', p) }

  // Données selon la période sélectionnée
  const isMonth = period === 'month'
  const activeBudget = isMonth ? (D.monthBudget || D.budget * 4) : D.budget
  const activeSpent = isMonth ? (D.monthSpent || 0) : D.spent
  const activeRem = activeBudget - activeSpent
  const pct = activeBudget > 0 ? activeSpent / activeBudget : 0
  const spentPct = Math.round(pct * 100)
  const rem = activeRem
  const col = pct >= 1 ? t.rose : pct >= 0.8 ? t.amber : t.mint

  const ardMap = calcARD(D.accounts, recurrings || [])
  const totalCommitted = Object.values(ardMap).reduce((s, v) => s + v.committed, 0)
  const totalARD = Object.values(ardMap).reduce((s, v) => s + v.ard, 0)
  const ardStatus = totalARD < 0 ? 'danger' : totalARD < totalCommitted * 0.15 ? 'warning' : 'ok'

  // Transactions filtrées + paginées
  const accMap: Record<string, typeof D.accounts[0]> = {}
  D.accounts.forEach(a => { accMap[a.id] = a })
  // Par défaut : afficher seulement les transactions perso (hors comptes Pro)
  const baseTxs = D.persoTxs || D.txs
  const filtered = selectedAcc === 'tous'
    ? baseTxs : baseTxs.filter(tx => (tx.acc || '__sans__') === selectedAcc)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageTxs = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Grouper par date
  const groups: { date: string; txs: typeof D.txs }[] = []
  let lastDate = ''
  pageTxs.forEach(tx => {
    const d = tx.dt === 'today' ? "Aujourd'hui" : tx.dt === 'yesterday' ? 'Hier' : tx.dt
    if (d !== lastDate) { groups.push({ date: d, txs: [] }); lastDate = d }
    groups[groups.length - 1].txs.push(tx)
  })

  // Onglets comptes
  const accIds = [...new Set(D.txs.map(tx => tx.acc || '__sans__'))]
  const tabs = [
    { id: 'tous', label: 'Tous', col: t.mint },
    ...accIds.map(aid => { const a = accMap[aid]; return { id: aid, label: a ? a.name : 'Autre', col: a ? a.col : t.muted } }),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 20 }}>

      {/* ══ HEADER ════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px 0', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 17, background: t.el,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {profile?.avatar || '😊'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, ...sp('s', 600), color: t.tx }}>
            {profile?.name ? profile.name.split(' ')[0] : 'Bonjour'}
          </div>
          <div style={{ fontSize: 10, ...sp('o'), color: t.muted }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Alerte ARD discrète */}
          {totalCommitted > 0 && ardStatus !== 'ok' && (
            <button onClick={onManageRecurring}
              style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer',
                lineHeight: 1, animation: 'pulse 2s ease infinite' }}>
              {ardStatus === 'danger' ? '🔴' : '🟡'}
            </button>
          )}
          {/* Sync dot */}
          <div style={{ width: 7, height: 7, borderRadius: 4,
            background: rtConnected ? t.mint : t.amber,
            boxShadow: rtConnected ? '0 0 6px ' + t.mint : 'none' }} />
          {/* Recherche */}
          <button onClick={onSearch}
            style={{ width: 34, height: 34, borderRadius: 17, background: t.el,
              border: 'none', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            🔍
          </button>
        </div>
      </div>

      {/* ══ SITUATION GLOBALE ══════════════════════════════════════ */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ background: t.primary, borderRadius: 24, padding: '20px 20px 18px',
          boxShadow: '0 4px 20px rgba(10,61,145,0.25)' }}>
          {/* Solde total */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              Solde total
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: -1, lineHeight: 1 }}>
              {D.persoBal != null ? (D.persoBal < 0 ? '−' : '') + fmt(Math.abs(D.persoBal), 2) : fmt(D.accounts.reduce((s, a) => s + a.bal, 0), 2)}
            </div>
            {D.proBal !== 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                Pro : {fmt(D.proBal, 0)} €
              </div>
            )}
          </div>
          {/* 3 métriques */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>Revenus</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {D.monthIncome > 0 ? fmt(D.monthIncome, 0) : '—'} €
              </div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>Dépenses</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {fmt(D.monthSpent || 0, 0)} €
              </div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>Budget</div>
              <div style={{ fontSize: 15, fontWeight: 700,
                color: pct >= 1 ? '#FF6B6B' : pct >= 0.8 ? '#FFD93D' : '#6BFF9E' }}>
                {spentPct}%
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: 14, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
            <div style={{ height: '100%', borderRadius: 2, transition: 'width .8s ease',
              width: Math.min(spentPct, 100) + '%',
              background: pct >= 1 ? '#FF6B6B' : pct >= 0.8 ? '#FFD93D' : '#6BFF9E' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              {fmt(D.monthSpent || 0, 0)} dépensé
            </span>
            <button onClick={onEditBudget}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              Budget {fmt(D.monthBudget || D.budget * 4, 0)} ✏
            </button>
          </div>
        </div>
      </div>

      {/* ══ MEILLEUR COMPTE ════════════════════════════════════════ */}
      {D.accounts.length > 0 && (() => {
        // Show the account with highest balance as current recommendation
        const bestAcc = [...D.accounts]
          .filter(a => !D.persoAccs || D.persoAccs.some(p => p.id === a.id))
          .sort((a, b) => b.bal - a.bal)[0]
        if (!bestAcc || bestAcc.bal <= 0) return null
        return (
          <div style={{ margin: '12px 20px 0' }}>
            <div style={{ background: t.mD, border: '1.5px solid ' + t.mint,
              borderRadius: 18, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12,
                background: bestAcc.col + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0 }}>🏦</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.mint,
                  letterSpacing: 0.5, marginBottom: 2 }}>MEILLEUR COMPTE DISPONIBLE</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.tx, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{bestAcc.name}</div>
                <div style={{ fontSize: 12, color: t.sub }}>{fmt(bestAcc.bal, 2)} € disponibles</div>
              </div>
              <button onClick={onAdd}
                style={{ background: t.mint, border: 'none', borderRadius: 12, cursor: 'pointer',
                  padding: '6px 12px', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                + Dépense
              </button>
            </div>
          </div>
        )
      })()}

      {/* ══ COMPTES — pills slim ═══════════════════════════════ */}
      <div style={{ overflowX: 'scroll', scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
        <div style={{ display: 'inline-flex', gap: 8, padding: '0 20px',
          flexWrap: 'nowrap', minWidth: '100%' }}>
          {D.accounts.map(a => {
            const v = ardMap[a.id]
            const isSelected = selectedAcc === a.id
            return (
              <button key={a.id}
                onClick={() => { setSelectedAcc(isSelected ? 'tous' : a.id); setPage(0) }}
                style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center',
                  gap: 8, padding: '9px 14px', borderRadius: 50,
                  background: isSelected ? a.col : t.card,
                  border: '1px solid ' + (isSelected ? a.col : t.bo),
                  cursor: 'pointer', transition: 'all .2s' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4,
                  background: isSelected ? 'rgba(255,255,255,.7)' : a.col, flexShrink: 0 }} />
                <span style={{ fontSize: 12, ...sp('o', 600),
                  color: isSelected ? '#fff' : t.tx, whiteSpace: 'nowrap' }}>
                  {a.name}
                </span>
                <span style={{ fontSize: 12, ...sp('m', 600),
                  color: isSelected ? 'rgba(255,255,255,.85)' :
                    a.bal < 0 && a.bal > -(a.overdraft || 0) ? t.amber : // dans le découvert autorisé
                    a.bal < -(a.overdraft || 0) ? t.rose : t.sub }}>
                  {a.bal < 0 ? '−' : ''}{fmt(Math.abs(a.bal), 0)}
                </span>
                {/* Indicateur découvert autorisé */}
                {!isSelected && a.overdraft > 0 && a.bal < 0 && (
                  <span style={{ fontSize: 9, ...sp('o', 600), color: t.amber,
                    background: t.aD, padding: '1px 5px', borderRadius: 6,
                    whiteSpace: 'nowrap' }}>
                    {a.bal < -a.overdraft ? '⛔' : '⚠'}
                  </span>
                )}
              </button>
            )
          })}
          <div style={{ flex: '0 0 4px' }} />
        </div>
      </div>

      {/* ══ CARTE PRO ════════════════════════════════════════════ */}
      {D.proAccs && D.proAccs.length > 0 && (
        <div style={{ margin: '8px 20px 0', padding: '12px 14px', borderRadius: 16,
          background: '#C084FC10', border: '1px solid #C084FC33',
          display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>💼</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, ...sp('s', 600), color: '#C084FC', letterSpacing: .5, marginBottom: 2 }}>
              {D.proAccs.map(a => a.name).join(' · ')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, ...sp('o'), color: t.muted }}>
                Solde&nbsp;
                <span style={{ ...sp('m', 600), color: D.proBal < 0 ? t.rose : t.tx }}>
                  {D.proBal < 0 ? '−' : ''}{fmt(Math.abs(D.proBal), 0)}
                </span>
              </span>
              {D.proMonthSpent > 0 && (
                <span style={{ fontSize: 11, ...sp('o'), color: t.muted }}>
                  Ce mois&nbsp;
                  <span style={{ ...sp('m', 600), color: t.rose }}>−{fmt(D.proMonthSpent, 0)}</span>
                  {D.proMonthIncome > 0 && <span style={{ color: t.mint }}> / +{fmt(D.proMonthIncome, 0)}</span>}
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, ...sp('o', 600), color: '#C084FC', background: '#C084FC18',
            padding: '4px 8px', borderRadius: 8, flexShrink: 0 }}>PRO</div>
        </div>
      )}

      {/* ══ ACTIONS — icônes rondes style Revolut ══════════════ */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '20px 20px 4px' }}>
        {([
          { ico: '＋', label: 'Dépense', action: onAdd, col: t.primary },
          D.accounts.length >= 2 && { ico: '⇄', label: 'Virement', action: onTransfer, col: '#4D96FF' },
        ] as any[]).filter(Boolean).map((btn: any, i: number) => (
          <button key={i} onClick={btn.action}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ width: 52, height: 52, borderRadius: 26,
              background: btn.col + '22', border: '1.5px solid ' + btn.col + '44',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: btn.col, fontWeight: 300 }}>
              {btn.ico}
            </div>
            <span style={{ fontSize: 11, ...sp('o', 500), color: t.sub }}>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* ══ ARD PRÉLÈVEMENTS ═══════════════════════════════════ */}
      {totalCommitted > 0 && (
        <div style={{ padding: '0 20px' }}>
          <button onClick={onManageRecurring}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none',
              border: 'none', cursor: 'pointer', padding: 0, marginTop: 10 }}>
            <span style={{ fontSize: 13 }}>
              {ardStatus === 'danger' ? '🔴' : ardStatus === 'warning' ? '🟡' : '🟢'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500,
              color: ardStatus === 'danger' ? t.rose : ardStatus === 'warning' ? t.amber : t.sub }}>
              ARD {totalARD < 0 ? '−' : ''}{fmt(Math.abs(totalARD), 0)} €
            </span>
            <span style={{ fontSize: 11, color: t.muted }}>· {fmt(totalCommitted, 0)} engagés</span>
          </button>
        </div>
      )}

      {/* ══ TRANSACTIONS ═══════════════════════════════════════ */}
      <div style={{ flex: 1, padding: '12px 20px 0' }}>

        {/* Onglets comptes (seulement si >1 compte avec txs) */}
        {tabs.length > 2 && (
          <div style={{ overflowX: 'scroll', scrollbarWidth: 'none',
            marginBottom: 12, marginLeft: -20, paddingLeft: 20 }}>
            <div style={{ display: 'inline-flex', gap: 6, paddingRight: 20 }}>
              {tabs.map(tab => {
                const active = selectedAcc === tab.id
                return (
                  <button key={tab.id} onClick={() => { setSelectedAcc(tab.id); setPage(0) }}
                    style={{ flex: '0 0 auto', padding: '5px 12px', borderRadius: 14,
                      border: 'none', cursor: 'pointer', transition: 'all .15s',
                      background: active ? tab.col : t.el }}>
                    <span style={{ fontSize: 11, ...sp('o', active ? 700 : 500),
                      color: active ? (tab.id === 'tous' ? t.bg : '#fff') : t.sub, whiteSpace: 'nowrap' }}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Liste groupée par date */}
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: .4 }}>💸</div>
            <div style={{ fontSize: 14, ...sp('o'), color: t.muted }}>
              Aucune transaction
            </div>
          </div>
        ) : groups.map((g, gi) => (
          <div key={gi}>
            {/* Séparateur de date */}
            <div style={{ fontSize: 11, ...sp('o', 600), color: t.muted,
              padding: '12px 0 6px', letterSpacing: .3 }}>
              {g.date}
            </div>
            {/* Transactions du groupe */}
            <div style={{ background: t.card, borderRadius: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              padding: '0 14px', overflow: 'hidden',
              border: '1px solid ' + t.bo }}>
              {g.txs.map((tx, i) => (
                <div key={tx.id} style={{ borderTop: i > 0 ? '1px solid ' + t.bo + '66' : 'none' }}>
                  <TxRow tx={tx} t={t} onDelete={onDelete} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Voir plus */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            padding: '16px 0' }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ width: i === safePage ? 18 : 6, height: 6, borderRadius: 3,
                    border: 'none', cursor: 'pointer', transition: 'all .25s',
                    background: i === safePage ? t.mint : t.el }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {safePage > 0 && (
                <button onClick={() => setPage(p => p - 1)}
                  style={{ fontSize: 12, ...sp('o', 600), color: t.sub,
                    background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← Précédentes
                </button>
              )}
              {safePage < totalPages - 1 && (
                <button onClick={() => setPage(p => p + 1)}
                  style={{ fontSize: 12, ...sp('o', 600), color: t.primary,
                    background: 'none', border: 'none', cursor: 'pointer' }}>
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
