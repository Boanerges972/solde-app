import { useState, useEffect, useCallback } from 'react'
import { sp } from '../lib/theme'
import { db } from '../lib/supabase'
import { listLinks, listAspsps, startAuth, linkAccount, syncLink, type BankLink } from '../lib/bankSync/client'
import type { Theme } from '../types'

interface LocalAccount { id: string; name: string; short_name: string | null }

/** Panneau Réglages : connexion Open Banking (Enable Banking), mapping des
 *  comptes agrégés vers les comptes QDQ, et synchronisation manuelle. */
export const BankSyncSettings = ({ t, uid }: { t: Theme; uid: string }) => {
  const [links, setLinks] = useState<BankLink[]>([])
  const [accounts, setAccounts] = useState<LocalAccount[]>([])
  const [aspsps, setAspsps] = useState<{ name: string; country: string }[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // clé d'action en cours
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    try { setLinks(await listLinks()) } catch (e) { setErr(String((e as Error).message)) }
  }, [])

  useEffect(() => {
    reload()
    db.from('accounts').select('id,name,short_name').eq('user_id', uid)
      .then(({ data }) => setAccounts((data as LocalAccount[]) || []))
  }, [uid, reload])

  // La connexion se fait dans un autre onglet ; au retour, recharger les liaisons.
  useEffect(() => {
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const openConnect = async () => {
    setErr(''); setBusy('aspsps'); setQuery('')
    try { setAspsps(await listAspsps('FR')) }
    catch (e) { setErr(String((e as Error).message)) }
    finally { setBusy(null) }
  }

  const connect = async (name: string) => {
    setErr(''); setBusy('connect')
    try {
      const url = await startAuth(name, 'FR')
      window.open(url, '_blank', 'noopener')
      setAspsps(null)
    } catch (e) { setErr(String((e as Error).message)) }
    finally { setBusy(null) }
  }

  const onLink = async (link_id: string, account_id: string) => {
    if (!account_id) return
    setBusy('link-' + link_id)
    try { await linkAccount(link_id, account_id); await reload() }
    catch (e) { setErr(String((e as Error).message)) }
    finally { setBusy(null) }
  }

  const onSync = async (link_id: string) => {
    setErr(''); setBusy('sync-' + link_id)
    try {
      const r = await syncLink(link_id)
      const parts = [`${r.imported} importée${r.imported > 1 ? 's' : ''}`]
      if (r.skipped) parts.push(`${r.skipped} déjà connue${r.skipped > 1 ? 's' : ''}`)
      if (r.aligned && r.balance != null) parts.push(`solde aligné : ${r.balance.toFixed(2)} €`)
      if (!r.complete) parts.push('⚠️ fenêtre incomplète, relance la synchro')
      setMsg(m => ({ ...m, [link_id]: parts.join(' · ') }))
      await reload()
    } catch (e) { setErr(String((e as Error).message)) }
    finally { setBusy(null) }
  }

  const daysLeft = (iso: string | null) =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5) : null

  return (
    <div style={{ padding: '14px 16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: links.length || aspsps ? 12 : 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: t.mD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>Synchronisation bancaire</div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>
            {links.length ? `${links.length} compte${links.length > 1 ? 's' : ''} connecté${links.length > 1 ? 's' : ''}` : 'Aucune banque connectée'}
          </div>
        </div>
        <button onClick={openConnect} disabled={busy === 'aspsps'}
          style={{ padding: '7px 12px', borderRadius: 10, background: t.mD, border: '1px solid ' + t.mintText + '44', cursor: 'pointer', ...sp('o', 600), fontSize: 12, color: t.mintText, opacity: busy === 'aspsps' ? 0.5 : 1 }}>
          {busy === 'aspsps' ? '…' : '+ Banque'}
        </button>
      </div>

      {err && <div role="alert" style={{ fontSize: 12, ...sp('o'), color: t.dangerText, background: t.rD, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{err}</div>}

      {/* Sélecteur de banque : recherche + liste courte (la liste FR fait ~130
          banques, on ne l'affiche jamais en entier). */}
      {aspsps && (() => {
        const q = query.trim().toLowerCase()
        const shown = (q ? aspsps.filter(a => a.name.toLowerCase().includes(q)) : aspsps).slice(0, 30)
        return (
          <div style={{ background: t.el, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, ...sp('o', 600), color: t.sub, marginBottom: 8 }}>Cherche ta banque</div>
            <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
              placeholder="ex : Boursorama, Crédit Mutuel…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 13, ...sp('o'), marginBottom: 8 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {shown.length === 0 && <span style={{ fontSize: 12, color: t.sub }}>Aucune banque ne correspond.</span>}
              {shown.map(a => (
                <button key={a.name} onClick={() => connect(a.name)} disabled={busy === 'connect'}
                  style={{ padding: '6px 10px', borderRadius: 999, fontSize: 11.5, ...sp('o', 500), cursor: 'pointer', background: t.card, color: t.tx, border: '1px solid ' + t.bo, opacity: busy === 'connect' ? 0.5 : 1 }}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Liaisons */}
      {links.map(l => {
        const d = daysLeft(l.consent_expires)
        return (
          <div key={l.id} style={{ background: t.el, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, ...sp('o', 600), color: t.tx }}>{l.aspsp_name}</div>
                <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>{l.eb_name || l.iban || 'Compte'}</div>
              </div>
              <button onClick={() => onSync(l.id)} disabled={!l.account_id || busy === 'sync-' + l.id}
                style={{ padding: '6px 10px', borderRadius: 8, fontSize: 11.5, ...sp('o', 600), cursor: l.account_id ? 'pointer' : 'not-allowed', background: l.account_id ? t.primary : t.bo, color: l.account_id ? '#fff' : t.sub, border: 'none', opacity: busy === 'sync-' + l.id ? 0.5 : 1 }}>
                {busy === 'sync-' + l.id ? 'Sync…' : 'Synchroniser'}
              </button>
            </div>

            <select value={l.account_id || ''} onChange={e => onLink(l.id, e.target.value)}
              style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 12, ...sp('o') }}>
              <option value="">— Relier à un compte QDQ —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.short_name || a.name}</option>)}
            </select>

            {msg[l.id] && <div style={{ fontSize: 11.5, ...sp('o', 600), color: t.mintText, marginTop: 6 }}>{msg[l.id]}</div>}
            {d != null && d <= 7 && (
              <div style={{ fontSize: 11, ...sp('o'), color: t.amber || t.dangerText, marginTop: 6 }}>
                ⚠️ Consentement à renouveler {d <= 0 ? 'maintenant' : `dans ${d} j`} — reconnecte la banque.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
