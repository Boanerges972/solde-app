import { useState, useMemo, useEffect } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { CATS_E } from '../../lib/expenseCategories'
import { fetchTxsSince } from '../../lib/fetchTxs'
import { monthLocal } from '../../lib/dates'
import { budgetProgress, rolloverStartMonth, type CategoryBudget } from '../../lib/budgets'
import type { Theme, Transaction } from '../../types'

interface Props {
  t: Theme
  uid: string
  /** Transactions de l'écran d'accueil : suffisantes pour le mois courant. */
  txs: Transaction[]
  budgets: CategoryBudget[]
  onSave: (category: string, amount: number, rollover: boolean) => Promise<unknown>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export const BudgetsScreen = ({ t, uid, txs, budgets, onSave, onDelete, onClose }: Props) => {
  const [adding, setAdding] = useState(false)
  const [cat, setCat] = useState('')
  const [amount, setAmount] = useState('')
  const [rollover, setRollover] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Fenêtre chargée, indexée par sa clé. `complete: false` = chargement
   *  incomplet (erreur) → on ne calcule aucun report dessus. */
  const [hist, setHist] = useState<{ key: string; txs: Transaction[]; complete: boolean } | null>(null)
  /** Incrémenté par « Réessayer » : force un rechargement de la fenêtre. */
  const [reloadKey, setReloadKey] = useState(0)

  const month = monthLocal(new Date())

  // Fenêtre à charger. Les transactions de l'accueil sont limitées aux 50
  // dernières : elles ne suffisent NI au report (mois anciens lus à `spent = 0`
  // → report gonflé) NI même au mois courant (un mois de plus de 50 opérations
  // serait sous-compté). On charge donc toujours au minimum le mois courant, et
  // on remonte jusqu'au début du report s'il y en a un.
  const since = useMemo(() => {
    const starts = budgets.map(b => rolloverStartMonth(b, month)).filter(Boolean) as string[]
    const start = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : month
    return `${start}-01`
  }, [budgets, month])

  const key = `${uid}|${since}|${reloadKey}`

  useEffect(() => {
    let cancelled = false
    if (!uid) return
    // Invalide immédiatement : sans ça l'ancienne fenêtre resterait considérée
    // valide et serait recalculée avec les nouveaux budgets (voire celle de
    // l'utilisateur précédent) jusqu'à l'arrivée de la réponse.
    setHist(null)
    ;(async () => {
      const { txs: loaded, complete } = await fetchTxsSince(uid, since)
      if (!cancelled) setHist({ key, txs: loaded, complete })
    })()
    return () => { cancelled = true }
  }, [key, uid, since])

  const ready = hist !== null && hist.key === key && hist.complete
  const failed = hist !== null && hist.key === key && !hist.complete

  // Aucun montant n'est affiché tant que la fenêtre n'est pas complète. Les
  // 50 transactions de l'accueil ne sont PAS un repli financier acceptable :
  // un mois de plus de 50 opérations serait sous-compté et l'utilisateur
  // croirait voir un budget valide.
  const progress = useMemo(
    () => (ready ? budgetProgress(budgets, hist!.txs, month) : []),
    [budgets, hist, ready, month])
  const usedCats = new Set(budgets.map(b => b.category))
  const availableCats = CATS_E.filter(c => !usedCats.has(c.n) && c.n !== 'Salaire' && c.n !== 'Remboursement')

  const statusColor = (s: 'ok' | 'warn' | 'over') => (s === 'ok' ? t.mint : s === 'warn' ? t.amber : t.rose)

  const submit = async () => {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!cat || isNaN(amt) || amt <= 0) return
    setSaving(true)
    await onSave(cat, amt, rollover)
    setSaving(false)
    setAdding(false)
    setCat(''); setAmount(''); setRollover(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div role="dialog" aria-modal={true} aria-labelledby="bud-title" onClick={e => e.stopPropagation()}
        style={{ background: t.card, borderRadius: '22px 22px 0 0', padding: '0 20px 36px', animation: 'slideUp .28s ease', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.bo }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.sub, cursor: 'pointer', fontSize: 14, ...sp('o') }}>Fermer</button>
          <div id="bud-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Budgets</div>
          <button onClick={() => setAdding(a => !a)} style={{ background: 'none', border: 'none', color: t.primary, cursor: 'pointer', fontSize: 14, ...sp('o', 600) }}>
            {adding ? 'Annuler' : '+ Budget'}
          </button>
        </div>

        {adding && (
          <div style={{ background: t.el, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, ...sp('o', 600), color: t.sub, marginBottom: 8 }}>Catégorie</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {availableCats.map(c => (
                <button key={c.n} onClick={() => setCat(c.n)} aria-pressed={cat === c.n}
                  style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, ...sp('o', cat === c.n ? 600 : 400), cursor: 'pointer',
                    background: cat === c.n ? t.primary : t.card, color: cat === c.n ? '#fff' : t.sub,
                    border: '1px solid ' + (cat === c.n ? t.primary : t.bo) }}>
                  {c.ico} {c.n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, ...sp('o', 600), color: t.sub, marginBottom: 6 }}>Montant mensuel (€)</div>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="ex: 300" inputMode="decimal"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 14, ...sp('m', 600), marginBottom: 10 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, ...sp('o'), color: t.sub, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={rollover} onChange={e => setRollover(e.target.checked)} />
              Reporter le non-dépensé au mois suivant
            </label>
            <button onClick={submit} disabled={saving || !cat || !amount}
              style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: t.primary, color: '#fff', fontSize: 14, ...sp('o', 600), opacity: saving || !cat || !amount ? 0.5 : 1 }}>
              {saving ? 'Enregistrement…' : 'Enregistrer le budget'}
            </button>
          </div>
        )}

        {!ready && !failed && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: t.sub, fontSize: 13, ...sp('o') }}>
            Chargement de l'historique…
          </div>
        )}

        {failed && (
          <div role="alert" style={{ textAlign: 'center', padding: '24px 16px', color: t.sub, fontSize: 13, ...sp('o') }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            Historique incomplet — les montants ne sont pas affichés pour ne pas
            en montrer de faux.
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setReloadKey(k => k + 1)}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.el, cursor: 'pointer', ...sp('o', 600), fontSize: 13, color: t.tx }}>
                Réessayer
              </button>
            </div>
          </div>
        )}

        {ready && progress.length === 0 && !adding && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: t.sub, fontSize: 13, ...sp('o') }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
            Aucun budget par catégorie.<br />Clique « + Budget » pour commencer.
          </div>
        )}

        {progress.map(p => {
          const c = CATS_E.find(x => x.n === p.budget.category)
          const pct = Math.min(p.ratio * 100, 100)
          return (
            <div key={p.budget.id} style={{ background: t.el, borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{c?.ico || '📦'}</span>
                  <span style={{ fontSize: 13, ...sp('o', 600), color: t.tx }}>{p.budget.category}</span>
                  {p.budget.rollover && <span title="Report actif" style={{ fontSize: 10, color: t.sub }}>↻</span>}
                </div>
                <button onClick={() => onDelete(p.budget.id)} aria-label={'Supprimer le budget ' + p.budget.category}
                  style={{ background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13 }}>🗑️</button>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: t.bo, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: pct + '%', height: '100%', borderRadius: 4, background: statusColor(p.status), transition: 'width .3s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, ...sp('o') }}>
                <span style={{ color: statusColor(p.status), ...sp('m', 600) }}>{fmt(p.spent)} / {fmt(p.effective)}</span>
                <span style={{ color: t.sub }}>
                  {p.status === 'over' ? 'Dépassé de ' + fmt(p.spent - p.effective) : fmt(p.effective - p.spent) + ' restants'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
