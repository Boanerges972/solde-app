// Cible de redirection après la SCA sur la banque. Reçu en GET direct depuis le
// navigateur (pas de JWT Supabase) → l'identité vient du `state` signé HS256
// émis par bank-sync/start_auth. Échange le code contre une session, enregistre
// les comptes détectés (non reliés), affiche une page de retour.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ID = Deno.env.get('EB_APPLICATION_ID')!
const PRIVATE_KEY = Deno.env.get('EB_PRIVATE_KEY')!
const STATE_SECRET = Deno.env.get('STATE_SECRET')! // clé HMAC du state (secret dédié)
const EB = 'https://api.enablebanking.com'
const stateKey = new TextEncoder().encode(STATE_SECRET)

const svc = createClient(SUPABASE_URL, SERVICE_KEY)

function html(msg: string, ok = false): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:system-ui;max-width:420px;margin:14vh auto;padding:0 24px;text-align:center;color:#1a1a2e">
       <div style="font-size:44px">${ok ? '✅' : '⚠️'}</div>
       <p style="font-size:15px;line-height:1.5">${msg}</p>
     </div>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function ebJwt(): Promise<string> {
  const key = await importPKCS8(PRIVATE_KEY, 'RS256')
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: APP_ID, typ: 'JWT' })
    .setIssuer('enablebanking.com').setAudience('api.enablebanking.com')
    .setIssuedAt().setExpirationTime('1h').sign(key)
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')
  if (err) return html(`Autorisation refusée par la banque (${err}).`)
  if (!code || !state) return html('Paramètres de retour manquants.')

  let uid: string, aspspName: string, returnTo = '', nonce = ''
  try {
    const { payload } = await jwtVerify(state, stateKey)
    uid = payload.uid as string
    aspspName = (payload.aspsp_name as string) || 'Banque'
    returnTo = (payload.return_to as string) || ''
    nonce = (payload.nonce as string) || ''
  } catch {
    return html('Lien de retour invalide ou expiré. Relance la connexion depuis QDQ.')
  }

  // Renvoie l'utilisateur dans l'app avec un statut, plutôt qu'une page servie
  // en text/plain par la passerelle. Fallback HTML si l'origine est absente.
  const back = (status: string, n = 0) =>
    returnTo ? Response.redirect(`${returnTo}/?bank=${status}${n ? `&count=${n}` : ''}`, 302) : null

  // Consomme le nonce : usage unique + expiration 30 min. Un state rejoué ou
  // périmé ne supprime aucune ligne → on refuse.
  const cutoff = new Date(Date.now() - 30 * 60000).toISOString()
  const { data: consumed } = await svc.from('bank_auth_nonce')
    .delete().eq('nonce', nonce).eq('user_id', uid).gte('created_at', cutoff).select('nonce')
  if (!consumed || consumed.length === 0) {
    return back('error') || html('Lien de consentement déjà utilisé ou expiré. Relance la connexion depuis QDQ.')
  }

  const jwt = await ebJwt()
  const r = await fetch(`${EB}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await r.json().catch(() => ({})) as {
    session_id?: string
    accounts?: { uid: string; name?: string; account_id?: { iban?: string } }[]
    access?: { valid_until?: string }
  }
  if (r.status >= 400) return back('error') || html('Échec de la création de session. Réessaie depuis QDQ.')

  const accounts = body.accounts || []
  let saved = 0
  for (const a of accounts) {
    // upsert : l'account_id (mapping local) n'est PAS touché → une re-connexion
    // (renouvellement de consentement) préserve les liaisons déjà établies.
    const { error } = await svc.from('bank_links').upsert({
      user_id: uid,
      aspsp_name: aspspName,
      eb_account_uid: a.uid,
      iban: a.account_id?.iban || null,
      eb_name: a.name || null,
      session_id: body.session_id || null,
      consent_expires: body.access?.valid_until || null,
    }, { onConflict: 'user_id,eb_account_uid' })
    if (!error) saved++
  }

  // 0 compte enregistré : soit la banque n'a partagé aucun compte (certaines,
  // comme le Crédit Mutuel, autorisent le consentement mais n'exposent pas le
  // compte via Open Banking), soit l'utilisateur n'a rien sélectionné.
  if (saved === 0) {
    return back('error') || html('Aucun compte partagé par la banque. Ce compte n\'est peut-être pas accessible via Open Banking (import manuel possible).')
  }
  return back('connected', saved) || html(
    `Banque connectée. ${saved} compte(s) enregistré(s).<br><br>
     Retourne dans QDQ → Réglages → Synchronisation bancaire pour relier ces comptes aux tiens.`,
    true,
  )
})
