import { useMemo, useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import { DonutChart } from '../components/DonutChart'
import { Logo } from '../components/Logo'
import { scoreAccounts } from '../lib/scoreAccounts'
import { buildInsights } from '../lib/insights'
import { InsightsCarousel } from '../components/InsightsCarousel'
import { useBreakpoint } from '../hooks/useBreakpoint'
import type { Theme, AppData, Recurring, Account } from '../types'

interface Props {
  D: AppData; t: Theme
  onAcc: () => void; onAdd: () => void; onEditBudget: () => void
  onDelete: (id: string) => void; rtConnected: boolean; profile: any
  onSearch: () => void; recurrings: Recurring[]; onManageRecurring: () => void
  onTransfer: () => void
}

/* ── Letter badge helper ──────────────────────────────────────── */
const LetterBadge = ({ acc, size = 40 }: { acc: Account; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: Math.round(size * 0.28),
    background: acc.col, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0,
  }}>
    <span style={{
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      letterSpacing: -0.5, ...sp('s', 700),
    }}>
      {(acc.short || acc.name.slice(0, 2)).toUpperCase()}
    </span>
  </div>
)

export const Home = ({
  D, t, onAcc, onAdd, onEditBudget, onDelete, rtConnected, profile,
  onSearch, recurrings, onManageRecurring, onTransfer,
}: Props) => {
  const { isDesktop } = useBreakpoint()
  const [apercuTab, setApercuTab] = useState<'dep' | 'rev' | 'prel'>('dep')

  const insights = useMemo(() => buildInsights(D.txs || []), [D.txs])

  /* ── Derived values ─────────────────────────────────────────── */
  const totalBal = D.persoBal != null
    ? D.persoBal
    : D.accounts.reduce((s, a) => s + a.bal, 0)

  const persoAccs = D.persoAccs && D.persoAccs.length > 0
    ? D.persoAccs
    : D.accounts.filter(a => !a.isPro)

  /* Best account via scoreAccounts */
  const scores = D.accounts.length > 0
    ? scoreAccounts(D.accounts, recurrings, 100, D, [])
    : []
  const bestAcc = scores.length > 0
    ? D.accounts.find(a => a.id === scores[0].accountId)
    : D.persoAccs?.[0]

  /* Aperçu: dépenses categories */
  const cats = D.cats || []
  const depensesCats = cats.filter(c => c.amt > 0)

  /* Aperçu: prélèvements total */
  const totalPrel = recurrings.reduce((s, r) => s + parseFloat(String(r.amount || 0)), 0)

  /* Pill style helper */
  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 14px', borderRadius: 20, fontSize: 12,
    border: 'none', cursor: 'pointer', transition: 'all .18s',
    background: active ? t.primary : t.el,
    color: active ? '#fff' : t.sub,
    ...sp('s', active ? 600 : 400),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: t.bg }}>

      {/* ══ DARK NAVY HEADER ════════════════════════════════════════ */}
      <div style={{ background: '#0D1B3E', padding: '50px 20px 80px' }}>
        {/* Marque */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Logo size={26} bare fg="#fff" />
          <span style={{ fontSize: 18, ...sp('s', 700), color: '#fff', letterSpacing: -0.5 }}>QDQ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* Left: greeting + title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 6, ...sp('s', 400) }}>
              Bonjour 👋
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: '#fff',
              lineHeight: 1.2, maxWidth: 240, ...sp('s', 700),
            }}>
              Voici votre synthèse financière
            </div>
          </div>
          {/* Right: sync dot + bell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexShrink: 0 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: rtConnected ? t.mint : t.amber,
              boxShadow: rtConnected ? `0 0 8px ${t.mint}` : 'none',
            }} />
            <button
              onClick={onManageRecurring}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.10)', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 17,
              }}
            >
              🔔
            </button>
          </div>
        </div>
      </div>

      {/* ══ SCROLLABLE CONTENT (overlaps header by 40px) ═══════════ */}
      <div style={{ flex: 1, marginTop: -40, padding: '0 16px', paddingBottom: 32 }}>
      <div style={isDesktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' } : undefined}>
      <div>

        {/* ── Card: Situation globale ─────────────────────────────── */}
        <div style={{
          background: t.card, borderRadius: 20, padding: 18,
          boxShadow: '0 4px 20px rgba(13,27,62,0.12)',
          border: `1px solid ${t.bo}`, marginBottom: 16,
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 11, ...sp('s', 600), color: t.sub, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Situation globale
            </span>
            <span style={{ fontSize: 10, ...sp('s', 400), color: t.muted }}>
              Mise à jour : à l'instant ↻
            </span>
          </div>

          {/* Balance row */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, ...sp('s', 400), color: t.sub, marginBottom: 4 }}>
              Solde total
            </div>
            <div style={{ fontSize: 28, ...sp('m', 700), color: t.tx, letterSpacing: -0.5, lineHeight: 1 }}>
              {totalBal < 0 ? '−' : ''}{fmt(Math.abs(totalBal), 2)}
            </div>
            <div style={{ fontSize: 12, ...sp('s', 500), color: t.mintText, marginTop: 5 }}>
              +{fmt(D.monthIncome > 0 ? D.monthIncome * 0.01 : 0, 2)} € vs hier
            </div>
          </div>

          {/* Revenus / Dépenses metrics */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, ...sp('s', 400), color: t.sub, marginBottom: 2 }}>Revenus</div>
              <div style={{ fontSize: 16, ...sp('s', 700), color: t.mintText }}>
                {fmt(D.monthIncome || 0, 2)}
              </div>
              <div style={{ fontSize: 10, ...sp('s', 400), color: t.muted, marginTop: 2 }}>Ce mois</div>
            </div>
            <div style={{ width: 1, background: t.bo, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, ...sp('s', 400), color: t.sub, marginBottom: 2 }}>Dépenses</div>
              <div style={{ fontSize: 16, ...sp('s', 700), color: t.dangerText }}>
                {fmt(D.monthSpent || 0, 2)}
              </div>
              <div style={{ fontSize: 10, ...sp('s', 400), color: t.muted, marginTop: 2 }}>Ce mois</div>
            </div>
          </div>
        </div>

        {/* ── Card: Meilleur choix disponible ────────────────────── */}
        {bestAcc && (
          <div style={{
            background: t.mD, borderRadius: 16, padding: 14,
            border: `1.5px solid ${t.mint}`, marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, ...sp('s', 700), color: t.mintText, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              ⭐ Meilleur choix disponible
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <LetterBadge acc={bestAcc} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, ...sp('s', 700), color: t.tx,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {bestAcc.name}
                </div>
                <div style={{ fontSize: 11, ...sp('s', 400), color: t.sub, marginTop: 1 }}>
                  {bestAcc.type || 'Compte courant'}
                </div>
              </div>
              <div style={{ fontSize: 14, ...sp('m', 700), color: t.tx, flexShrink: 0 }}>
                {bestAcc.bal < 0 ? '−' : ''}{fmt(Math.abs(bestAcc.bal), 2)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, ...sp('s', 400), color: t.sub }}>
                Disponible pour votre prochaine dépense
              </span>
              <button
                onClick={onAdd}
                style={{
                  fontSize: 11, ...sp('s', 600), color: '#fff',
                  background: t.primary, border: 'none', borderRadius: 20,
                  padding: '5px 12px', cursor: 'pointer', flexShrink: 0,
                }}
              >
                Nouvelle dépense
              </button>
            </div>
          </div>
        )}

        {/* ── Insights carousel (bleed to viewport edge for scroll) ── */}
        <div style={{ margin: '0 -16px 16px' }}>
          <InsightsCarousel insights={insights} t={t} />
        </div>

        {/* ── Card: Aperçu du mois ────────────────────────────────── */}
        <div style={{
          background: t.card, borderRadius: 20, padding: 18,
          boxShadow: '0 4px 20px rgba(13,27,62,0.08)',
          border: `1px solid ${t.bo}`, marginBottom: 16,
        }}>
          {/* Header + tabs */}
          <div style={{ fontSize: 15, ...sp('s', 700), color: t.tx, marginBottom: 12 }}>
            Aperçu du mois
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            <button style={pillStyle(apercuTab === 'dep')} onClick={() => setApercuTab('dep')}>
              Dépenses
            </button>
            <button style={pillStyle(apercuTab === 'rev')} onClick={() => setApercuTab('rev')}>
              Revenus
            </button>
            <button style={pillStyle(apercuTab === 'prel')} onClick={() => setApercuTab('prel')}>
              Prélèvements
            </button>
          </div>

          {/* Tab: Dépenses */}
          {apercuTab === 'dep' && (
            <div>
              {depensesCats.length === 0 ? (
                <div style={{ fontSize: 13, ...sp('s', 400), color: t.muted, textAlign: 'center', padding: '20px 0' }}>
                  Aucune dépense enregistrée ce mois
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ flexShrink: 0 }}>
                    <DonutChart
                      segments={depensesCats.map(c => ({ label: c.n, value: c.amt, color: c.col }))}
                      size={140}
                      thickness={24}
                      centerLabel={fmt(D.monthSpent || 0, 0) + '€'}
                      centerSub="Dépenses"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {depensesCats.slice(0, 5).map((c, i) => {
                      const total = depensesCats.reduce((s, x) => s + x.amt, 0)
                      const pct = total > 0 ? Math.round((c.amt / total) * 100) : 0
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: c.col, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 11, ...sp('s', 400), color: t.sub,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.n}
                          </span>
                          <span style={{ fontSize: 10, ...sp('s', 400), color: t.muted, marginRight: 4 }}>
                            {pct}%
                          </span>
                          <span style={{ fontSize: 11, ...sp('m', 600), color: t.tx }}>
                            {fmt(c.amt, 0)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Revenus */}
          {apercuTab === 'rev' && (
            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
              {D.monthIncome === 0 ? (
                <div style={{ fontSize: 13, ...sp('s', 400), color: t.muted }}>
                  Aucun revenu enregistré ce mois
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 32, ...sp('m', 700), color: t.mintText, letterSpacing: -0.5, marginBottom: 6 }}>
                    +{fmt(D.monthIncome, 2)}
                  </div>
                  <div style={{ fontSize: 12, ...sp('s', 400), color: t.sub }}>Ce mois</div>
                </>
              )}
            </div>
          )}

          {/* Tab: Prélèvements */}
          {apercuTab === 'prel' && (
            <div>
              {recurrings.length === 0 ? (
                <div style={{ fontSize: 13, ...sp('s', 400), color: t.muted, textAlign: 'center', padding: '20px 0' }}>
                  Aucun prélèvement configuré
                </div>
              ) : (
                <>
                  {recurrings.slice(0, 5).map((r, i) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: i < Math.min(recurrings.length, 5) - 1 ? `1px solid ${t.bo}` : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, ...sp('s', 600), color: t.tx,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: 11, ...sp('s', 400), color: t.muted, marginTop: 1 }}>
                          Le {r.date_label} du mois
                        </div>
                      </div>
                      <div style={{ fontSize: 13, ...sp('m', 600), color: t.amber, flexShrink: 0 }}>
                        −{fmt(parseFloat(String(r.amount || 0)), 2)}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.bo}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, ...sp('s', 500), color: t.sub }}>
                      Total engagé
                    </span>
                    <span style={{ fontSize: 13, ...sp('m', 700), color: t.amber }}>
                      −{fmt(totalPrel, 2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>

      <div>

        {/* ── Section: Comptes ─────────────────────────────────────── */}
        <div>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 15, ...sp('s', 700), color: t.tx }}>Comptes</span>
            <button
              onClick={onAcc}
              style={{ fontSize: 12, ...sp('s', 500), color: t.primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Voir tout →
            </button>
          </div>

          {persoAccs.length === 0 ? (
            <div style={{ fontSize: 13, ...sp('s', 400), color: t.muted, textAlign: 'center', padding: '20px 0' }}>
              Aucun compte
            </div>
          ) : (
            persoAccs.map(a => (
              <button
                key={a.id}
                onClick={onAcc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  background: t.card, borderRadius: 14, padding: 14, marginBottom: 8,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  border: `1px solid ${t.bo}`, cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <LetterBadge acc={a} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, ...sp('s', 700), color: t.tx,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.name}
                  </div>
                  <div style={{ fontSize: 12, ...sp('s', 400), color: t.sub, marginTop: 2 }}>
                    {a.type || 'Compte courant'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, ...sp('m', 700), color: t.tx }}>
                    {a.bal < 0 ? '−' : ''}{fmt(Math.abs(a.bal), 2)}
                  </div>
                </div>
                <span style={{ fontSize: 18, color: t.muted, flexShrink: 0 }}>›</span>
              </button>
            ))
          )}
        </div>

      </div>
      </div>
      </div>
    </div>
  )
}
