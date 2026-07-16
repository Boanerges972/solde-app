import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'
import { saveAccounts, saveTransactions, loadAccounts, loadTransactions, enqueue } from '../lib/idb'
import { applyOptimisticTx } from './useOfflineSync'
import { newOpId, isNetworkError, rpcAddTx, rpcDeleteTx, rpcTransfer, rpcDeleteTransfer } from '../lib/rpc'
import { friendlyError } from '../lib/errors'
import type { AppData, Transaction, Account } from '../types'

/** Notification navigateur quand une dépense fait franchir un seuil de budget. */
function notifyBudget(prevSpent: number, added: number, budget: number) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (!(budget > 0)) return
  const threshold = parseInt(localStorage.getItem('qdq-alert-threshold') || '80')
  const prevPct = (prevSpent / budget) * 100
  const newPct = ((prevSpent + added) / budget) * 100
  if (newPct >= 100 && prevPct < 100) {
    new Notification('QDQ — Budget dépassé !', {
      body: 'Tu as dépensé ' + Math.round(newPct) + '% de ton budget cette semaine.',
      icon: '/icons/icon-192.png',
    })
  } else if (newPct >= threshold && prevPct < threshold) {
    new Notification('QDQ — Alerte budget', {
      body: Math.round(newPct) + '% du budget utilisé. Il reste ' + Math.round(budget - prevSpent - added) + '€.',
      icon: '/icons/icon-192.png',
    })
  }
}

