import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { Ic } from '../../components/Icon'
import { detectAndParseFile, SUPPORTED_BANKS } from '../../lib/parsers/index'
import { hashAB, getStoredHashes, saveHashes, parseNickelPDF } from '../../lib/parsers/nickel'
import type { ParsedTx } from '../../lib/parsers/index'
import { iconForCat } from '../../lib/parsers/categories'
import { matchRule, type MerchantRule } from '../../lib/merchantRules'
import { USE_RPC, newOpId, rpcImportBatch } from '../../lib/rpc'
import type { Theme, Account } from '../../types'

interface Props {
  t: Theme
  uid: string
  accounts: Account[]
  bank: string          // bank ID from SUPPORTED_BANKS
  onClose: () => void
  onImported: () => void
  onCreateAccount?: () => void
}

/** Normalise pour comparaison : minuscules, sans accents ni séparateurs. */
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

/** Égalité stricte (non vide). */
const eq = (x: string, y: string) => !!x && x === y
/** Sous-chaîne, seulement si les deux font ≥3 car. — évite qu'un compte nommé
 *  « A » matche « Crédit Agricole ». */
const sub = (x: string, y: string) => x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))

/** Cherche le compte existant correspondant à la banque importée (par nom/id). */
export function matchAccount(accounts: Account[], bankDef: { id: string; name: string }): Account | undefined {
  const bId = norm(bankDef.id), bName = norm(bankDef.name)
  return accounts.find(a => {
    const aId = norm(a.id), aName = norm(a.name || '')
    return eq(aName, bName) || eq(aId, bId) || sub(aName, bName) || sub(aId, bId)
  })
}

