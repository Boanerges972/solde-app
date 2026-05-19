import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import { buildBalanceHistory } from '../lib/buildBalanceHistory'
import { BalanceCurve } from '../components/BalanceCurve'
import type { Theme, AppData, Transaction } from '../types'

interface Props {
  D: AppData
  t: Theme
  allTxs: Transaction[]
  allHistory: Transaction[]
}

// ── DÉTECTION AUTO DES RÉCURRENTS ────────────────────────────
function detectRecurrings(txs: Transaction[], minMonths = 2) {
  // Ne garder que les dépenses (pas virements internes)
  const debits = txs.filter(tx => tx.amt < 0 && tx.cat !== 'Virement interne' && tx.m)

  // Normaliser le nom du marchand (upper, tronqué à 25 chars)
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 25)

  // Regrouper par marchand normalisé
  const map: Record<string, { name: string; key: string; txs: Transaction[]; months: Set<string>; accounts: Record<string, number> }> = {}
  debits.forEach(tx => {
    const key = norm(tx.m)
    if (!map[key]) map[key] = { name: tx.m, key, txs: [], months: new Set(), accounts: {} }
    const ym = tx.tx_date ? tx.tx_date.substring(0, 7) : ''
    if (ym) map[key].months.add(ym)
    map[key].txs.push(tx)
    // compte le plus fréquent pour ce marchand
    const aid = tx.acc || ''
    map[key].accounts[aid] = (map[key].accounts[aid] || 0) + 1
  })

  return Object.values(map)
    .filter(g => g.months.size >= minMonths)
    .map(g => {
      const months = [...g.months].sort()
      const nMonths = g.months.size
      // Montant moyen et écart-type
      const amts = g.txs.map(tx => Math.abs(tx.amt))
      const avg = amts.reduce((s, a) => s + a, 0) / amts.length
      const std = Math.sqrt(amts.map(a => (a - avg) ** 2).reduce((s, v) => s + v, 0) / amts.length)
      const isRegularAmt = std / avg < 0.15 // <15% d'écart → montant stable

      // Jour du mois le plus fréquent
      const days = g.txs.map(tx => tx.tx_date ? parseInt(tx.tx_date.split('-')[2]) : 1)
      const dayFreq: Record<number, number> = {}
      days.forEach(d => dayFreq[d] = (dayFreq[d] || 0) + 1)
      const typicalDay = parseInt(Object.entries(dayFreq).sort(([, a], [, b]) => b - a)[0][0])

      // Compte le plus souvent débité
      const topAcc = Object.entries(g.accounts).sort(([, a], [, b]) => b - a)[0][0]

      // Vérifier la consécutivité des mois (mois manquants ?)
      let consecutive = 0
      for (let i = 1; i < months.length; i++) {
        const [y1, m1] = months[i - 1].split('-').map(Number)
        const [y2, m2] = months[i].split('-').map(Number)
        const diff = (y2 - y1) * 12 + (m2 - m1)
        if (diff === 1) consecutive++
      }
      const consecutiveRate = months.length > 1 ? consecutive / (months.length - 1) : 0

      // Score de confiance
      let confidence: 'confirmed' | 'probable' | 'watching'
      if (nMonths >= 6 && consecutiveRate >= 0.8 && isRegularAmt) confidence = 'confirmed' // ✅ Confirmé
      else if (nMonths >= 6 || (nMonths >= 3 && consecutiveRate >= 0.6)) confidence = 'probable' // 🔍 Probable
      else confidence = 'watching' // 👁 En observation

      return {
        name: g.name, key: g.key, nMonths, avg, std, typicalDay,
        topAcc, consecutive, consecutiveRate, isRegularAmt, confidence,
        lastDate: months[months.length - 1], txs: g.txs,
        _interval: undefined as number | undefined,
      }
    })
    .filter(g => g.confidence !== 'watching' || g.nMonths >= 3)
    .sort((a, b) => {
      const rank: Record<string, number> = { confirmed: 0, probable: 1, watching: 2 }
      return rank[a.confidence] - rank[b.confidence] || b.nMonths - a.nMonths
    })
}

