import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { Recurring, Transaction } from '../types'

export function useRecurring(uid: string | null) {
  const [recurrings, setRecurrings] = useState<Recurring[]>([])
  const [allHistory, setAllHistory] = useState<Transaction[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    const [r1, r2] = await Promise.all([
      db.from('next_debits').select('*').eq('user_id', uid),
      // Toutes les transactions (pas limité à 50) pour la détection auto
      db.from('transactions').select('id,merchant,amount,tx_date,account_id,category')
        .eq('user_id', uid).order('tx_date', { ascending: false }).limit(500),
    ])
    setRecurrings((r1.data || []) as Recurring[])
    setAllHistory(((r2.data || []) as any[]).map(tx => ({
      ...tx, amt: parseFloat(tx.amount), m: tx.merchant,
      acc: tx.account_id, cat: tx.category,
    })) as Transaction[])
  }, [uid])

  useEffect(() => { load() }, [load])

  const addRecurring = async (r: {
    account_id: string; name: string; amount: number | string; date_label: string
  }) => {
    // Colonnes existantes dans next_debits : user_id, account_id, name, amount, date_label
    const { error } = await db.from('next_debits').insert({
      user_id: uid,
      account_id: r.account_id,
      name: r.name,
      amount: Math.abs(parseFloat(String(r.amount))),
      date_label: r.date_label,
    })
    if (!error) await load()
    return error
  }

  const deleteRecurring = async (id: string) => {
    await db.from('next_debits').delete().eq('id', id)
    await load()
  }

  const updateRecurring = async (id: string, fields: Partial<Recurring>) => {
    await db.from('next_debits').update(fields).eq('id', id)
    await load()
  }

  return { recurrings, allHistory, reload: load, addRecurring, deleteRecurring, updateRecurring }
}
