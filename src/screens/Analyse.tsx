import { useState } from 'react'
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { DonutChart } from '../components/DonutChart'
import { ProjectionChart } from '../components/ProjectionChart'
import { fmt } from '../lib/currency'
import type { Theme, AppData, Transaction, Recurring } from '../types'

interface Props {
  D: AppData
  t: Theme
  allTxs: Transaction[]
  allHistory: Transaction[]
  recurrings?: Recurring[]
}

export const Analyse = ({ D, t, allTxs, allHistory, recurrings }: Props) => {
  const [activeTab, setActiveTab] = useState<'dep' | 'rev' | 'prel'>('dep')

  // Current month calculations
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const persoTxs = D.persoTxs || D.txs

  // Daily spending data for AreaChart
  const dailySpend = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: 0 }))
  persoTxs
    .filter(tx => !tx.isTransfer && tx.amt < 0)
    .filter(tx => {
      const d = new Date(tx.tx_date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .forEach(tx => {
      const day = new Date(tx.tx_date).getDate()
      if (day >= 1 && day <= daysInMonth) dailySpend[day - 1].amount += Math.abs(tx.amt)
    })

  // Daily income data for AreaChart
  const dailyIncome = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: 0 }))
  persoTxs
    .filter(tx => !tx.isTransfer && tx.amt > 0)
    .filter(tx => {
      const d = new Date(tx.tx_date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .forEach(tx => {
      const day = new Date(tx.tx_date).getDate()
      if (day >= 1 && day <= daysInMonth) dailyIncome[day - 1].amount += tx.amt
    })

  // Average daily spend
  const totalMonthSpend = dailySpend.reduce((s, d) => s + d.amount, 0)
  const avgDaily = daysInMonth > 0 ? totalMonthSpend / daysInMonth : 0

  // Category donut
  const cats = D.cats || []
  const depCats = cats.filter(c => c.amt > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Dark navy header */}
      <div style={{ background: '#0D1B3E', padding: '48px 20px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 20, fontFamily: 'Inter, sans-serif' }}>
          Analyses
        </div>

        {/* 3 underline tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          {([['dep', 'Dépenses'], ['rev', 'Revenus'], ['prel', 'Prélèvements']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 0', fontSize: 13, fontWeight: activeTab === id ? 600 : 400,
                fontFamily: 'Inter, sans-serif',
                color: activeTab === id ? '#fff' : 'rgba(255,255,255,0.5)',
                borderBottom: activeTab === id ? '2px solid #fff' : '2px solid transparent',
                marginBottom: -1, transition: 'all .2s',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, background: t.bg, overflowY: 'auto', padding: '20px 20px 80px' }}>

        {/* Period nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: t.sub, padding: '4px 8px' }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.tx, fontFamily: 'Inter, sans-serif' }}>
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          </span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: t.sub, padding: '4px 8px' }}>›</button>
        </div>

        {/* ── DÉPENSES TAB ── */}
        {activeTab === 'dep' && (
          <>
            {/* Évolution des dépenses */}
            <div style={{ background: t.card, borderRadius: 20, padding: '18px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid ' + t.bo }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.tx, marginBottom: 4 }}>Évolution des dépenses</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0A3D91', fontFamily: 'IBM Plex Mono, monospace', marginBottom: 2 }}>
                {fmt(totalMonthSpend, 0)} €
              </div>
              <div style={{ fontSize: 11, color: t.sub, marginBottom: 16 }}>Ce mois · {monthLabel}</div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={dailySpend} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0A3D91" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0A3D91" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="amount" stroke="#0A3D91" fill="url(#spendGrad)" strokeWidth={2} dot={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#B0B8CC' }} tickLine={false} axisLine={false} interval={4} />
                  <Tooltip
                    formatter={(value: number) => [fmt(value, 0) + ' €', 'Dépenses']}
                    contentStyle={{ background: '#fff', border: '1px solid #E5E9F2', borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(label) => `Jour ${label}`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Répartition par catégorie */}
            {depCats.length > 0 && (
              <div style={{ background: t.card, borderRadius: 20, padding: '18px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid ' + t.bo }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.tx, marginBottom: 16 }}>Répartition par catégorie</div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <DonutChart
                    segments={depCats.slice(0, 6).map(c => ({ label: c.n, value: c.amt, color: c.col }))}
                    size={130} thickness={22}
                    centerLabel={fmt(D.monthSpent || 0, 0) + '€'}
                    centerSub="Dépenses"
                  />
                  <div style={{ flex: 1 }}>
                    {depCats.slice(0, 5).map(c => (
                      <div key={c.n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: c.col, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: t.sub }}>{c.n}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: t.tx }}>{c.pct}%</div>
                          <div style={{ fontSize: 10, color: t.muted }}>{fmt(c.amt, 0)} €</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Dépenses par jour */}
            <div style={{ background: t.card, borderRadius: 20, padding: '18px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid ' + t.bo }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.tx, marginBottom: 4 }}>Dépenses par jour (moyenne)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.tx, fontFamily: 'IBM Plex Mono, monospace', marginBottom: 16 }}>
                {fmt(avgDaily, 0)} €/j
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={dailySpend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                    {dailySpend.map((_, index) => (
                      <Cell key={index} fill={index === new Date().getDate() - 1 ? '#0A3D91' : '#E5E9F2'} />
                    ))}
                  </Bar>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#B0B8CC' }} tickLine={false} axisLine={false} interval={4} />
                  <Tooltip
                    formatter={(value: number) => [fmt(value, 0) + ' €', 'Dépenses']}
                    contentStyle={{ background: '#fff', border: '1px solid #E5E9F2', borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(label) => `Jour ${label}`}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ── REVENUS TAB ── */}
        {activeTab === 'rev' && (
          <>
            <div style={{ background: t.card, borderRadius: 20, padding: '18px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid ' + t.bo }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.tx, marginBottom: 4 }}>Revenus du mois</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1DBE72', fontFamily: 'IBM Plex Mono, monospace', marginBottom: 16 }}>
                {fmt(D.monthIncome || 0, 0)} €
              </div>
              {D.monthIncome > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={dailyIncome} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1DBE72" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#1DBE72" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="amount" stroke="#1DBE72" fill="url(#incomeGrad)" strokeWidth={2} dot={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#B0B8CC' }} tickLine={false} axisLine={false} interval={4} />
                    <Tooltip
                      formatter={(value: number) => [fmt(value, 0) + ' €', 'Revenus']}
                      contentStyle={{ background: '#fff', border: '1px solid #E5E9F2', borderRadius: 10, fontSize: 12 }}
                      labelFormatter={(label) => `Jour ${label}`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: t.muted, fontSize: 13 }}>
                  Aucun revenu enregistré ce mois
                </div>
              )}
            </div>
          </>
        )}

        {/* ── PRÉLÈVEMENTS TAB ── */}
        {activeTab === 'prel' && (
          <ProjectionChart t={t} accounts={D.accounts} recurrings={recurrings || []} txs={allHistory || allTxs} />
        )}
        {activeTab === 'prel' && (
          <div style={{ background: t.card, borderRadius: 20, padding: '18px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid ' + t.bo }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.tx, marginBottom: 16 }}>Prélèvements récurrents</div>
            {(recurrings || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: t.muted, fontSize: 13 }}>
                Aucun prélèvement configuré
              </div>
            ) : (
              <>
                {(recurrings || []).map(r => {
                  const acc = D.accounts.find(a => a.id === r.account_id)
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 0', borderBottom: '1px solid ' + t.bo + '66',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 16 }}>{r.icon || '📅'}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: t.tx }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: t.sub }}>
                            le {r.date_label} · {acc ? acc.name : 'Compte inconnu'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#FFA726', fontFamily: 'IBM Plex Mono, monospace' }}>
                        −{parseFloat(String(r.amount)).toFixed(2).replace('.', ',')} €
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + t.bo }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.tx }}>Total mensuel</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#FFA726', fontFamily: 'IBM Plex Mono, monospace' }}>
                    −{(recurrings || []).reduce((s, r) => s + parseFloat(String(r.amount) || '0'), 0).toFixed(2).replace('.', ',')} €
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