// Palette couleurs catégories
const CAT_PAL = ['#10E8C0', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF', '#FF9671', '#00B4D8', '#F4A261', '#E76F51']

// Donut multi-segments SVG (style Bankin)
const DonutCats = ({ cats, total, sz = 180, sw = 20, t }: { cats: { total: number }[]; total: number; sz?: number; sw?: number; t: Theme }) => {
  const r = (sz - sw * 2) / 2, cx = sz / 2, cy = sz / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.el} strokeWidth={sw} />
      {cats.map((c, i) => {
        const ratio = total > 0 ? c.total / total : 0
        const gap = 0.008
        const segLen = Math.max(0, (ratio - gap) * circ)
        const dashArr = segLen + ' ' + (circ - segLen)
        const dashOff = -offset * circ
        offset += ratio
        return segLen > 1 ? (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={CAT_PAL[i % CAT_PAL.length]} strokeWidth={sw}
            strokeDasharray={dashArr} strokeDashoffset={dashOff} strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray .8s ease' }} />
        ) : null
      })}
    </svg>
  )
}

export const Analyse = ({ D, t, allTxs, allHistory }: Props) => {
  const [analyseMode, setAnalyseMode] = useState('perso')
  const [view, setView] = useState('apercu')
  const [evoPeriod, setEvoPeriod] = useState<7 | 30 | 90>(30)
  const [evoAccId, setEvoAccId] = useState<string>(() => D.accounts[0]?.id ?? '')

  // ── Filtrage Pro/Perso (doit être en premier) ────────────────
  const proAccIds_a = new Set((D.proAccs || []).map(a => a.id))
  const filteredForAnalyse = (allTxs || []).filter(tx => {
    const txIsPro = proAccIds_a.has(tx.acc || tx.account_id) && tx.cat !== 'Dépense perso'
    return analyseMode === 'pro' ? txIsPro : !txIsPro
  })

  // ── Données hebdo ────────────────────────────────────────────
  const getWeekNum = (d: Date) => Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000)
  const weekMap: Record<string, { wk: number; year: number; total: number; txs: Transaction[] }> = {}
  filteredForAnalyse.filter(tx => tx.amt < 0 && !tx.group_id).forEach(tx => {
    const d = new Date(tx.tx_date || tx.dt)
    if (isNaN(d.getTime())) return
    const wk = getWeekNum(d)
    const key = d.getFullYear() + 'W' + String(wk).padStart(2, '0')
    if (!weekMap[key]) weekMap[key] = { wk, year: d.getFullYear(), total: 0, txs: [] }
    weekMap[key].total += Math.abs(tx.amt)
    weekMap[key].txs.push(tx)
  })
  const weeks = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
    .map(([, v]) => ({ ...v, label: 'S' + v.wk }))
  const maxWeekAmt = Math.max(...weeks.map(w => w.total), D.budget, 1)

  // ── Catégories ───────────────────────────────────────────────
  const catTotals: Record<string, { name: string; total: number; count: number; ico: string }> = {}
  filteredForAnalyse.filter(tx => tx.amt < 0 && !tx.group_id).forEach(tx => {
    const c = tx.cat || 'Autre'
    if (!catTotals[c]) catTotals[c] = { name: c, total: 0, count: 0, ico: tx.ico || '📦' }
    catTotals[c].total += Math.abs(tx.amt)
    catTotals[c].count++
  })
  const catList = Object.values(catTotals).sort((a, b) => b.total - a.total).slice(0, 10)
  const catTotal = catList.reduce((s, c) => s + c.total, 0)

  // ── Récurrents — via detectRecurrings (historique complet) ──
  const detected = detectRecurrings(allHistory || allTxs || [], 2)
  // Compatible avec l'ancien format d'affichage
  const recurring = detected.map(d => ({
    name: d.name, ico: '📦', cat: 'Abonnement',
    count: d.nMonths, total: d.avg * d.nMonths, amounts: d.txs.map(tx => Math.abs(tx.amt)),
    avg: d.avg, confidence: d.confidence, typicalDay: d.typicalDay,
    isRegularAmt: d.isRegularAmt, nMonths: d.nMonths,
  }))
  const monthlyAbos = recurring.reduce((s, r) => s + r.avg, 0)

  // ── Prévisions — basées sur detectRecurrings ─────────────────
  // On exclut les catégories de dépenses courantes (courses, restau...)
  const today = new Date()

  // Utiliser l'historique complet via detectRecurrings
  // Filtre : seulement les patterns mensuels (20-40 j) et non-courses
  const detectedForPrev = detectRecurrings(allHistory || allTxs || [], 2)
    .filter(d => d.confidence !== 'watching') // au moins "probable"
    .filter(d => {
      // Calculer l'intervalle médian entre occurrences
      const dates = d.txs.map(tx => tx.tx_date).filter(Boolean).sort() as string[]
      if (dates.length < 2) return false
      const diffs: number[] = []
      for (let i = 1; i < dates.length; i++) {
        const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / (86400000))
        if (diff > 0) diffs.push(diff)
      }
      if (!diffs.length) return false
      const medInterval = diffs.sort((a, b) => a - b)[Math.floor(diffs.length / 2)]
      d._interval = medInterval
      // Garder uniquement les prélèvements mensuels (15 à 45 jours)
      return medInterval >= 15 && medInterval <= 45
    })

  const previsions = detectedForPrev.map(d => {
    const dates = d.txs.map(tx => tx.tx_date).filter(Boolean).sort() as string[]
    const last = new Date(dates[dates.length - 1])
    const interval = d._interval || 30
    const nextDate = new Date(last)
    nextDate.setDate(nextDate.getDate() + interval)
    const nextStr = nextDate.toISOString().slice(0, 10)
    const daysUntil = Math.round((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return {
      name: d.name, ico: '📦', cat: 'Prélèvement',
      avg: d.avg, interval,
      lastDate: dates[dates.length - 1], nextDate: nextStr, daysUntil,
      isPast: daysUntil < 0, isSoon: daysUntil >= 0 && daysUntil <= 7,
      count: d.nMonths, confidence: d.confidence,
    }
  }).filter(r => r.daysUntil > -30).sort((a, b) => a.daysUntil - b.daysUntil)

  const upcoming = previsions.filter(r => r.daysUntil >= 0).slice(0, 15)
  const overdue = previsions.filter(r => r.daysUntil < 0)
  const monthlyForecast = previsions.reduce((s, r) => s + r.avg, 0)

  // ── Taux budget ──────────────────────────────────────────────
  const spentPct = D.budget > 0 ? Math.round(D.spent / D.budget * 100) : 0
  const rem = D.budget - D.spent

  const tabItems: [string, string][] = [
    ['apercu', 'Aperçu'], ['evolution', 'Évolution'], ['abonnements', 'Abonnements'], ['previsions', 'Prévisions']
  ]

  return (
    <div style={{ paddingBottom: 16 }}>

      {/* ── HERO CARD ─────────────────────────────────────────── */}
      <div style={{ margin: '0 16px 16px', padding: '20px', background: t.card, borderRadius: 20, border: '1px solid ' + t.bo }}>
        {/* Titre + toggle Pro/Perso */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, ...sp('s', 700), color: t.tx, lineHeight: 1 }}>Analyse</div>
            <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 3 }}>Semaine {D.week} · {new Date().getFullYear()}</div>
          </div>
          {D.proAccs && D.proAccs.length > 0 && (
            <div style={{ display: 'flex', background: t.el, borderRadius: 12, padding: 2, gap: 1 }}>
              {([['perso', '👤'], ['pro', '💼']] as [string, string][]).map(([m, ico]) => (
                <button key={m} onClick={() => setAnalyseMode(m)}
                  style={{
                    padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: analyseMode === m ? (m === 'pro' ? '#C084FC22' : t.card) : 'transparent',
                    ...sp('o', 600), fontSize: 11,
                    color: analyseMode === m ? (m === 'pro' ? '#C084FC' : t.tx) : t.sub,
                    transition: 'all .15s'
                  }}>
                  {ico}
                </button>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, ...sp('s', 700), color: spentPct >= 100 ? t.rose : spentPct >= 80 ? t.amber : t.tx, lineHeight: 1 }}>{spentPct}<span style={{ fontSize: 16, fontWeight: 400 }}>%</span></div>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 2 }}>du budget utilisé</div>
          </div>
        </div>

        {/* Barre de progression budget */}
        <div style={{ height: 8, background: t.el, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{
            width: Math.min(spentPct, 100) + '%', height: '100%', borderRadius: 4,
            background: spentPct >= 100 ? t.rose : spentPct >= 80 ? t.amber : t.mint,
            transition: 'width .8s ease'
          }} />
        </div>

        {/* 3 KPIs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Dépensé', val: fmtS(D.spent, 0), col: t.rose, bg: t.rD },
            { label: 'Restant', val: fmtS(rem, 0), col: rem < 0 ? t.rose : t.mint, bg: rem < 0 ? t.rD : t.mD },
            { label: 'Budget', val: fmtS(D.budget, 0), col: t.sub, bg: t.el },
          ].map((k, i) => (
            <div key={i} style={{ flex: 1, padding: '10px 8px', background: k.bg, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 13, ...sp('m', 600), color: k.col, lineHeight: 1.1 }}>{k.val}</div>
              <div style={{ fontSize: 10, ...sp('o'), color: t.sub, marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, padding: '0 16px', marginBottom: 16, overflowX: 'auto' }}>
        {tabItems.map(([v, lb]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: '0 0 auto', padding: '8px 16px', border: 'none', cursor: 'pointer',
            ...sp('o', 600), fontSize: 13, background: 'transparent',
            color: view === v ? t.mint : t.sub,
            borderBottom: view === v ? '2px solid ' + t.mint : '2px solid transparent',
            transition: 'all .2s', whiteSpace: 'nowrap'
          }}>{lb}</button>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* ════════ APERÇU ════════ */}
        {view === 'apercu' && (
          <div>
            {catList.length > 0 ? (
              <>
                {/* Donut + légende principale */}
                <div style={{ background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, padding: '20px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Répartition des dépenses</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Donut */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <DonutCats cats={catList} total={catTotal} sz={160} sw={18} t={t} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                        <div style={{ fontSize: 17, ...sp('m', 600), color: t.tx, lineHeight: 1 }}>{fmt(catTotal, 0)}</div>
                        <div style={{ fontSize: 10, ...sp('o'), color: t.sub, marginTop: 2 }}>total</div>
                      </div>
                    </div>
                    {/* Top 4 légende */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {catList.slice(0, 4).map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: CAT_PAL[i], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, ...sp('o', 500), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ico} {c.name}</div>
                            <div style={{ fontSize: 10, ...sp('m'), color: t.sub }}>{fmt(c.total, 0)}</div>
                          </div>
                          <div style={{ fontSize: 11, ...sp('o', 600), color: CAT_PAL[i], flexShrink: 0 }}>{Math.round(c.total / catTotal * 100)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Liste complète catégories */}
                <div style={{ background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Toutes les catégories</div>
                  {catList.map((c, i) => (
                    <div key={i} style={{ marginBottom: i < catList.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 11,
                          background: CAT_PAL[i % CAT_PAL.length] + '22',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0
                        }}>{c.ico}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>{c.name}</span>
                            <span style={{ fontSize: 14, ...sp('m', 600), color: t.tx }}>{fmt(c.total, 0)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, ...sp('o'), color: t.sub }}>{c.count} transaction{c.count > 1 ? 's' : ''}</span>
                            <span style={{ fontSize: 11, ...sp('o', 600), color: CAT_PAL[i % CAT_PAL.length] }}>{Math.round(c.total / catTotal * 100)}%</span>
                          </div>
                        </div>
                      </div>
                      {/* Barre colorée */}
                      <div style={{ height: 5, background: t.el, borderRadius: 3, overflow: 'hidden', marginLeft: 46 }}>
                        <div style={{
                          width: (c.total / catList[0].total * 100) + '%', height: '100%',
                          background: CAT_PAL[i % CAT_PAL.length], borderRadius: 3,
                          transition: 'width .7s ease'
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: '48px', textAlign: 'center', ...sp('o'), fontSize: 14, color: t.muted }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                Ajoutez des dépenses pour voir votre répartition
              </div>
            )}
          </div>
        )}

        {/* ════════ ÉVOLUTION ════════ */}
        {view === 'evolution' && (() => {
          const evoAcc = D.accounts.find(a => a.id === evoAccId) ?? D.accounts[0]
          if (!evoAcc) return (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: t.muted }}>
              Aucun compte — ajoutez un compte d'abord
            </div>
          )
          const evoPoints = buildBalanceHistory(evoAcc, allTxs, evoPeriod)
          const evoDelta = evoPoints.length >= 2 ? evoAcc.bal - evoPoints[0].bal : 0
          const deltaColor = evoDelta >= 0 ? t.mint : t.rose
          const deltaArrow = evoDelta >= 0 ? '↑' : '↓'
          const periodDays: { label: string; value: 7 | 30 | 90 }[] = [
            { label: '7j', value: 7 },
            { label: '1m', value: 30 },
            { label: '3m', value: 90 },
          ]
          return (
            <div style={{ background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, padding: '20px', marginBottom: 12 }}>
              {/* Controls row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                {/* Account dropdown */}
                <select
                  value={evoAccId}
                  onChange={e => setEvoAccId(e.target.value)}
                  style={{
                    background: t.el, border: '1px solid ' + t.bo, color: t.tx,
                    borderRadius: 10, padding: '6px 10px', fontSize: 13,
                    ...sp('o', 500), cursor: 'pointer', outline: 'none', maxWidth: 160,
                  }}
                >
                  {D.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {/* Period pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {periodDays.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setEvoPeriod(value)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: '1px solid',
                        cursor: 'pointer', fontSize: 12, ...sp('o', 600),
                        background: evoPeriod === value ? t.mD : t.el,
                        color: evoPeriod === value ? t.mint : t.sub,
                        borderColor: evoPeriod === value ? t.mint + '44' : t.bo,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI row */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 22, ...sp('m', 600), color: t.tx }}>{fmtS(evoAcc.bal)}</span>
                <span style={{ fontSize: 13, ...sp('o', 500), color: deltaColor }}>
                  {deltaArrow} {evoDelta >= 0 ? '+' : ''}{fmtS(evoDelta)} sur la période
                </span>
              </div>

              {/* Curve */}
              <BalanceCurve
                points={evoPoints}
                color={evoAcc.col || t.mint}
                t={t}
                height={160}
              />
            </div>
          )
        })()}

        {/* ════════ ABONNEMENTS ════════ */}
        {view === 'abonnements' && (
          <div>
            {/* Carte total mensuel */}
            <div style={{
              background: 'linear-gradient(135deg,#4D96FF18,#4D96FF08)', borderRadius: 20,
              border: '1px solid #4D96FF33', padding: '20px', marginBottom: 14
            }}>
              <div style={{ fontSize: 11, ...sp('s', 600), color: '#4D96FF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Charges récurrentes estimées</div>
              <div style={{ fontSize: 34, ...sp('s', 300), color: t.tx, lineHeight: 1 }}>{fmt(monthlyAbos, 2)}</div>
              <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 6 }}>
                {recurring.length} abonnement{recurring.length > 1 ? 's' : ''} détecté{recurring.length > 1 ? 's' : ''}
              </div>
              <div style={{ marginTop: 12, height: 5, background: t.bo, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: Math.min(monthlyAbos / (D.budget * 4) * 100, 100) + '%', height: '100%',
                  background: monthlyAbos > D.budget * 4 ? t.rose : '#4D96FF', borderRadius: 3
                }} />
              </div>
              <div style={{ fontSize: 10, ...sp('o'), color: t.muted, marginTop: 4 }}>
                vs budget mensuel estimé {fmt(D.budget * 4, 0)}
              </div>
            </div>

            {/* Info source */}
            <div style={{
              padding: '10px 14px', background: t.mD, borderRadius: 12,
              border: '1px solid ' + t.mint + '33', marginBottom: 14,
              display: 'flex', gap: 8, alignItems: 'center'
            }}>
              <span style={{ fontSize: 14 }}>🤖</span>
              <span style={{ fontSize: 12, ...sp('o'), color: t.mint }}>
                Analyse sur {(allHistory || []).length || allTxs.length} transactions
                · ✅ 6+ mois · 🔍 3-5 mois
              </span>
            </div>

            {recurring.length > 0 ? [
              { items: recurring.filter(r => r.confidence === 'confirmed'), label: 'Confirmés (6+ mois)', ico: '✅' },
              { items: recurring.filter(r => r.confidence === 'probable'), label: 'Probables (3-5 mois)', ico: '🔍' },
              { items: recurring.filter(r => r.confidence === 'watching'), label: 'En observation', ico: '👁' },
            ].filter(g => g.items.length > 0).map((group, gi) => (
              <div key={gi} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 10, ...sp('s', 700), color: t.sub, letterSpacing: 1,
                  textTransform: 'uppercase', marginBottom: 8
                }}>
                  {group.ico} {group.label}
                </div>
                {group.items.map((r, i) => {
                  const col = CAT_PAL[(gi * 4 + i) % CAT_PAL.length]
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 14px', background: t.card, borderRadius: 16,
                      marginBottom: 8, border: '1px solid ' + (r.confidence === 'confirmed' ? t.mint + '33' : t.bo)
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 13, background: col + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 19, flexShrink: 0
                      }}>📦</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, ...sp('o', 600), color: t.tx,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>{r.name}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, ...sp('o'), color: t.sub }}>
                            {r.nMonths} mois · ~le {r.typicalDay}
                          </span>
                          {!r.isRegularAmt && (
                            <span style={{
                              fontSize: 9, ...sp('o', 600), color: t.amber,
                              background: t.aD, padding: '1px 5px', borderRadius: 4
                            }}>
                              variable
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, ...sp('m', 600), color: t.tx }}>~{fmt(r.avg, 2)}</div>
                        <div style={{ fontSize: 10, ...sp('o'), color: t.sub, marginTop: 2 }}>/mois</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
              : (
                <div style={{ padding: '48px', textAlign: 'center', ...sp('o'), fontSize: 14, color: t.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
                  Pas encore assez de données (min. 2 mois)
                </div>
              )}
          </div>
        )}

        {/* ════════ PRÉVISIONS ════════ */}
        {view === 'previsions' && (
          <div>
            {/* Prévision mensuelle */}
            <div style={{
              background: 'linear-gradient(135deg,' + t.mint + '18,' + t.mint + '06)', borderRadius: 20,
              border: '1px solid ' + t.mint + '33', padding: '20px', marginBottom: 14
            }}>
              <div style={{ fontSize: 11, ...sp('s', 600), color: t.mint, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Prévision mois en cours</div>
              <div style={{ fontSize: 34, ...sp('s', 300), color: t.tx, lineHeight: 1 }}>{fmt(monthlyForecast, 0)}</div>
              <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 6 }}>
                {previsions.filter(r => r.interval <= 35).length} prélèvements attendus ce mois
              </div>
              <div style={{ marginTop: 12, height: 5, background: t.bo, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: Math.min(monthlyForecast / (D.budget * 4) * 100, 100) + '%', height: '100%',
                  background: monthlyForecast > D.budget * 4 ? t.rose : t.mint, borderRadius: 3
                }} />
              </div>
              <div style={{ fontSize: 10, ...sp('o'), color: t.muted, marginTop: 4 }}>
                vs budget mensuel {fmt(D.budget * 4, 0)}
              </div>
            </div>

            {/* Dépassés */}
            {overdue.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, ...sp('s', 700), letterSpacing: 1.5, color: t.rose, textTransform: 'uppercase', marginBottom: 10 }}>
                  ⚠ Attendus / récents
                </div>
                {overdue.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    background: t.rD, borderRadius: 16, marginBottom: 8, border: '1px solid ' + t.rose + '33'
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 13, background: t.rose + '22',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0
                    }}>{r.ico}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, ...sp('o', 600), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 2 }}>
                        Dernier : {r.lastDate.split('-').reverse().join('/')} · tous les {r.interval}j
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, ...sp('m', 600), color: t.rose }}>{fmt(r.avg, 0)}</div>
                      <div style={{ fontSize: 10, ...sp('o'), color: t.rose, marginTop: 2 }}>{Math.abs(r.daysUntil)}j passés</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* À venir — timeline */}
            {upcoming.length > 0 && (
              <>
                <div style={{ fontSize: 11, ...sp('s', 700), letterSpacing: 1.5, color: t.sub, textTransform: 'uppercase', marginBottom: 12 }}>
                  À venir
                </div>
                {upcoming.map((r, i) => {
                  const isToday = r.daysUntil === 0
                  const isSoon = r.daysUntil <= 3
                  const col = isToday ? t.rose : isSoon ? t.amber : t.mint
                  const [, m, d] = r.nextDate.split('-')
                  const mLabel = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][parseInt(m) - 1]
                  const label = isToday ? "Aujourd'hui" : r.daysUntil === 1 ? 'Demain' : 'Dans ' + r.daysUntil + ' j'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      {/* Colonne date */}
                      <div style={{ width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, background: col + '22',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid ' + col + '55'
                        }}>
                          <div style={{ fontSize: 15, ...sp('m', 700), color: col, lineHeight: 1 }}>{d}</div>
                          <div style={{ fontSize: 8, ...sp('o'), color: col, opacity: .9 }}>{mLabel}</div>
                        </div>
                        {i < upcoming.length - 1 && <div style={{ width: 1, flex: 1, background: t.bo, marginTop: 4 }} />}
                      </div>
                      {/* Carte */}
                      <div style={{
                        flex: 1, padding: '12px 14px', background: t.card, borderRadius: 14,
                        border: '1px solid ' + (isSoon ? col + '44' : t.bo), marginBottom: 0
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 17 }}>{r.ico}</span>
                          <span style={{
                            fontSize: 14, ...sp('o', 500), color: t.tx, flex: 1, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>{r.name}</span>
                          <span style={{ fontSize: 15, ...sp('m', 600), color: t.tx, flexShrink: 0 }}>{fmt(r.avg, 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, ...sp('o', 600), color: col }}>{label}</span>
                          <span style={{ fontSize: 10, ...sp('o'), color: t.muted }}>tous les {r.interval}j</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            {previsions.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', ...sp('o'), fontSize: 14, color: t.muted }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔮</div>
                Importez vos relevés pour détecter les récurrences
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
