import { db } from './supabase'

/** Clé publique VAPID (la clé privée vit dans les secrets de l'Edge Function). */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BP0mmGv2lr0Azb4LXLMDEQsYkSuuH7TB4QvbcZg5zC97V-y14N-lvrtb_QtQ7pbVH_AkHk3kqCzZx1W8CYObI-o'

export interface PushPrefs {
  recurring: boolean
  budget: boolean
  weekly: boolean
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Demande la permission, s'abonne au push et enregistre l'abonnement en DB. */
export async function subscribePush(uid: string, prefs: PushPrefs): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
    const json = sub.toJSON()
    await db.from('push_subscriptions').upsert(
      { user_id: uid, endpoint: sub.endpoint, keys: json.keys, prefs },
      { onConflict: 'endpoint' },
    )
    return 'ok'
  } catch {
    return 'error'
  }
}

/** Se désabonne et supprime l'enregistrement DB. */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** Abonnement actif ? */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) != null
}

/** Met à jour les préférences de l'abonnement courant. */
export async function updatePushPrefs(prefs: PushPrefs): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await db.from('push_subscriptions').update({ prefs }).eq('endpoint', sub.endpoint)
}
