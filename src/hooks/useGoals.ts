import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'

export interface SavingsGoal {
  id: string
  name: string
  icon: string
  target_amount: number
  saved_amount: number
  deadline: string | null
  account_id: string | null
}

export function useGoals(uid: string | null) {
  const [goals, setGoals] = useState<SavingsGoal[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    const { data } = await db.from('savings_goals').select('*').eq('user_id', uid).order('created_at')
    setGoals(((data || []) as any[]).map(g => ({
      id: g.id, name: g.name, icon: g.icon,
      target_amount: parseFloat(g.target_amount),
      saved_amount: parseFloat(g.saved_amount),
      deadline: g.deadline, account_id: g.account_id,
    })))
  }, [uid])

  useEffect(() => { load() }, [load])

  const addGoal = async (g: { name: string; icon: string; target_amount: number; deadline: string | null; account_id: string | null }) => {
    const { error } = await db.from('savings_goals').insert({ user_id: uid, ...g })
    if (!error) await load()
    return error
  }

  const deposit = async (id: string, amount: number) => {
    const goal = goals.find(g => g.id === id)
    if (!goal) return
    await db.from('savings_goals').update({ saved_amount: goal.saved_amount + amount }).eq('id', id)
    await load()
  }

  const deleteGoal = async (id: string) => {
    await db.from('savings_goals').delete().eq('id', id)
    await load()
  }

  return { goals, reload: load, addGoal, deposit, deleteGoal }
}
