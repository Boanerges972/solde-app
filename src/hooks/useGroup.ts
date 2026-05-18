import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { Group, Member } from '../types'

export function useGroup(uid: string | null) {
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  const load = useCallback(async () => {
    if (!uid) return
    try {
      const { data: gm } = await db.from('group_members')
        .select('group_id,display_name,groups(id,name,invite_code)')
        .eq('user_id', uid).limit(1)
      if (!gm || !gm[0]) { setGroup(null); setMembers([]); return }
      const g = (gm[0] as any).groups
      if (!g) { setGroup(null); setMembers([]); return }
      setGroup({ ...g, myName: (gm[0] as any).display_name })
      const { data: ms } = await db.from('group_members').select('user_id,display_name').eq('group_id', g.id)
      setMembers((ms || []) as Member[])
    } catch (e) { setGroup(null) }
  }, [uid])

  useEffect(() => {
    if (!uid) return
    load()
    // Supabase Realtime — auto-refresh on any change
    const channel = db.channel('grpdata-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: 'user_id=eq.' + uid },
        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: 'user_id=eq.' + uid },
        () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_budgets', filter: 'user_id=eq.' + uid },
        () => load())
      .subscribe()
    return () => { db.removeChannel(channel) }
  }, [uid, load])

  const createGroup = useCallback(async (name: string, myName: string) => {
    const { data: g, error } = await db.from('groups').insert({ name, created_by: uid }).select().single()
    if (error) return { error }
    await db.from('group_members').insert({ group_id: (g as any).id, user_id: uid, display_name: myName })
    await load()
    return { success: true }
  }, [uid, load])

  const joinGroup = useCallback(async (code: string, myName: string) => {
    const { data, error } = await db.rpc('join_group_by_code', { p_code: code.toUpperCase(), p_name: myName })
    if (error) return { error }
    if (data && (data as any).error) return { error: { message: (data as any).error } }
    await load()
    return { success: true }
  }, [load])

  const leaveGroup = useCallback(async () => {
    if (!group) return
    await db.from('group_members').delete().eq('group_id', group.id).eq('user_id', uid)
    setGroup(null); setMembers([])
  }, [group, uid])

  return { group, members, reload: load, createGroup, joinGroup, leaveGroup }
}
