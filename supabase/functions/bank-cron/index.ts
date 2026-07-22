// Rafraîchit quotidiennement le SOLDE des comptes reliés (Open Banking), pour le
// compte du cron (pas de session utilisateur). Balance-only : les transactions
// restent importées côté app (mapEbTx = source unique), pour ne pas dupliquer la
// logique de mapping dans un contexte non supervisé.
//
// Auth : x-cron-secret (appel machine-à-machine, verify_jwt off). Écrit via
// rpc_refresh_balance_svc (service_role, user_id explicite, contrôle propriété).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ID = Deno.env.get('EB_APPLICATION_ID')!
const PRIVATE_KEY = Deno.env.get('EB_PRIVATE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const EB = 'https://api.enablebanking.com'

const svc = createClient(SUPABASE_URL, SERVICE_KEY)

async function ebJwt(): Promise<string> {
  const key = await importPKCS8(PRIVATE_KEY, 'RS256')
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: APP_ID, typ: 'JWT' })
    .setIssuer('enablebanking.com').setAudience('api.enablebanking.com')
    .setIssuedAt().setExpirationTime('1h').sign(key)
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: links, error: linksErr } = await svc.from('bank_links')
    .select('id, user_id, account_id, eb_account_uid, consent_expires')
    .not('account_id', 'is', null)
  // Ne PAS renvoyer un faux succès si la lecture échoue (sinon prod muette).
  if (linksErr) return Response.json({ ok: false, error: linksErr.message }, { status: 500 })

  const jwt = await ebJwt()
  const now = Date.now()
  let refreshed = 0, skipped = 0
  const errors: string[] = []

  for (const l of links || []) {
    try {
      // Consentement expiré → on ne tente rien (évite d'écrire un solde d'une
      // réponse éventuellement mise en cache).
      if (l.consent_expires && new Date(l.consent_expires as string).getTime() < now) { skipped++; continue }

      // Timeout : un lien qui pend ne doit pas bloquer les suivants.
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 15000)
      let r: Response
      try {
        r = await fetch(`${EB}/accounts/${l.eb_account_uid}/balances`, { headers: { Authorization: `Bearer ${jwt}` }, signal: ctrl.signal })
      } finally { clearTimeout(to) }
      if (r.status >= 400) { skipped++; continue }
      const body = await r.json().catch(() => ({}))
      const list = (body?.balances || []) as { balance_type?: string; balance_amount?: { amount?: string; currency?: string } }[]
      // Même priorité que la synchro app : temps réel / disponible d'abord.
      const order = ['XPCD', 'ITAV', 'ITBD', 'CLAV', 'CLBD']
      let pick = null as (typeof list)[number] | null
      for (const type of order) { const f = list.find(b => b.balance_type === type); if (f) { pick = f; break } }
      pick = pick || list[0]
      const amt = pick?.balance_amount?.amount
      // Devise attendue EUR : ne jamais écrire un solde d'une autre devise.
      if (pick?.balance_amount?.currency && pick.balance_amount.currency !== 'EUR') { skipped++; continue }
      // Parse STRICT : « 123.45 EUR » ou « 12abc » rejetés.
      if (amt == null || !/^-?\d+(\.\d+)?$/.test(amt.trim())) { skipped++; continue }
      const balance = Number(amt.trim())
      if (!Number.isFinite(balance)) { skipped++; continue }

      const { error } = await svc.rpc('rpc_refresh_balance_svc', {
        p_user_id: l.user_id, p_account_id: l.account_id, p_balance: balance,
      })
      if (error) { errors.push(`${l.account_id}: ${error.message}`); skipped++; continue }
      await svc.from('bank_links').update({ last_sync_at: new Date().toISOString() }).eq('id', l.id)
      refreshed++
    } catch (e) {
      errors.push(`${l.account_id}: ${String((e as Error)?.message || e)}`)
      skipped++
    }
  }

  return Response.json({ ok: true, refreshed, skipped, errors })
})
