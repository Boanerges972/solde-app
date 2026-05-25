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

      {/* ══ HERO — chiffre dominant ════════════════════════════ */}
      <div style={{ padding: '24px 20px 20px', textAlign: 'center' }}>
        {/* Toggle Semaine / Mois */}
        <div style={{ display: 'inline-flex', background: t.el, borderRadius: 20,
          padding: 2, marginBottom: 14, gap: 2 }}>
          {([['week', 'Semaine'], ['month', 'Mois']] as [string, string][]).map(([p, lb]) => (
            <button key={p} onClick={() => setPeriodSaved(p)}
              style={{ padding: '5px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: period === p ? t.card : 'transparent',
                ...sp('o', 600), fontSize: 12,
                color: period === p ? t.tx : t.muted, transition: 'all .2s' }}>
              {lb}
            </button>
          ))}
        </div>
        {/* Étiquette contextuelle */}
        <div style={{ fontSize: 11, ...sp('o', 600), color: t.muted, letterSpacing: 1.5,
          textTransform: 'uppercase', marginBottom: 6 }}>
          {isMonth ? 'Reste ce mois' : 'Reste cette semaine'}
        </div>
        {/* Chiffre principal */}
        <div style={{ fontSize: 48, ...sp('m', 300),
          color: rem < 0 ? t.rose : t.tx, lineHeight: 1, marginBottom: 16, letterSpacing: -1.5 }}>
          {rem < 0 ? '−' : ''}{fmt(Math.abs(rem), 0)}
        </div>
        {/* Arc de progression fin */}
        <div style={{ position: 'relative', height: 6, background: t.el + '88',
          borderRadius: 3, overflow: 'hidden', margin: '0 auto', maxWidth: 260 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
            width: Math.min(spentPct, 100) + '%',
            background: col, borderRadius: 3,
            transition: 'width .8s ease' }} />
        </div>
        {/* Dépensé / budget — discret */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, ...sp('m', 600), color: t.rose }}>{fmt(activeSpent, 0)}</span>
          <span style={{ fontSize: 11, ...sp('o'), color: t.muted }}>dépensé sur</span>
          <button onClick={onEditBudget}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, ...sp('m', 600), color: t.sub, padding: 0,
              display: 'flex', alignItems: 'center', gap: 3 }}>
            {fmt(activeBudget, 0)}
            <span style={{ fontSize: 9, color: t.muted, opacity: .7 }}>✏</span>
          </button>
        </div>
        {/* Label période (mois en cours si mode mois) */}
        {isMonth && D.monthLabel && (
          <div style={{ fontSize: 10, ...sp('o'), color: t.muted, marginTop: 4, textAlign: 'center' }}>
            {D.monthLabel}
          </div>
        )}
        {/* ARD si prélèvements configurés */}
        {totalCommitted > 0 && (
          <button onClick={onManageRecurring}
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, ...sp('o'), color: ardStatus === 'danger' ? t.rose : ardStatus === 'warning' ? t.amber : t.muted,
              display: 'flex', alignItems: 'center', gap: 5, margin: '10px auto 0' }}>
            <span style={{ fontSize: 12 }}>
              {ardStatus === 'danger' ? '🔴' : ardStatus === 'warning' ? '🟡' : '🟢'}
            </span>
            <span>ARD {totalARD < 0 ? '−' : ''}{fmt(Math.abs(totalARD), 0)}</span>
            <span style={{ opacity: .6 }}>· {fmt(totalCommitted, 0)} engagés</span>
          </button>
        )}
      </div>

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
            <div style={{ background: t.card, borderRadius: 18,
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