export function useData(uid: string | null) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Numéro de la dernière lecture lancée. Les chargements ne sont pas
   *  sérialisés (Realtime + reload explicite après chaque RPC) : sans ça, une
   *  réponse ancienne arrivée en retard écraserait une plus récente, dans
   *  l'état ET dans le cache IndexedDB. Toute réponse dont la génération n'est
   *  plus la courante est jetée. */
  const genRef = useRef(0)

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return }
    const gen = ++genRef.current
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

      // Une lecture plus récente a été lancée entre-temps : cette réponse est
      // périmée. On la jette AVANT d'écrire quoi que ce soit (état ou cache).
      if (gen !== genRef.current) return

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
      // Même règle qu'en succès : une réponse périmée ne doit rien écraser,
      // pas même un message d'erreur (sinon un échec ancien masquerait un
      // chargement récent réussi).
      if (gen !== genRef.current) return
      if (!navigator.onLine) {
        // Offline fallback: serve cached data from IndexedDB
        try {
          const cachedAccs = await loadAccounts()
          const cachedTxs = await loadTransactions()
          if (gen !== genRef.current) return
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
    // Ne pas éteindre le spinner si une lecture plus récente est en cours.
    if (gen === genRef.current) setLoading(false)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    load()

    // Une seule RPC touche transactions + accounts + weekly_budgets : elle
    // déclenche donc jusqu'à 3 événements Realtime. Sans coalescence, c'est 3
    // rechargements complets (5 requêtes chacun) pour un seul geste. On attend
    // une courte fenêtre pour n'en faire qu'un.
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; load() }, 150)
    }

    const channel = db.channel('txdata-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: 'user_id=eq.' + uid },
        scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: 'user_id=eq.' + uid },
        scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_budgets', filter: 'user_id=eq.' + uid },
        scheduleLoad)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      db.removeChannel(channel)
    }
  }, [uid, load])

  const addTx = useCallback(async (payload: {
    merchant: string; category: string; icon?: string
    amount: number | string; account_id: string
    group_id?: string | null; paid_by?: string | null
  }) => {
    const n = Math.abs(parseFloat(String(payload.amount)))
    const today = new Date().toISOString().slice(0, 10)
    // UN SEUL operation_id pour cette dépense, quel que soit le chemin (envoi
    // direct, mise en file hors-ligne, rejeu après échec réseau). C'est LUI qui
    // garantit qu'un même geste ne débite jamais deux fois.
    const opId = newOpId()

    /** Met la dépense en file avec le MÊME opId + affiche la tx optimiste. */
    const queueLocally = async (): Promise<boolean> => {
      const pendingId = await enqueue({
        op: {
          kind: 'add_tx', operation_id: opId, uid: uid!,
          account_id: payload.account_id, merchant: payload.merchant,
          category: payload.category, icon: payload.icon,
          amount: -n, // signé : dépense
          tx_date: today, budget: data ? data.budget : 400,
          group_id: payload.group_id || null, paid_by: payload.paid_by || null,
        },
        timestamp: Date.now(),
        retries: 0,
      })
      if (pendingId === null) return false
      const fakeTx: Transaction = {
        id: `pending-${pendingId}`,
        merchant: payload.merchant, category: payload.category,
        icon: payload.icon || '💳', amount: -n, tx_date: today,
        account_id: payload.account_id,
        group_id: payload.group_id || null, paid_by: payload.paid_by || null,
        acc: payload.account_id, dt: 'today', m: payload.merchant,
        cat: payload.category, ico: payload.icon || '💳', amt: -n,
        isTransfer: false, isPro: false, isProPerso: false, pending: true,
      }
      setData(prev => applyOptimisticTx(prev, fakeTx))
      return true
    }

    // ── Hors-ligne : file d'attente ───────────────────────────
    if (!navigator.onLine) {
      if (!(await queueLocally())) return { message: 'Stockage hors-ligne indisponible — réessaie en ligne.' }
      return null
    }

    // ── En ligne : RPC atomique (tx + solde + budget en une transaction) ──
    const budget = data ? data.budget : 400
    const { error } = await rpcAddTx({
      operationId: opId, accountId: payload.account_id,
      merchant: payload.merchant, category: payload.category, icon: payload.icon,
      amount: -n, txDate: today, budget,
      groupId: payload.group_id || null, paidBy: payload.paid_by || null,
    })

    if (error) {
      // La base a répondu (validation, droits, contrainte) : rien n'a été
      // commité, on remonte l'erreur telle quelle.
      if (!isNetworkError(error)) return { message: friendlyError(error) }
      // Réponse jamais arrivée : la RPC a PEUT-ÊTRE commité. Rejouer avec un
      // nouvel id doublerait le débit. On met en file avec LE MÊME opId : le
      // replay sera un no-op si le commit a eu lieu, sinon il passera.
      if (!(await queueLocally())) return { message: friendlyError(error) }
      return null
    }

    notifyBudget(data ? data.spent : 0, n, budget)
    await load()
    return null
  }, [uid, data, load])

  const deleteTx = useCallback(async (txId: string): Promise<{ message: string } | null> => {
    const tx = data?.txs?.find(t => t.id === txId)

    // Virement → delete_transfer (2 jambes) ; sinon delete_tx.
    const transferId = (tx as unknown as { transfer_id?: string } | undefined)?.transfer_id
    let res
    if (tx?.isTransfer && transferId) {
      res = await rpcDeleteTransfer({ operationId: newOpId(), transferId })
    } else {
      // Une tx encore en file offline (id « pending-N ») n'existe pas en base.
      const rowId = Number(txId)
      if (!Number.isInteger(rowId)) {
        return { message: 'Transaction pas encore synchronisée — réessaie une fois en ligne.' }
      }
      res = await rpcDeleteTx({ operationId: newOpId(), transactionId: rowId })
    }
    if (res.error) {
      console.error('[deleteTx] RPC échec', res.error)
      await load() // resynchronise l'UI : la tx réapparaît si non supprimée
      return { message: friendlyError(res.error) }
    }
    await load()
    return null
  }, [data, load])

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

    // Virement atomique : 2 lignes + 2 soldes dans une seule transaction.
    const opId = newOpId()
    const { error } = await rpcTransfer({
      operationId: opId, fromAccountId: fromId, toAccountId: toId,
      amount: n, txDate: today, note,
    })
    if (error) {
      if (!isNetworkError(error)) return { error: friendlyError(error) }
      // Réponse perdue : le virement a peut-être été commité. On le met en file
      // avec LE MÊME opId → le rejeu sera un no-op si c'est déjà fait.
      const queued = await enqueue({
        op: {
          kind: 'transfer', operation_id: opId, uid: uid!,
          from_account_id: fromId, to_account_id: toId,
          amount: n, tx_date: today, note,
        },
        timestamp: Date.now(),
        retries: 0,
      })
      if (queued === null) return { error: friendlyError(error) }
      return { error: null, queued: true }
    }
    await load()
    return { error: null }
  }, [uid, data, load])

  const addDeposit = useCallback(async (payload: {
    merchant: string; category: string; icon?: string
    amount: number | string; account_id: string
  }) => {
    const n = Math.abs(parseFloat(String(payload.amount)))
    const today = new Date().toISOString().slice(0, 10)

    // Entrée (amount>0) : solde géré côté base, budget non impacté.
    const opId = newOpId()
    const { error } = await rpcAddTx({
      operationId: opId, accountId: payload.account_id,
      merchant: payload.merchant, category: payload.category,
      icon: payload.icon || '💰', amount: n, txDate: today,
    })
    if (error) {
      if (!isNetworkError(error)) return { message: friendlyError(error) }
      // Réponse perdue : mise en file avec LE MÊME opId (rejeu idempotent).
      const queued = await enqueue({
        op: {
          kind: 'add_tx', operation_id: opId, uid: uid!,
          account_id: payload.account_id, merchant: payload.merchant,
          category: payload.category, icon: payload.icon || '💰',
          amount: n, // signé : entrée (positif)
          tx_date: today,
        },
        timestamp: Date.now(),
        retries: 0,
      })
      if (queued === null) return { message: friendlyError(error) }
      return null
    }
    await load()
    return null
  }, [uid, load])

  return { data, loading, error, reload: load, addTx, deleteTx, addTransfer, addDeposit }
}