export const ImportUniversal = ({ t, uid, accounts, bank, onClose, onImported, onCreateAccount }: Props) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [txs, setTxs] = useState<ParsedTx[]>([])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  // accId '' = mode « créer un nouveau compte ». Sinon = importer dans ce compte.
  const [accId, setAccId] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const [skipped, setSkipped] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  const [dupFileNames, setDupFileNames] = useState<string[]>([])
  const [pendingHashes, setPendingHashes] = useState<string[]>([])
  const [newAccName, setNewAccName] = useState('')
  const [newAccType, setNewAccType] = useState('Courant')
  const [newAccColor, setNewAccColor] = useState('#10E8C0')
  const [createErr, setCreateErr] = useState('')
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null)

  const bankDef = SUPPORTED_BANKS.find(b => b.id === bank) ?? SUPPORTED_BANKS[SUPPORTED_BANKS.length - 1]
  const isNickel = bankDef.id === 'nickel'

  // Présélection : compte correspondant à la banque importée. Si AUCUN compte
  // ne correspond → mode création (accId='') + nom pré-rempli. Évite d'importer
  // silencieusement dans un compte non lié (ex: Boursorama → Nickel).
  useEffect(() => {
    const m = matchAccount(accounts, bankDef)
    if (m) setAccId(m.id)
    else { setAccId(''); setNewAccName(prev => prev || bankDef.name) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank])

  const handleFiles = async (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return
    setErr(''); setLoading(true); setFileCount(files.length); setDupFileNames([])
    try {
      let allParsed: ParsedTx[] = []
      const dups: string[] = []
      const freshHashes: string[] = []
      const storedHashes = isNickel ? new Set(getStoredHashes(uid)) : null

      for (let f = 0; f < files.length; f++) {
        const file = files[f]
        if (isNickel) {
          const ab = await file.arrayBuffer()
          const hash = await hashAB(ab)
          if (storedHashes!.has(hash)) {
            dups.push(file.name)
            continue
          }
          freshHashes.push(hash)
          const parsed = await parseNickelPDF(ab)
          allParsed = [...allParsed, ...parsed]
        } else {
          const parsed = await detectAndParseFile(file, bank)
          allParsed = [...allParsed, ...parsed]
        }
      }
      setDupFileNames(dups)
      setPendingHashes(freshHashes)

      if (!allParsed.length) {
        setErr('Aucune transaction trouvée. Vérifie le format du fichier.')
        setLoading(false)
        return
      }

      // Dedup between files (same date+amount+merchant)
      const seen = new Set<string>()
      allParsed = allParsed.filter(tx => {
        const key = `${tx.dt}|${tx.amount.toFixed(2)}|${tx.merchant}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Règles apprises : la catégorie de l'utilisateur prime sur la détection par mots-clés
      const { data: ruleRows } = await db.from('merchant_rules').select('id,pattern,category').eq('user_id', uid)
      const userRules: MerchantRule[] = (ruleRows || []) as MerchantRule[]
      if (userRules.length > 0) {
        allParsed = allParsed.map(tx => {
          const rule = matchRule(tx.merchant, userRules)
          return rule ? { ...tx, category: rule.category, icon: iconForCat(rule.category) } : tx
        })
      }

      // Deduplication: fetch existing transactions for this account
      const { data: existing } = await db
        .from('transactions')
        .select('tx_date,amount,merchant')
        .eq('account_id', accId)
        .eq('user_id', uid)

      const existingHashes = new Set(
        (existing ?? []).map((tx: { tx_date: string; amount: string | number; merchant: string }) =>
          `${tx.tx_date}|${parseFloat(String(tx.amount)).toFixed(2)}|${tx.merchant}`
        )
      )

      const fresh = allParsed.filter(tx =>
        !existingHashes.has(`${tx.dt}|${tx.amount.toFixed(2)}|${tx.merchant}`)
      )
      const dupCount = allParsed.length - fresh.length
      setSkipped(dupCount)

      const sel: Record<number, boolean> = {}
      fresh.forEach((_, i) => { sel[i] = true })
      setTxs(fresh)
      setSelected(sel)
      setStep('preview')
    } catch (e: unknown) {
      setErr('Erreur: ' + (e instanceof Error ? e.message : String(e)))
    }
    setLoading(false)
  }

  /** Traduit les erreurs Supabase cryptiques en message actionnable. */
  const friendlyDbError = (msg: string): string =>
    /row-level security|JWT|token|expired/i.test(msg)
      ? 'Session expirée — déconnecte-toi puis reconnecte-toi, et relance l\'import.'
      : msg

  /** Vérifie que la session est encore valide avant d'écrire en base. */
  const sessionAlive = async (): Promise<boolean> => {
    const { data } = await db.auth.getSession()
    return !!data.session
  }

  const doImport = async () => {
    const toImport = txs.filter((_, i) => selected[i])
    if (!toImport.length || !accId) return
    setErr(''); setLoading(true); setProgress(0)
    if (!(await sessionAlive())) {
      setErr('Session expirée — déconnecte-toi puis reconnecte-toi, et relance l\'import.')
      setLoading(false); return
    }
    // Chemin RPC : N insert + UN delta atomiques (préserve le solde initial).
    if (USE_RPC) {
      const { data, error } = await rpcImportBatch({
        operationId: newOpId(), accountId: accId,
        txs: toImport.map(tx => ({
          merchant: tx.merchant, category: tx.category, icon: tx.icon,
          amount: tx.amount, tx_date: tx.dt,
        })),
      })
      if (error) { setErr(friendlyDbError(error.message)); setLoading(false); return }
      const r = data as { imported?: number; skipped?: number } | null
      setImportSummary({ imported: r?.imported ?? 0, skipped: r?.skipped ?? 0 })
      setProgress(100)
      if (isNickel && pendingHashes.length) {
        saveHashes(uid, [...getStoredHashes(uid), ...pendingHashes])
      }
      setLoading(false); setStep('done')
      setTimeout(() => { onImported(); onClose() }, 1500)
      return
    }

    let done = 0
    for (const tx of toImport) {
      const { error } = await db.from('transactions').insert({
        user_id: uid, merchant: tx.merchant, category: tx.category,
        icon: tx.icon, amount: tx.amount, account_id: accId,
        tx_date: tx.dt, group_id: null, paid_by: null,
      })
      if (error) {
        setErr(friendlyDbError(error.message) + (done > 0 ? ` (${done} transaction${done > 1 ? 's' : ''} déjà importée${done > 1 ? 's' : ''})` : ''))
        setLoading(false); return
      }
      done++
      setProgress(Math.round(done / toImport.length * 100))
    }
    // Recalculate account balance (legacy — BUG : écrase le solde initial ;
    // remplacé par le delta atomique de rpc_import_batch quand USE_RPC).
    const { data: allTxs } = await db
      .from('transactions').select('amount')
      .eq('account_id', accId).eq('user_id', uid)
    if (allTxs?.length) {
      const newBal = allTxs.reduce((s, tx) => s + parseFloat(String(tx.amount)), 0)
      await db.from('accounts')
        .update({ balance: parseFloat(newBal.toFixed(2)), free: parseFloat(newBal.toFixed(2)) })
        .eq('id', accId).eq('user_id', uid)
    }
    if (isNickel && pendingHashes.length) {
      saveHashes(uid, [...getStoredHashes(uid), ...pendingHashes])
    }
    setLoading(false); setStep('done')
    setTimeout(() => { onImported(); onClose() }, 1500)
  }

  const doCreateAndImport = async () => {
    if (!newAccName.trim()) { setCreateErr('Nom requis'); return }
    setCreateErr(''); setLoading(true); setProgress(0)
    if (!(await sessionAlive())) {
      setCreateErr('Session expirée — déconnecte-toi puis reconnecte-toi, et relance l\'import.')
      setLoading(false); return
    }
    const toImport = txs.filter((_, i) => selected[i])
    const bal = parseFloat(toImport.reduce((s, tx) => s + tx.amount, 0).toFixed(2))
    const newId = newAccName.trim().toLowerCase().replace(/\s+/g, '_') + '_' + uid.slice(0, 6) + '_' + Math.random().toString(36).slice(2, 6)
    // Sous RPC : compte créé à 0, le delta est appliqué par rpc_import_batch.
    const initBal = USE_RPC ? 0 : bal
    const { error } = await db.from('accounts').insert({
      id: newId, name: newAccName.trim(), short_name: newAccName.trim().slice(0, 4),
      balance: initBal, free: initBal, type: newAccType, color: newAccColor, user_id: uid, reserved: 0,
    })
    if (error) { setCreateErr(friendlyDbError(error.message)); setLoading(false); return }

    if (USE_RPC) {
      const { data: impData, error: impErr } = await rpcImportBatch({
        operationId: newOpId(), accountId: newId,
        txs: toImport.map(tx => ({
          merchant: tx.merchant, category: tx.category, icon: tx.icon,
          amount: tx.amount, tx_date: tx.dt,
        })),
      })
      if (impErr) { setCreateErr(friendlyDbError(impErr.message) + ' (compte créé, import échoué)'); setLoading(false); return }
      const r = impData as { imported?: number; skipped?: number } | null
      setImportSummary({ imported: r?.imported ?? 0, skipped: r?.skipped ?? 0 })
      setProgress(100)
      if (isNickel && pendingHashes.length) {
        saveHashes(uid, [...getStoredHashes(uid), ...pendingHashes])
      }
      setLoading(false); setStep('done')
      setTimeout(() => { onImported(); onClose() }, 1500)
      return
    }

    let done = 0
    for (const tx of toImport) {
      const { error: txErr } = await db.from('transactions').insert({
        user_id: uid, merchant: tx.merchant, category: tx.category,
        icon: tx.icon, amount: tx.amount, account_id: newId,
        tx_date: tx.dt, group_id: null, paid_by: null,
      })
      if (txErr) {
        setCreateErr(friendlyDbError(txErr.message) + ` (compte créé, ${done}/${toImport.length} transactions importées)`)
        setLoading(false); return
      }
      done++
      setProgress(Math.round(done / toImport.length * 100))
    }
    if (isNickel && pendingHashes.length) {
      saveHashes(uid, [...getStoredHashes(uid), ...pendingHashes])
    }
    setLoading(false); setStep('done')
    setTimeout(() => { onImported(); onClose() }, 1500)
  }

  const expCount = txs.filter((_, i) => selected[i] && txs[i].amount < 0).length
  const totalDebits = txs.filter((_, i) => selected[i] && txs[i].amount < 0)
    .reduce((s, tx) => s + Math.abs(tx.amount), 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: t.bg, display: 'flex', flexDirection: 'column', animation: 'fadeIn .2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid ' + t.bo, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: t.el, border: 'none', borderRadius: 10, padding: '8px', cursor: 'pointer', display: 'flex' }}>
          <Ic n="back" sz={18} c={t.tx} />
        </button>
        <div>
          <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>{bankDef.icon} Import {bankDef.name}</div>
          <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>
            {step === 'upload'
              ? (isNickel ? 'Un ou plusieurs relevés PDF' : 'Sélectionne ton export')
              : step === 'preview'
                ? `${txs.length} nouvelles transactions${fileCount > 1 ? ' · ' + fileCount + ' fichiers' : ''}`
                : 'Import terminé !'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* UPLOAD */}
        {step === 'upload' && (
          <div>
            <label style={{ display: 'block', padding: '32px 20px', borderRadius: 16, border: `2px dashed ${bankDef.color}55`, textAlign: 'center', cursor: 'pointer', background: bankDef.color + '11', marginBottom: 20 }}>
              <input type="file" accept={bankDef.accept} multiple={isNickel} style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
              <div style={{ fontSize: 40, marginBottom: 12 }}>{loading ? '⏳' : '📊'}</div>
              <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx, marginBottom: 6 }}>
                {loading ? 'Lecture en cours…' : (isNickel ? 'Sélectionner un ou plusieurs PDF' : 'Sélectionner le fichier')}
              </div>
              <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{bankDef.name} · {bankDef.accept.toUpperCase()}</div>
            </label>
            {err && <div style={{ padding: '12px', borderRadius: 12, background: t.rD, border: '1px solid ' + t.rose + '44', ...sp('o'), fontSize: 13, color: t.dangerText, marginBottom: 12 }}>{err}</div>}
            {dupFileNames.length > 0 && (
              <div style={{ padding: '12px 14px', background: t.aD, borderRadius: 12, border: '1px solid ' + t.amber + '44', fontSize: 13, ...sp('o'), color: t.amber, marginBottom: 12 }}>
                ⚠️ {dupFileNames.length === 1 ? `"${dupFileNames[0]}" a déjà été importé.` : `${dupFileNames.length} fichiers déjà importés : ${dupFileNames.join(', ')}.`} Les doublons seront filtrés.
              </div>
            )}
            <div style={{ padding: '16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo }}>
              <div style={{ fontSize: 12, ...sp('s', 600), color: t.sub, marginBottom: 10 }}>Comment exporter depuis {bankDef.name} ?</div>
              {bankDef.id === 'bnp' && ['Espace client BNP → Mes comptes', 'Sélectionner le compte', 'Télécharger relevé → Format CSV', 'Importer ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
              {bankDef.id === 'boursorama' && ['Boursorama → Mes comptes', 'Sélectionner le compte', 'Télécharger → CSV', 'Importer ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
              {bankDef.id === 'nickel' && ['Ouvre l\'app Nickel ou espace.nickel.eu', 'Va dans Mon compte → Relevés', 'Télécharge le relevé du mois voulu', 'Importe-le ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
              {bankDef.id === 'cm' && ['Espace client CM → Mes comptes', 'Sélectionner le compte', 'Télécharger → Format CSV', 'Importer ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
              {bankDef.id === 'qonto' && ['Qonto → Transactions', 'Cliquer Exporter en haut à droite', 'Choisir CSV', 'Importer ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
              {!['bnp', 'boursorama', 'nickel', 'cm', 'qonto'].includes(bankDef.id) && ['Espace client de ta banque', 'Mes comptes → Historique', 'Exporter → Format OFX', 'Importer ici'].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: bankDef.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, ...sp('m', 700), color: bankDef.color }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: '12px', background: t.rD, borderRadius: 12, border: '1px solid ' + t.rose + '33' }}>
                <div style={{ fontSize: 11, ...sp('o'), color: t.dangerText }}>{expCount} dépenses</div>
                <div style={{ fontSize: 16, ...sp('m', 600), color: t.tx, marginTop: 2 }}>{fmt(totalDebits)}</div>
              </div>
              <div style={{ flex: 1, padding: '12px', background: t.mD, borderRadius: 12, border: '1px solid ' + t.mint + '33' }}>
                <div style={{ fontSize: 11, ...sp('o'), color: t.mintText }}>Sélectionnées</div>
                <div style={{ fontSize: 16, ...sp('m', 600), color: t.tx, marginTop: 2 }}>{Object.values(selected).filter(Boolean).length}</div>
              </div>
            </div>
            {skipped > 0 && (
              <div style={{ padding: '10px 14px', background: t.aD, borderRadius: 10, fontSize: 12, ...sp('o'), color: t.amber, marginBottom: 12 }}>
                ⚠️ {skipped} transaction{skipped > 1 ? 's' : ''} déjà importée{skipped > 1 ? 's' : ''} — ignorée{skipped > 1 ? 's' : ''}
              </div>
            )}
            {accounts.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 8 }}>Importer dans</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {accounts.map(a => (
                    <button key={a.id} onClick={() => setAccId(a.id)} style={{ padding: '8px 13px', borderRadius: 10, border: 'none', cursor: 'pointer', background: accId === a.id ? a.col + '22' : t.el, outline: accId === a.id ? '1.5px solid ' + a.col + '55' : 'none' }}>
                      <span style={{ fontSize: 12, ...sp('o', 600), color: accId === a.id ? a.col : t.tx }}>{a.short}</span>
                    </button>
                  ))}
                  {/* Toujours proposer un nouveau compte (banque sans compte lié). */}
                  <button onClick={() => { setAccId(''); setNewAccName(n => n || bankDef.name) }} style={{ padding: '8px 13px', borderRadius: 10, border: '1px dashed ' + (accId === '' ? bankDef.color : t.bo), cursor: 'pointer', background: accId === '' ? bankDef.color + '22' : 'transparent' }}>
                    <span style={{ fontSize: 12, ...sp('o', 600), color: accId === '' ? bankDef.color : t.sub }}>+ Nouveau</span>
                  </button>
                </div>
              </div>
            )}
            {accId === '' && (
              <div style={{ marginBottom: 14, padding: '16px', background: t.card, borderRadius: 14, border: '1px solid ' + t.bo }}>
                <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 10 }}>Créer le compte</div>
                <input type="text" value={newAccName} onChange={e => setNewAccName(e.target.value)} placeholder="Nom du compte (ex: Compte BNP)"
                  style={{ width: '100%', padding: '11px 14px', background: t.el, border: '1.5px solid ' + (createErr ? t.rose : t.bo), borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
                {createErr && <div style={{ fontSize: 12, ...sp('o'), color: t.dangerText, marginBottom: 8 }}>{createErr}</div>}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {['Courant', 'Épargne', 'Pro'].map(tp => (
                    <button key={tp} onClick={() => setNewAccType(tp)} style={{ padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', ...sp('o', 600), fontSize: 12, background: newAccType === tp ? newAccColor + '33' : t.el, color: newAccType === tp ? newAccColor : t.sub }}>
                      {tp}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {['#10E8C0', '#FF6584', '#F5A623', '#6B7FD7', '#50C8A0', '#E87040', '#C084FC', '#60A5FA'].map(c => (
                    <button key={c} onClick={() => setNewAccColor(c)} style={{ width: 28, height: 28, borderRadius: 14, background: c, border: 'none', cursor: 'pointer', outline: newAccColor === c ? '3px solid ' + t.tx : '3px solid transparent', outlineOffset: 2 }} />
                  ))}
                </div>
                <div style={{ padding: '10px 12px', background: t.mD, borderRadius: 10, fontSize: 12, ...sp('o'), color: t.mintText }}>
                  💰 Solde calculé : <b>{fmt(Math.abs(txs.filter((_, i) => selected[i]).reduce((s, tx) => s + tx.amount, 0)))}</b>
                  {txs.filter((_, i) => selected[i]).reduce((s, tx) => s + tx.amount, 0) < 0 ? ' (débiteur)' : ' (créditeur)'}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{Object.values(selected).filter(Boolean).length} / {txs.length}</span>
              <button onClick={() => { const all = Object.values(selected).every(Boolean); const ns: Record<number, boolean> = {}; txs.forEach((_, i) => { ns[i] = !all }); setSelected(ns) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, ...sp('o', 600), color: t.mintText }}>
                {Object.values(selected).every(Boolean) ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
            {txs.map((tx, i) => (
              <div key={i} onClick={() => setSelected(s => ({ ...s, [i]: !s[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, marginBottom: 6, cursor: 'pointer', background: selected[i] ? t.card : t.el, border: '1px solid ' + (selected[i] ? t.bo : 'transparent'), opacity: selected[i] ? 1 : .5 }}>
                <div style={{ fontSize: 18, flexShrink: 0 }}>{tx.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, ...sp('o', 500), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.merchant}</div>
                  <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>{tx.category} · {tx.dt.split('-').reverse().join('/')}</div>
                </div>
                <div style={{ fontSize: 13, ...sp('m', 500), color: tx.amount < 0 ? t.tx : t.mintText, flexShrink: 0 }}>
                  {tx.amount < 0 ? '−' : '+'}{fmt(Math.abs(tx.amount))}
                </div>
                <div style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0, background: selected[i] ? t.mint : t.bo, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selected[i] && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, ...sp('s', 700), color: t.tx }}>Import terminé !</div>
            <div style={{ fontSize: 13, ...sp('o'), color: t.sub, marginTop: 8 }}>
              {importSummary
                ? `${importSummary.imported} transaction${importSummary.imported > 1 ? 's' : ''} ajoutée${importSummary.imported > 1 ? 's' : ''}`
                : `${Object.values(selected).filter(Boolean).length} transactions importées`}
            </div>
            {importSummary && importSummary.skipped > 0 && (
              <div style={{ fontSize: 12, ...sp('o'), color: t.amber, marginTop: 6 }}>
                {importSummary.skipped} doublon{importSummary.skipped > 1 ? 's' : ''} déjà présent{importSummary.skipped > 1 ? 's' : ''} — ignoré{importSummary.skipped > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {step === 'preview' && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid ' + t.bo, flexShrink: 0 }}>
          {loading ? (
            <div>
              <div style={{ height: 6, background: t.el, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: progress + '%', height: '100%', background: bankDef.color, borderRadius: 3, transition: 'width .3s ease' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, ...sp('o'), color: t.sub }}>Import… {progress}%</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '15px', background: 'none', border: '1px solid ' + t.bo, borderRadius: 14, cursor: 'pointer', ...sp('o', 600), fontSize: 14, color: t.sub }}>
                Annuler
              </button>
              {accId === '' ? (
                <button onClick={doCreateAndImport} style={{ flex: 2, padding: '15px', background: bankDef.color, border: 'none', borderRadius: 14, cursor: 'pointer', ...sp('o', 700), fontSize: 14, color: '#fff' }}>
                  Créer & importer ({Object.values(selected).filter(Boolean).length})
                </button>
              ) : (
                <button onClick={doImport} style={{ flex: 2, padding: '15px', background: bankDef.color, border: 'none', borderRadius: 14, cursor: 'pointer', ...sp('o', 700), fontSize: 14, color: '#fff' }}>
                  Importer ({Object.values(selected).filter(Boolean).length})
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
