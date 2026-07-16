import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { CategoryBudget } from '../lib/budgets'

export function useBudgets(uid: string | null) {
  const [budgets, setBudgets] = useState<CategoryBudget[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    const { data } = await db.from('category_budgets').select('*').eq('user_id', uid).order('category')
    setBudgets(((data || []) as any[]).map(b => ({
      id: b.id, category: b.category, amount: parseFloat(b.amount), rollover: !!b.rollover,
      // Mois de création : le report ne peut pas commencer AVANT que le budget
      // existe, sinon un budget créé aujourd'hui hériterait de mois de report
      // fictif tirés de l'historique des transactions.
      createdMonth: (b.created_at || '').slice(0, 7) || undefined,
    })))
  }, [uid])

  useEffect(() => { load() }, [load])

  const saveBudget = async (category: string, amount: number, rollover: boolean) => {
    const { error } = await db.from('category_budgets').upsert(
      { user_id: uid, category, amount, rollover },
      { onConflict: 'user_id,category' },
    )
    if (!error) await load()
    return error
  }

  const deleteBudget = async (id: string) => {
    await db.from('category_budgets').delete().eq('id', id)
    await load()
  }

  return { budgets, reload: load, saveBudget, deleteBudget }
}
