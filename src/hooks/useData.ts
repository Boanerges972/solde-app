import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import { saveAccounts, saveTransactions, loadAccounts, loadTransactions, enqueue } from '../lib/idb'
import { applyOptimisticTx } from './useOfflineSync'
import type { AppData, Transaction, Account } from '../types'

export function useData(uid: string | null) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return }
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const wk = Math.ceil((Number(new Date()) - Number(new Date(new Date().getFullYear(), 0, 1))) / 604800000)
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      const [r1, r2, r3, r4, r5] = await Promise.all([
        db.from('accounts').select('*').eq('user_id', uid).order('type'),
        db.from('transactions').select('*').eq('user_id', uid).order('tx_date', { ascending: false }).limit(50),
        db.from('weekly_budgets').select('*').eq('user_id', uid).eq('week_number', wk).limit(1),
        db.from('next_debits').select('*').eq('user_id', uid),
        // Toutes les transactions du mois en cours pour le budget mensuel
        db.from('transactions').select('id,amount,tx_date,category,account_id')
          .eq('user_id', uid)
          .gte('tx_date', monthStart).lte('tx_date', monthEnd),
      ])
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      const accs: Account[] = ((r1.data || []) as any[]).map(a => ({
        ...a, short: a.short_name, bal: parseFloat(a.balance), col: a.color,
        res: parseFloat(a.reserved || 0), free: parseFloat(a.free || 0),
        isPro: a.type === 'Pro',
        // Découvert autorisé (stocké en localStorage, positif = montant autorisé)
        overdraft: parseFloat(localStorage.getItem('qdq-od-' + a.id) || '0'),
        debits: ((r4.data || []) as any[]).filter(d => d.account_id === a.id).map(d => ({ n: d.name, d: d.date_label, a: parseFloat(d.amount) })),
      }))
      const proAccIds = new Set(accs.filter(a => a.isPro).map(a => a.id))
      const txs: Transaction[] = ((r2.data || []) as any[]).map(tx => ({
        ...tx, acc: tx.account_id,
        dt: tx.tx_date === today ? 'today' : tx.tx_date === yest ? 'yesterday' : tx.tx_date,
        m: tx.merchant, cat: tx.category, ico: tx.icon || '💳', amt: parseFloat(tx.amount),
        isTransfer: tx.category === 'Virement interne',
        isPro: proAccIds.has(tx.account_id) && tx.category !== 'Dépense perso',
        isProPerso: tx.category === 'Dépense perso', // dépense pro marquée comme perso
      }))
      const bud = r3.data && r3.data[0] ? r3.data[0] : { budget: 400, spent: 0, user_name: 'Utilisateur', week_number: wk }
      const spent = parseFloat(bud.spent || 0)
      const budget = parseFloat(bud.budget || 400)
      const CATS = [
        { n: 'Courses', col: '#10E8C0', ico: '🛒' }, { n: 'Transport', col: '#6B7FD7', ico: '🚇' },
        { n: 'Restaurant', col: '#FF6584', ico: '🍣' }, { n: 'Santé', col: '#50C8A0', ico: '💊' },
        { n: 'Abonnement', col: '#F5A623', ico: '📱' },
      ]
      const total = txs.filter(x => x.amt < 0).reduce((s, x) => s + Math.abs(x.amt), 0) || 1
      const cats = CATS.map(c => {
        const amt = txs.filter(x => x.cat === c.n && x.amt < 0).reduce((s, x) => s + Math.abs(x.amt), 0)
        return { ...c, amt: Math.round(amt), pct: Math.round(amt / total * 100) }
      }).filter(c => c.amt > 0)
      // Budget mensuel depuis localStorage
      const monthBudget = parseFloat(localStorage.getItem('qdq-monthly-budget') || String(budget * 4))
      // Dépenses du mois (hors virements internes)
      const monthTxs = ((r5.data || []) as any[]).filter(tx => tx.category !== 'Virement interne')
      const monthSpent = monthTxs.filter((tx: any) => parseFloat(tx.amount) < 0)
        .reduce((s: number, tx: any) => s + Math.abs(parseFloat(tx.amount)), 0)
      const monthIncome = monthTxs.filter((tx: any) => parseFloat(tx.amount) > 0)
        .reduce((s: number, tx: any) => s + parseFloat(tx.amount), 0)
      // Séparation Pro / Perso
      const persoAccs = accs.filter(a => !a.isPro)
      const proAccs = accs.filter(a => a.isPro)
      const persoTxs = txs.filter(tx => !tx.isPro || tx.isProPerso)
      const proTxs = txs.filter(tx => tx.isPro)
      // Soldes
      const persoBal = persoAccs.reduce((s, a) => s + a.bal, 0)
      const proBal = proAccs.reduce((s, a) => s + a.bal, 0)
      // Dépenses pro du mois en cours
      const proMonthTxs = ((r5.data || []) as any[]).filter((tx: any) => proAccIds.has(tx.account_id) && tx.category !== 'Virement interne' && tx.category !== 'Dépense perso')
      const proMonthSpent = proMonthTxs.filter((tx: any) => parseFloat(tx.amount) < 0).reduce((s: number, tx: any) => s + Math.abs(parseFloat(tx.amount)), 0)
      const proMonthIncome = proMonthTxs.filter((tx: any) => parseFloat(tx.amount) > 0).reduce((s: number, tx: any) => s + parseFloat(tx.amount), 0)

      saveAccounts(accs)        // fire-and-forget — persist to IDB for offline use
      saveTransactions(txs)     // fire-and-forget — persist to IDB for offline use
      setData({
        user: bud.user_name || 'Utilisateur', week: wk, budget, spent, rem: budget - spent,
        accounts: accs, txs, cats, wk,
        // Séparation
        persoAccs, proAccs, persoTxs, proTxs, persoBal, proBal,
        proMonthSpent, proMonthIncome, proNet: proMonthIncome - proMonthSpent,
        // Budget mensuel
        monthBudget, monthSpent, monthIncome, monthRem: monthBudget - monthSpent,
        monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      })
      setError(null)
    } catch (e: any) {
      if (!navigator.onLine) {
        // Offline fallback: serve cached data from IndexedDB
        try {
          const cachedAccs = await loadAccounts()
          const cachedTxs = await loadTransactions()
          if (cachedAccs.length > 0) {
            const now = new Date()
            const wkFb = Math.ceil((Number(now) - Number(new Date(now.getFullYear(), 0, 1))) / 604800000)
            setData({
              user: 'Utilisateur', week: wkFb, wk: wkFb,
              budget: 400, spent: 0, rem: 400,
              accounts: cachedAccs, txs: cachedTxs, cats: [],
              persoAccs: cachedAccs.filter(a => !a.isPro),
              proAccs: cachedAccs.filter(a => a.isPro),
              persoTxs: cachedTxs.filter(tx => !tx.isPro),
              proTxs: cachedTxs.filter(tx => tx.isPro),
              persoBal: cachedAccs.filter(a => !a.isPro).reduce((s, a) => s + a.bal, 0),
              proBal: cachedAccs.filter(a => a.isPro).reduce((s, a) => s + a.bal, 0),
              proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
              monthBudget: 400, monthSpent: 0, monthIncome: 0, monthRem: 400,
              monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            })
            setError(null)
          } else {
            setError('Pas de données — reconnectez-vous une fois')
          }
        } catch {
          setError('Pas de données — reconnectez-vous une fois')
        }
      } else {
        setError(e.message || 'Erreur')
      }
    }
    setLoading(false)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    load()
    // Supabase Realtime — auto-refresh on any change
    const channel = db.channel('txdata-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: 'user_id=eq.' + uid },
        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: 'user_id=eq.' + uid },
        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_budgets', filter: 'user_id=eq.' + uid },
        () => load())
      .subscribe()
    return () => { db.removeChannel(channel) }
  }, [uid, load])

  const addTx = useCallback(async (payload: {
    merchant: string; category: string; icon?: string
    amount: number | string; account_id: string
    group_id?: string | null; paid_by?: string | null
  }) => {
    // ── Offline path ──────────────────────────────────────────
    if (!navigator.onLine) {
      const today = new Date().toISOString().slice(0, 10)
      const offlineN = Math.abs(parseFloat(String(payload.amount)))
      const pendingId = await enqueue({
        action: 'addTx',
        payload: {
          uid: uid!,
          merchant: payload.merchant,
          category: payload.category,
          icon: payload.icon,
          amount: offlineN,
          account_id: payload.account_id,
          tx_date: today,
          group_id: payload.group_id || null,
          paid_by: payload.paid_by || null,
        },
        timestamp: Date.now(),
        retries: 0,
      })
      if (pendingId === null) return { error: 'Stockage hors-ligne indisponible — réessayez en ligne.' }
      const fakeTx: Transaction = {
        id: `pending-${pendingId}`,
        merchant: payload.merchant,
        category: payload.category,
        icon: payload.icon || '💳',
        amount: -offlineN,
        tx_date: today,
        account_id: payload.account_id,
        group_id: payload.group_id || null,
        paid_by: payload.paid_by || null,
        acc: payload.account_id,
        dt: 'today',
        m: payload.merchant,
        cat: payload.category,
        ico: payload.icon || '💳',
        amt: -offlineN,
        isTransfer: false,
        isPro: false,
        isProPerso: false,
        pending: true,
      }
      setData(prev => applyOptimisticTx(prev, fakeTx))
      return null
    }
    // ── Online path (existing code below) ─────────────────────
    const n = Math.abs(parseFloat(String(payload.amount)))
    const wk = Math.ceil((Number(new Date()) - Number(new Date(new Date().getFullYear(), 0, 1))) / 604800000)
    const { error: e } = await db.from('transactions').insert({
      user_id: uid, merchant: payload.merchant, category: payload.category,
      icon: payload.icon, amount: -n, account_id: payload.account_id,
      tx_date: new Date().toISOString().slice(0, 10),
      group_id: payload.group_id || null, paid_by: payload.paid_by || null,
    })
    if (!e) {
      const newSpent = (data ? data.spent : 0) + n
      const budget = data ? data.budget : 400
      await db.from('weekly_budgets').upsert({
        user_id: uid, week_number: wk, year: new Date().getFullYear(),
        budget, spent: parseFloat(newSpent.toFixed(2)),
        user_name: data ? data.user : 'Utilisateur',
      }, { onConflict: 'user_id,week_number,year' })
      // Update account balance
      const acc = data && data.accounts ? data.accounts.find(a => a.id === payload.account_id) : null
      if (acc) {
        const newBal = parseFloat((acc.bal - n).toFixed(2))
        await db.from('accounts').update({ balance: newBal, free: newBal }).eq('id', acc.id).eq('user_id', uid)
      }
      // Browser notification if budget crossed
      const threshold = parseInt(localStorage.getItem('qdq-alert-threshold') || '80')
      const prevPct = data ? (data.spent / budget * 100) : 0
      const newPct = newSpent / budget * 100
      if (Notification.permission === 'granted') {
        if (newPct >= 100 && prevPct < 100) {
          new Notification('QDQ — Budget dépassé !', { body: 'Tu as dépensé ' + Math.round(newPct) + '% de ton budget cette semaine.', icon: '/icons/icon-192.png' })
        } else if (newPct >= threshold && prevPct < threshold) {
          new Notification('QDQ — Alerte budget', { body: Math.round(newPct) + '% du budget utilisé. Il reste ' + Math.round(budget - newSpent) + '€.', icon: '/icons/icon-192.png' })
        }
      }
      await load()
    }
    return e
  }, [uid, data, load])

  const deleteTx = useCallback(async (txId: string) => {
    const tx = data?.txs?.find(t => t.id === txId)
    await db.from('transactions').delete().eq('id', txId)
    if (tx && data?.accounts) {
      const acc = data.accounts.find(a => a.id === tx.account_id)
      if (acc) {
        // tx.amt est négatif pour les dépenses → soustraire l'inverse restaure le solde
        const newBal = parseFloat((acc.bal - tx.amt).toFixed(2))
        await db.from('accounts').update({ balance: newBal, free: newBal })
          .eq('id', acc.id).eq('user_id', uid)
      }
    }
    await load()
  }, [uid, data, load])

  // ── Virement interne ────────────────────────────────────────
  // Insère 2 transactions liées (catégorie="Virement interne")
  // et met à jour les 2 soldes. N'affecte pas le budget hebdo.
  const addTransfer = useCallback(async ({ fromId, toId, amount, note }: {
    fromId: string; toId: string; amount: number | string; note?: string
  }) => {
    const n = Math.abs(parseFloat(String(amount)))
    if (!n || !fromId || !toId || fromId === toId) return { error: 'Données invalides' }
    const today = new Date().toISOString().slice(0, 10)
    const fromAcc = data?.accounts?.find(a => a.id === fromId)
    const toAcc = data?.accounts?.find(a => a.id === toId)
    if (!fromAcc || !toAcc) return { error: 'Compte introuvable' }

    try {
      const r1 = await db.from('transactions').insert({
        user_id: uid,
        merchant: note || ('Virement vers ' + toAcc.name),
        category: 'Virement interne',
        icon: '🔄',
        amount: -n,
        account_id: fromId,
        tx_date: today,
      })
      if (r1.error) throw r1.error

      const r2 = await db.from('transactions').insert({
        user_id: uid,
        merchant: note || ('Virement depuis ' + fromAcc.name),
        category: 'Virement interne',
        icon: '🔄',
        amount: +n,
        account_id: toId,
        tx_date: today,
      })
      if (r2.error) throw r2.error

      // Mettre à jour les soldes
      const u1 = await db.from('accounts').update({
        balance: parseFloat((fromAcc.bal - n).toFixed(2)),
        free: parseFloat((fromAcc.bal - n).toFixed(2)),
      }).eq('id', fromId).eq('user_id', uid)
      if (u1.error) throw u1.error

      const u2 = await db.from('accounts').update({
        balance: parseFloat((toAcc.bal + n).toFixed(2)),
        free: parseFloat((toAcc.bal + n).toFixed(2)),
      }).eq('id', toId).eq('user_id', uid)
      if (u2.error) throw u2.error

      // PAS de mise à jour weekly_budget → ne fausse pas les stats
      await load()
      return { error: null }
    } catch (e: any) {
      return { error: e.message || 'Erreur lors du virement' }
    }
  }, [uid, data, load])

  const addDeposit = useCallback(async (payload: {
    merchant: string; category: string; icon?: string
    amount: number | string; account_id: string
  }) => {
    const n = Math.abs(parseFloat(String(payload.amount)))
    const { error: e } = await db.from('transactions').insert({
      user_id: uid, merchant: payload.merchant, category: payload.category,
      icon: payload.icon || '💰', amount: n,
      account_id: payload.account_id,
      tx_date: new Date().toISOString().slice(0, 10),
    })
    if (!e) {
      const acc = data?.accounts?.find(a => a.id === payload.account_id)
      if (acc) {
        const newBal = parseFloat((acc.bal + n).toFixed(2))
        await db.from('accounts').update({ balance: newBal, free: newBal })
          .eq('id', acc.id).eq('user_id', uid)
      }
      await load()
    }
    return e
  }, [uid, data, load])

  return { data, loading, error, reload: load, addTx, deleteTx, addTransfer, addDeposit }
}
