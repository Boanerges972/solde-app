// Proxy authentifié Enable Banking. Détient la clé privée, signe le JWT, appelle
// l'API, renvoie les données BRUTES au client. Le mapping (mapEbTx) et l'écriture
// (rpcImportBatch) restent côté client → une seule source de vérité, l'import
// blindé (dédup + soldes verrouillés) est réutilisé tel quel.
//
// Auth : le JWT Supabase de l'utilisateur (verify_jwt activé). Chaque action ne
// touche QUE les liaisons de cet utilisateur.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ID = Deno.env.get('EB_APPLICATION_ID')!
const PRIVATE_KEY = Deno.env.get('EB_PRIVATE_KEY')!
const REDIRECT_URI = Deno.env.get('EB_REDIRECT_URI')!
const STATE_SECRET = Deno.env.get('CRON_SECRET')! // réutilisé comme clé HMAC du state
const EB = 'https://api.enablebanking.com'
const stateKey = new TextEncoder().encode(STATE_SECRET)

const svc = createClient(SUPABASE_URL, SERVICE_KEY)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function ebJwt(): Promise<string> {
  const key = await importPKCS8(PRIVATE_KEY, 'RS256')
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: APP_ID, typ: 'JWT' })
    .setIssuer('enablebanking.com').setAudience('api.enablebanking.com')
    .setIssuedAt().setExpirationTime('1h').sign(key)
}

async function ebFetch(path: string, init?: RequestInit) {
  const jwt = await ebJwt()
  const r = await fetch(EB + path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${jwt}` },
  })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body }
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') || ''
  const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await anon.auth.getUser()
  if (!user) return json({ error: 'Authentication required' }, 401)
  const uid = user.id

  const p = await req.json().catch(() => ({})) as Record<string, string>
  const action = p.action

  // Démarre l'autorisation : renvoie l'URL de redirection banque (SCA).
  if (action === 'start_auth') {
    const validUntil = new Date(Date.now() + 180 * 864e5).toISOString()
    const state = await new SignJWT({ uid, aspsp_name: p.aspsp_name, aspsp_country: p.aspsp_country || 'FR' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30m').sign(stateKey)
    const { status, body } = await ebFetch('/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aspsp: { name: p.aspsp_name, country: p.aspsp_country || 'FR' },
        access: { valid_until: validUntil },
        redirect_url: REDIRECT_URI, state, psu_type: 'personal',
      }),
    })
    if (status >= 400) return json({ error: 'eb_auth', detail: body }, 400)
    return json({ url: (body as { url?: string }).url })
  }

  // Liste les banques disponibles d'un pays (pour le sélecteur de connexion).
  if (action === 'aspsps') {
    const { status, body } = await ebFetch(`/aspsps?country=${p.country || 'FR'}`)
    if (status >= 400) return json({ error: 'eb_aspsps', detail: body }, 400)
    const list = (body as { aspsps?: { name?: string; country?: string }[] }).aspsps || []
    return json({ aspsps: list.map(a => ({ name: a.name, country: a.country })) })
  }

  // Liste les liaisons de l'utilisateur (pour l'UI de mapping).
  if (action === 'list') {
    const { data, error } = await svc.from('bank_links').select('*').eq('user_id', uid).order('created_at')
    if (error) return json({ error: error.message }, 400) // ne pas masquer une panne en « aucune banque »
    return json({ links: data || [] })
  }

  // Relie une liaison agrégée à un compte QDQ local.
  if (action === 'link') {
    // Le compte cible DOIT appartenir à l'utilisateur : l'écriture passe par la
    // service_role (hors RLS), rien d'autre ne garantirait la frontière ici.
    const { data: acc } = await svc.from('accounts')
      .select('id').eq('id', p.account_id).eq('user_id', uid).maybeSingle()
    if (!acc) return json({ error: 'Compte cible introuvable' }, 403)
    const { error } = await svc.from('bank_links')
      .update({ account_id: p.account_id }).eq('id', p.link_id).eq('user_id', uid)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  // Tire les transactions + le solde d'une liaison reliée. Ne les ÉCRIT PAS :
  // le client mappe et importe via rpcImportBatch (idempotent).
  if (action === 'fetch') {
    const { data: link } = await svc.from('bank_links')
      .select('*').eq('id', p.link_id).eq('user_id', uid).single()
    if (!link) return json({ error: 'Liaison introuvable' }, 404)
    if (!link.account_id) return json({ error: 'Compte non relié' }, 400)

    const dateFrom = link.last_tx_date || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const all: unknown[] = []
    let cont = ''
    // La garde haute couvre largement une fenêtre perso ; `complete` distingue
    // « fin réelle de pagination » d'« arrêt sur la garde ». Le client ne doit
    // PAS avancer le watermark sur une fenêtre incomplète (sinon perte de tx).
    let complete = false
    for (let i = 0; i < 500; i++) {
      const q = new URLSearchParams({ date_from: dateFrom })
      if (cont) q.set('continuation_key', cont)
      const { status, body } = await ebFetch(`/accounts/${link.eb_account_uid}/transactions?` + q.toString())
      if (status >= 400) return json({ error: 'eb_tx', detail: body }, 400)
      const b = body as { transactions?: unknown[]; continuation_key?: string }
      all.push(...(b.transactions || []))
      cont = b.continuation_key || ''
      if (!cont) { complete = true; break }
    }

    // Solde de référence pour la réconciliation : clôturé comptabilisé (CLBD),
    // sinon disponible (CLAV), sinon le premier.
    const bal = await ebFetch(`/accounts/${link.eb_account_uid}/balances`)
    let balance: number | null = null
    if (bal.status < 400) {
      const list = (bal.body as { balances?: { balance_type?: string; balance_amount?: { amount?: string } }[] }).balances || []
      const pick = list.find(b => b.balance_type === 'CLBD') || list.find(b => b.balance_type === 'CLAV') || list[0]
      const amt = pick?.balance_amount?.amount
      if (amt != null) balance = parseFloat(amt)
    }

    return json({ transactions: all, balance, account_id: link.account_id, date_from: dateFrom, complete })
  }

  // Marque une liaison comme synchronisée (après import client réussi).
  if (action === 'mark_synced') {
    const { error } = await svc.from('bank_links')
      .update({ last_sync_at: new Date().toISOString(), last_tx_date: p.last_tx_date })
      .eq('id', p.link_id).eq('user_id', uid)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Action inconnue' }, 400)
})
