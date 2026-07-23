// Edge Function : envoie les notifications push planifiées.
// Appelée par cron (pg_cron → pg_net) une fois par jour à 09:00 UTC-3 (12:00 UTC).
// Auth custom : header x-cron-secret (verify_jwt désactivé car appel machine-à-machine).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

webpush.setVapidDetails('mailto:lory.budoc@hotmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

const db = createClient(SUPABASE_URL, SERVICE_KEY)

interface Sub {
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  prefs: { recurring?: boolean; budget?: boolean; weekly?: boolean }
}

async function send(sub: Sub, payload: { title: string; body: string; tag: string }) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    )
    return true
  } catch (e) {
    // 404/410 = abonnement mort → nettoyage
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
    return false
  }
}

function dayFromLabel(label: string): number {
  const m = (label || '').match(/\d+/)
  const d = m ? parseInt(m[0]) : 1
  return d >= 1 && d <= 31 ? d : 1
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const results = { recurring: 0, budget: 0, weekly: 0, consent: 0 }

  const { data: subsRaw } = await db.from('push_subscriptions').select('*')
  const subs = (subsRaw || []) as Sub[]
  if (subs.length === 0) return Response.json({ ok: true, results, note: 'no subscriptions' })

  const byUser = new Map<string, Sub[]>()
  subs.forEach(s => byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]))

  for (const [uid, userSubs] of byUser) {
    // 1) Rappels prélèvements J-2
    const targetDay = new Date(now.getTime() + 2 * 86400000).getDate()
    const { data: recs } = await db.from('next_debits').select('name,amount,date_label,kind').eq('user_id', uid)
    for (const r of recs || []) {
      if (dayFromLabel(r.date_label) !== targetDay) continue
      if (r.kind === 'credit') continue   // v1 : pas de notif pour les revenus
      for (const s of userSubs.filter(s => s.prefs?.recurring !== false)) {
        if (await send(s, {
          title: 'Prélèvement dans 2 jours',
          body: `${r.name} — ${Number(r.amount).toFixed(2)} € sera prélevé le ${targetDay}`,
          tag: 'recurring-' + r.name,
        })) results.recurring++
      }
    }

    // 2) Dépassements de budget (mois courant)
    const month = now.toISOString().slice(0, 7)
    const { data: budgets } = await db.from('category_budgets').select('category,amount').eq('user_id', uid)
    if (budgets && budgets.length > 0) {
      const { data: txs } = await db.from('transactions')
        .select('category,amount,tx_date').eq('user_id', uid)
        .gte('tx_date', month + '-01')
      const spent: Record<string, number> = {}
      for (const tx of txs || []) {
        const amt = Number(tx.amount)
        if (amt < 0) spent[tx.category || 'Autre'] = (spent[tx.category || 'Autre'] || 0) + Math.abs(amt)
      }
      for (const b of budgets) {
        const ratio = Number(b.amount) > 0 ? (spent[b.category] || 0) / Number(b.amount) : 0
        if (ratio < 0.8) continue
        const over = ratio >= 1
        for (const s of userSubs.filter(s => s.prefs?.budget !== false)) {
          if (await send(s, {
            title: over ? 'Budget dépassé !' : 'Budget bientôt atteint',
            body: `${b.category} : ${Math.round(ratio * 100)}% du budget mensuel utilisé`,
            tag: 'budget-' + b.category + '-' + (over ? '100' : '80'),
          })) results.budget++
        }
      }
    }

    // 3) Résumé hebdo (dimanche uniquement)
    if (now.getUTCDay() === 0) {
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
      const { data: weekTxs } = await db.from('transactions')
        .select('amount,category').eq('user_id', uid).gte('tx_date', weekAgo)
      const spent = (weekTxs || []).filter(t => Number(t.amount) < 0)
      const total = spent.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      if (total > 0) {
        const byCat: Record<string, number> = {}
        spent.forEach(t => { byCat[t.category || 'Autre'] = (byCat[t.category || 'Autre'] || 0) + Math.abs(Number(t.amount)) })
        const top = Object.entries(byCat).sort(([, a], [, b]) => b - a)[0]
        for (const s of userSubs.filter(s => s.prefs?.weekly !== false)) {
          if (await send(s, {
            title: 'Votre semaine en un coup d’œil',
            body: `${total.toFixed(0)} € dépensés cette semaine · top catégorie : ${top?.[0] || '—'}`,
            tag: 'weekly',
          })) results.weekly++
        }
      }
    }

    // 4) Consentement Open Banking bientôt expiré (rappels J-7 / J-3 / J-1).
    //    Sans renouvellement, la synchro bancaire s'arrête en silence. On ne
    //    notifie qu'à ces seuils (le tag remplace, pas d'empilement).
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString()
    const { data: expiring } = await db.from('bank_links')
      .select('aspsp_name, consent_expires')
      .eq('user_id', uid).not('account_id', 'is', null)
      .gte('consent_expires', now.toISOString()).lte('consent_expires', in7)
    for (const l of expiring || []) {
      const days = Math.ceil((new Date(l.consent_expires as string).getTime() - now.getTime()) / 86400000)
      if (![7, 3, 1].includes(days)) continue
      for (const s of userSubs) {
        if (await send(s, {
          title: 'Reconnecte ta banque',
          body: `L'accès à ${l.aspsp_name} expire ${days <= 1 ? 'demain' : 'dans ' + days + ' jours'} — reconnecte-la (Réglages) pour garder la synchro.`,
          tag: 'consent-' + l.aspsp_name,
        })) results.consent++
      }
    }
  }

  return Response.json({ ok: true, results })
})
