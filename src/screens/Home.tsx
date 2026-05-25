import { useState } from 'react'
import { TxRow } from '../components/TxRow'
import { calcARD } from '../components/RejectionAlert'
import { IOSBanner } from '../components/IOSBanner'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, AppData, Account, Recurring } from '../types'

interface Props {
  D: AppData; t: Theme
  onAcc: () => void; onAdd: () => void; onEditBudget: () => void
  onDelete: (id: string) => void; rtConnected: boolean; profile: any
  onSearch: () => void; recurrings: Recurring[]; onManageRecurring: () => void
  onTransfer: () => void
}

const badge = (a: Account) =>
  (a.short || a.name.slice(0, 2)).toUpperCase()

const MiniBarChart = ({ col }: { col: string }) => (
  <svg width={60} height={36} viewBox="0 0 60 36" style={{ flexShrink: 0 }}>
    {[20, 28, 18, 36, 24, 30].map((h, i) => (
      <rect key={i} x={i * 10} y={36 - h} width={6} height={h} rx={3}
        fill={i === 5 ? col : col + '55'} />
    ))}
  </svg>
)

export const Home = ({ D, t, onAcc, onAdd, onEditBudget, onDelete, rtConnected, profile, onSearch, recurrings, onManageRecurring, onTransfer }: Props) => {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  // Budget du mois
  const activeBudget = D.monthBudget || D.budget * 4
  const activeSpent = D.monthSpent || 0
  const pct = activeBudget > 0 ? activeSpent / activeBudget : 0
  const spentPct = Math.round(pct * 100)
  const col = pct >= 1 ? t.rose : pct >= 0.8 ? t.amber : t.mint

  // ARD
  const ardMap = calcARD(D.accounts, recurrings || [])
  const totalCommitted = Object.values(ardMap).reduce((s, v) => s + v.committed, 0)
  const totalARD = Object.values(ardMap).reduce((s, v) => s + v.ard, 0)
  const ardStatus = totalARD < 0 ? 'danger' : totalARD < totalCommitted * 0.15 ? 'warning' : 'ok'

  // Transactions paginées (perso seulement)
  const baseTxs = D.persoTxs || D.txs
  const totalPages = Math.max(1, Math.ceil(baseTxs.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageTxs = baseTxs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Grouper par date
  const groups: { date: string; txs: typeof D.txs }[] = []
  let lastDate = ''
  pageTxs.forEach(tx => {
    const d = tx.dt === 'today' ? "Aujourd'hui" : tx.dt === 'yesterday' ? 'Hier' : tx.dt
    if (d !== lastDate) { groups.push({ date: d, txs: [] }); lastDate = d }
    groups[groups.length - 1].txs.push(tx)
  })

  // Solde perso
  const totalBal = D.persoBal != null
    ? D.persoBal
    : D.accounts.reduce((s, a) => s + a.bal, 0)

  // Heure d'actualisation
  const now = new Date()
  const hhmm = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  // Comptes perso
  const persoAccs = D.persoAccs && D.persoAccs.length > 0 ? D.persoAccs : D.accounts.filter(a => !a.isPro)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: t.bg }}>

      {/* ══ DARK NAVY HEADER ══════════════════════════════════════ */}
      <div style={{ background: '#0D1B3E', padding: '48px 20px 28px' }}>
        {/* Top row: greeting + bell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 14, ...sp('s', 400), color: 'rgba(255,255,255,0.75)' }}>
            Bonjour 👋
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Sync dot */}
            <div style={{ width: 7, height: 7, borderRadius: 4,
              background: rtConnected ? t.mint : t.amber,
              boxShadow: rtConnected ? '0 0 6px ' + t.mint : 'none' }} />
            {/* Bell icon */}
            <button onClick={onSearch}
              style={{ width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.10)', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 17 }}>
              🔔
            </button>
          </div>
        </div>
        {/* Large title */}
        <div style={{ fontSize: 24, ...sp('s', 700), color: '#FFFFFF', lineHeight: 1.25, maxWidth: 260 }}>
          Voici votre aperçu du jour.
        </div>
      </div>

      {/* ══ SCROLLABLE CONTENT ═══════════════════════════════════ */}
      <div style={{ flex: 1, paddingBottom: 32 }}>

        {/* ── Vue d'ensemble card ─────────────────────────────── */}
        <div style={{ margin: '16px 16px 0',
          background: t.card, borderRadius: 20,
          padding: '16px 18px',
          boxShadow: '0 2px 16px rgba(13,27,62,0.08)',
          border: '1px solid ' + t.bo }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, ...sp('s', 600), color: t.tx }}>Vue d'ensemble</span>
            <span style={{ fontSize: 11, ...sp('s', 400), color: t.muted }}>
              Actualisé à {hhmm} ↻
            </span>
          </div>
          {/* Balance row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, ...sp('s', 400), color: t.sub, marginBottom: 4 }}>
                Solde total
              </div>
              <div style={{ fontSize: 28, ...sp('m', 700), color: t.tx, letterSpacing: -0.5, lineHeight: 1 }}>
                {totalBal < 0 ? '−' : ''}{fmt(Math.abs(totalBal), 2)}
              </div>
              {/* Delta vs hier — static decoration for now */}
              <div style={{ fontSize: 12, ...sp('s', 500), color: t.mint, marginTop: 4 }}>
                +{fmt(D.monthIncome > 0 ? D.monthIncome * 0.01 : 0, 2)} € vs hier
              </div>
            </div>
            <MiniBarChart col={t.primary} />
          </div>
        </div>

        {/* ── Comptes section ─────────────────────────────────── */}
        <div style={{ margin: '16px 16px 0',
          background: t.card, borderRadius: 20,
          boxShadow: '0 2px 16px rgba(13,27,62,0.08)',
          border: '1px solid ' + t.bo, overflow: 'hidden' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px 10px' }}>
            <span style={{ fontSize: 14, ...sp('s', 700), color: t.tx }}>Comptes</span>
            <button onClick={onAcc}
              style={{ fontSize: 13, ...sp('s', 500), color: t.primary,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Voir tout →
            </button>
          </div>
          {/* Account rows */}
          {persoAccs.map((a, i) => (
            <div key={a.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 18px',
                borderTop: i === 0 ? '1px solid ' + t.bo : '1px solid ' + t.bo + '88' }}>
              {/* Letter badge */}
              <div style={{ width: 36, height: 36, borderRadius: 10,
                background: a.col || t.primary, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff', ...sp('s', 700) }}>
                {badge(a)}
              </div>
              {/* Name + type */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, ...sp('s', 700), color: t.tx,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 12, ...sp('s', 400), color: t.sub, marginTop: 1 }}>
                  {a.type || 'Compte courant'}
                </div>
              </div>
              {/* Balance */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, ...sp('m', 700), color: t.tx }}>
                  {a.bal < 0 ? '−' : ''}{fmt(Math.abs(a.bal), 2)}
                </div>
                <div style={{ fontSize: 11, ...sp('s', 500), color: t.mint, marginTop: 1 }}>
                  —
                </div>
              </div>
            </div>
          ))}
          {persoAccs.length === 0 && (
            <div style={{ padding: '20px 18px', fontSize: 13, color: t.muted, textAlign: 'center' }}>
              Aucun compte
            </div>
          )}
        </div>

        {/* ── Budget du mois ──────────────────────────────────── */}
        <div style={{ margin: '16px 16px 0',
          background: t.card, borderRadius: 20,
          padding: '16px 18px',
          boxShadow: '0 2px 16px rgba(13,27,62,0.08)',
          border: '1px solid ' + t.bo }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, ...sp('s', 700), color: t.tx }}>Budget du mois</span>
            <button onClick={onEditBudget}
              style={{ fontSize: 13, ...sp('s', 500), color: t.primary,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Voir le détail →
            </button>
          </div>
          {/* Dépenses label */}
          <div style={{ fontSize: 12, ...sp('s', 400), color: t.sub, marginBottom: 6 }}>
            Dépenses totales
          </div>
          {/* Amount row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 15, ...sp('m', 600), color: t.tx }}>
              {fmt(activeSpent, 2)} € / {fmt(activeBudget, 2)} €
            </span>
            <span style={{ fontSize: 14, ...sp('s', 700), color: col }}>
              {spentPct}%
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: t.el, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, transition: 'width .8s ease',
              width: Math.min(spentPct, 100) + '%',
              background: col }} />
          </div>
        </div>

        {/* ── ARD discret ─────────────────────────────────────── */}
        {totalCommitted > 0 && (
          <div style={{ padding: '10px 20px 0' }}>
            <button onClick={onManageRecurring}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 12 }}>
                {ardStatus === 'danger' ? '🔴' : ardStatus === 'warning' ? '🟡' : '🟢'}
              </span>
              <span style={{ fontSize: 11, ...sp('s', 500),
                color: ardStatus === 'danger' ? t.rose : ardStatus === 'warning' ? t.amber : t.sub }}>
                ARD {totalARD < 0 ? '−' : ''}{fmt(Math.abs(totalARD), 0)} € · {fmt(totalCommitted, 0)} engagés
              </span>
            </button>
          </div>
        )}

        {/* ── Transactions groupées par date ──────────────────── */}
        <div style={{ padding: '16px 16px 0' }}>
          {/* Section header */}
          <div style={{ fontSize: 14, ...sp('s', 700), color: t.tx, marginBottom: 8 }}>
            Transactions récentes
          </div>

          {baseTxs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>💸</div>
              <div style={{ fontSize: 14, ...sp('s', 400), color: t.muted }}>
                Aucune transaction
              </div>
            </div>
          ) : groups.map((g, gi) => (
            <div key={gi}>
              {/* Date divider */}
              <div style={{ fontSize: 11, ...sp('s', 600), color: t.muted,
                padding: '10px 2px 6px', letterSpacing: 0.3 }}>
                {g.date}
              </div>
              {/* Transactions */}
              <div style={{ background: t.card, borderRadius: 18,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
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

          {/* Pagination */}
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
                    style={{ fontSize: 12, ...sp('s', 600), color: t.sub,
                      background: 'none', border: 'none', cursor: 'pointer' }}>
                    ← Précédentes
                  </button>
                )}
                {safePage < totalPages - 1 && (
                  <button onClick={() => setPage(p => p + 1)}
                    style={{ fontSize: 12, ...sp('s', 600), color: t.primary,
                      background: 'none', border: 'none', cursor: 'pointer' }}>
                    Suivantes →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
