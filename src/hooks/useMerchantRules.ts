import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import { normalizePattern, type MerchantRule } from '../lib/merchantRules'

export function useMerchantRules(uid: string | null) {
  const [rules, setRules] = useState<MerchantRule[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    const { data } = await db.from('merchant_rules').select('*').eq('user_id', uid).order('pattern')
    setRules(((data || []) as any[]).map(r => ({ id: r.id, pattern: r.pattern, category: r.category })))
  }, [uid])

  useEffect(() => { load() }, [load])

  /** Apprend (ou met à jour) une règle marchand → catégorie. */
  const learnRule = useCallback(async (merchant: string, category: string) => {
    const pattern = normalizePattern(merchant)
    if (!pattern || pattern.length < 3 || !category || category === 'Autre') return
    await db.from('merchant_rules').upsert(
      { user_id: uid, pattern, category },
      { onConflict: 'user_id,pattern' },
    )
    await load()
  }, [uid, load])

  const deleteRule = async (id: string) => {
    await db.from('merchant_rules').delete().eq('id', id)
    await load()
  }

  return { rules, reload: load, learnRule, deleteRule }
}
