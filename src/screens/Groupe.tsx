import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon } from '../components/Icon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import { isoLocal } from '../lib/dates'
import type { Theme, Transaction, Group, Member } from '../types'

const CAT_COMMUNE = [
  { n: 'Courses', ico: '🛒' }, { n: 'Loyer', ico: '🏠' }, { n: 'EDF/Eau', ico: '💡' },
  { n: 'Internet', ico: '📶' }, { n: 'Restaurant', ico: '🍽️' }, { n: 'Vacances', ico: '✈️' },
  { n: 'Santé', ico: '💊' }, { n: 'Abonnement', ico: '📱' }, { n: 'Autre', ico: '📦' },
]

interface Props {
  t: Theme; uid: string; group: Group | null; members: Member[]
  createGroup: (name: string, myName: string) => Promise<any>
  joinGroup: (code: string, myName: string) => Promise<any>
  leaveGroup: () => Promise<void>
  txs: Transaction[]; reload?: () => void
}

export const Groupe = ({ t, uid, group, members, createGroup, joinGroup, leaveGroup, txs, reload }: Props) => {
  const [mode, setMode] = useState<string | null>(null)
  const [gName, setGName] = useState('')
  const [myName, setMyName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  // Add expense states
  const [addAmt, setAddAmt] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addCat, setAddCat] = useState('Courses')
  const [addPaid, setAddPaid] = useState(uid)
  const [saving, setSaving] = useState(false)
  const [pendingSettle, setPendingSettle] = useState<{ fromId: string; toId: string; amount: number } | null>(null)

  const submit = async () => {
    if (mode === 'create' && (!gName || !myName)) { setErr('Remplis tous les champs'); return; }
    if (mode === 'join' && (!code || !myName)) { setErr('Remplis tous les champs'); return; }
    setLoading(true); setErr('')
    const res = mode === 'create' ? await createGroup(gName, myName) : await joinGroup(code, myName)
    setLoading(false)
    if (res && res.error) { setErr(res.error.message || 'Erreur'); return; }
    setMode(null)
  }

  const saveExpense = async () => {
    const n = parseFloat(addAmt.replace(',', '.'))
    if (!n || n <= 0) return
    setSaving(true)
    const cat = CAT_COMMUNE.find(c => c.n === addCat) || CAT_COMMUNE[0]
    await db.from('transactions').insert({
      user_id: uid, merchant: addNote || addCat, category: addCat,
      icon: cat.ico, amount: -n, account_id: null,
      tx_date: isoLocal(new Date()),
      group_id: group!.id, paid_by: addPaid,
    })
    setSaving(false)
    setShowAdd(false); setAddAmt(''); setAddNote('')
    if (reload) reload()
  }

  const settleUp = (fromId: string, toId: string, amount: number) => setPendingSettle({ fromId, toId, amount })
  const doSettle = async () => {
    const { fromId, amount } = pendingSettle!
    setPendingSettle(null)
    await db.from('transactions').insert({
      user_id: uid, merchant: 'Remboursement', category: 'Remboursement',
      icon: '💸', amount: amount, account_id: null,
      tx_date: isoLocal(new Date()),
      group_id: group!.id, paid_by: fromId,
    })
    if (reload) reload()
  }

  // ── No group: setup screens ───────────────────────────────
  if (!group) {
    if (!mode) return (
      <div style={{ padding: '0 20px', animation: 'fadeIn .3s ease' }}>
        <div style={{ padding: '8px 0 24px' }}>
          <div style={{ fontSize: 17, ...sp('s', 700), color: t.tx }}>Dépenses communes</div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 4 }}>Partagez les dépenses du foyer 50/50</div>
        </div>
        <button onClick={() => setMode('create')} style={{ width: '100%', padding: '20px', borderRadius: 16, textAlign: 'left', cursor: 'pointer', background: t.mD, border: '1px solid ' + t.mint + '44', marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
          <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Créer le foyer</div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 4 }}>Invitez votre partenaire avec un code</div>
        </button>
        <button onClick={() => setMode('join')} style={{ width: '100%', padding: '20px', borderRadius: 16, textAlign: 'left', cursor: 'pointer', background: t.card, border: '1px solid ' + t.bo }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
          <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Rejoindre un foyer</div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 4 }}>Entrez le code de votre partenaire</div>
        </button>
      </div>
    )
    return (
      <div style={{ padding: '0 20px', animation: 'fadeIn .3s ease' }}>
        <button onClick={() => { setMode(null); setErr('') }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', ...sp('o'), fontSize: 13, color: t.sub, padding: '8px 0 20px' }}>
          <Icon n="back" sz={14} c={t.sub} /> Retour
        </button>
        <div style={{ fontSize: 16, ...sp('s', 700), color: t.tx, marginBottom: 20 }}>{mode === 'create' ? 'Créer le foyer' : 'Rejoindre un foyer'}</div>
        {mode === 'create' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Nom du foyer</div>
            <input value={gName} onChange={e => setGName(e.target.value)} placeholder="ex: Lory & Clairis"
              style={{ width: '100%', padding: '12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none' }} />
          </div>
        )}
        {mode === 'join' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Code d'invitation</div>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="A3F7K2" maxLength={6}
              style={{ width: '100%', padding: '12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('m', 600), fontSize: 22, letterSpacing: 6, color: t.mintText, textAlign: 'center', outline: 'none' }} />
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Ton prénom</div>
          <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="Lory"
            style={{ width: '100%', padding: '12px 14px', background: t.el, border: '1.5px solid ' + t.bo, borderRadius: 12, ...sp('o'), fontSize: 14, color: t.tx, outline: 'none' }} />
        </div>
        {err && <div style={{ padding: '10px', borderRadius: 10, background: t.rD, border: '1px solid ' + t.rose + '44', marginBottom: 14, ...sp('o'), fontSize: 13, color: t.dangerText }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setMode(null); setErr('') }} style={{ flex: 1, padding: '14px', background: 'none', border: '1px solid ' + t.bo, borderRadius: 14, cursor: 'pointer', ...sp('o', 600), fontSize: 14, color: t.sub }}>
            Annuler
          </button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: '14px', background: loading ? t.el : t.primary, border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer', ...sp('o', 700), fontSize: 14, color: loading ? t.sub : '#fff' }}>
            {loading ? '...' : (mode === 'create' ? 'Créer' : 'Rejoindre')}
          </button>
        </div>
      </div>
    )
  }

  // ── Group exists: main view ───────────────────────────────
  const gTxs = txs.filter(tx => tx.group_id === group.id)
  const n = members.length || 2

  // Calculate balances
  const bals: Record<string, { name: string; paid: number; share: number }> = {}
  members.forEach(m => { bals[m.user_id] = { name: m.display_name, paid: 0, share: 0 } })
  gTxs.filter(tx => tx.amt < 0).forEach(tx => {
    const a = Math.abs(tx.amt)
    if (bals[tx.paid_by!]) bals[tx.paid_by!].paid += a
    Object.keys(bals).forEach(id => { bals[id].share += a / n })
  })
  // Positive settlements
  gTxs.filter(tx => tx.amt > 0).forEach(tx => {
    if (bals[tx.paid_by!]) bals[tx.paid_by!].paid += tx.amt
    Object.keys(bals).forEach(id => { bals[id].share += tx.amt / n })
  })

  const results = Object.entries(bals).map(([id, b]) => ({
    id, name: b.name, net: parseFloat((b.paid - b.share).toFixed(2)), isMe: id === uid
  }))

  const totalCommun = gTxs.filter(tx => tx.amt < 0).reduce((s, tx) => s + Math.abs(tx.amt), 0)
  const myShare = totalCommun / n

  // Who owes whom
  const creditor = results.find(r => r.net > 0)
  const debtor = results.find(r => r.net < 0)
  const balance = creditor ? Math.abs(creditor.net) : 0

  return (
    <div style={{ padding: '0 20px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 16px' }}>
        <div>
          <div style={{ fontSize: 17, ...sp('s', 700), color: t.tx }}>{group.name}</div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>{members.map(m => m.display_name).join(' & ')}</div>
        </div>
        <button onClick={() => setShowCode(s => !s)} style={{ padding: '7px 12px', borderRadius: 10, background: t.mD, border: '1px solid ' + t.mint + '44', cursor: 'pointer', ...sp('m', 600), fontSize: 11, color: t.mintText }}>
          {showCode ? group.invite_code : 'Code'}
        </button>
      </div>

      {showCode && (
        <div style={{ padding: '14px', background: t.mD, borderRadius: 14, border: '1px solid ' + t.mint + '44', marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginBottom: 6 }}>Partage ce code à ton partenaire</div>
          <div style={{ fontSize: 30, ...sp('m', 700), color: t.mintText, letterSpacing: 8 }}>{group.invite_code}</div>
        </div>
      )}

      {/* Balance principale */}
      <div style={{ padding: '20px', background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, marginBottom: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Balance du foyer</div>
        {balance === 0 ? (
          <div>
            <div style={{ fontSize: 36 }}>🎉</div>
            <div style={{ fontSize: 15, ...sp('s', 600), color: t.mintText, marginTop: 8 }}>Vous êtes quittes !</div>
            <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginTop: 4 }}>Total commun : {fmtS(totalCommun)}</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, ...sp('o'), color: t.sub, marginBottom: 6 }}>
              {debtor ? debtor.name : '?'} doit à {creditor ? creditor.name : '?'}
            </div>
            <div style={{ fontSize: 42, ...sp('m', 300), color: t.dangerText, lineHeight: 1 }}>{fmt(balance)}</div>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 6 }}>Total commun : {fmtS(totalCommun)} · Part : {fmtS(myShare)}/pers</div>
            {debtor && debtor.isMe && (
              <button onClick={() => settleUp(debtor.id, creditor ? creditor.id : '', balance)}
                style={{ marginTop: 14, padding: '10px 24px', borderRadius: 12, background: t.primary, border: 'none', cursor: 'pointer', ...sp('o', 700), fontSize: 13, color: '#fff' }}>
                💸 J'ai remboursé {fmt(balance)}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chacun a payé */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {results.map((r, i) => (
          <div key={i} style={{ flex: 1, padding: '14px', background: r.isMe ? t.mD : t.card, borderRadius: 14, border: '1px solid ' + (r.isMe ? t.mint + '44' : t.bo), textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: r.net >= 0 ? t.mint + '22' : t.rD, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <span style={{ fontSize: 16, ...sp('s', 700), color: r.net >= 0 ? t.mintText : t.dangerText }}>{r.name.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 13, ...sp('o', 500), color: t.tx }}>{r.name}{r.isMe && <span style={{ fontSize: 10, color: t.mintText }}> (moi)</span>}</div>
            <div style={{ fontSize: 16, ...sp('m', 600), color: r.net >= 0 ? t.mintText : t.dangerText, marginTop: 4 }}>
              {r.net >= 0 ? '+' : ''}{fmt(r.net)}
            </div>
            <div style={{ fontSize: 10, ...sp('o'), color: t.sub, marginTop: 2 }}>{r.net >= 0 ? 'à recevoir' : 'à rembourser'}</div>
          </div>
        ))}
      </div>

      {/* Add expense button */}
      <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 14, marginBottom: 14, background: t.primary, border: 'none', cursor: 'pointer', ...sp('o', 700), fontSize: 14, color: '#fff' }}>
        <Icon n="plus" sz={16} c="#fff" />Ajouter une dépense commune
      </button>

      {/* Recent transactions */}
      {gTxs.filter(tx => tx.amt < 0).length > 0 && (
        <div>
          <div style={{ fontSize: 10, ...sp('s', 700), letterSpacing: 1.5, color: t.muted, textTransform: 'uppercase', marginBottom: 10 }}>Dépenses récentes</div>
          {gTxs.filter(tx => tx.amt < 0).slice(0, 8).map(tx => {
            const p = members.find(m => m.user_id === tx.paid_by)
            return (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid ' + t.bo }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: t.el, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{tx.ico}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, ...sp('o', 500), color: t.tx }}>{tx.m}</div>
                  <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>Payé par {p ? p.display_name : '?'} · {fmt(Math.abs(tx.amt) / n)}/pers</div>
                </div>
                <div style={{ fontSize: 14, ...sp('m', 500), color: t.tx }}>{fmt(Math.abs(tx.amt))}</div>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={leaveGroup} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 20, padding: '11px', borderRadius: 12, cursor: 'pointer', background: 'none', border: '1px solid ' + t.bo, ...sp('o'), fontSize: 12, color: t.muted }}>
        Quitter le foyer
      </button>

      {/* Add expense sheet */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: t.card, borderRadius: '22px 22px 0 0', padding: '0 20px 36px', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp .28s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}><div style={{ width: 36, height: 4, borderRadius: 2, background: t.bo }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '6px 14px', borderRadius: 10, background: t.el, border: 'none', cursor: 'pointer', ...sp('o', 600), fontSize: 13, color: t.sub }}>Annuler</button>
              <span style={{ fontSize: 14, ...sp('s', 600), color: t.tx }}>Dépense commune</span>
              <div style={{ width: 70 }} />
            </div>
            {/* Amount */}
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: 18 }}>
              <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 46, ...sp('m', 300), color: addAmt ? t.tx : t.muted, lineHeight: 1 }}>{addAmt || '0,00'}</span>
                <span style={{ fontSize: 20, ...sp('m', 300), color: t.sub }}> €</span>
                <span style={{ fontSize: 42, ...sp('m', 300), color: t.mintText, animation: 'blink 1s infinite', lineHeight: 1 }}>|</span>
              </div>
              <input type="number" min="0" step="0.01" value={addAmt} onChange={e => setAddAmt(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }} />
            </div>
            {/* Note */}
            <div style={{ padding: '11px 13px', background: t.el, borderRadius: 12, marginBottom: 14, border: '1px solid ' + t.bo }}>
              <input value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="Description (optionnel)…"
                style={{ width: '100%', background: 'none', border: 'none', outline: 'none', ...sp('o'), fontSize: 14, color: t.tx }} />
            </div>
            {/* Categories */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 6 }}>Catégorie</div>
              <div style={{ maxHeight: 140, overflowY: 'auto', borderRadius: 12, border: '1px solid ' + t.bo }}>
                {CAT_COMMUNE.map((c, i) => (
                  <button key={c.n} onClick={() => setAddCat(c.n)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px',
                    background: addCat === c.n ? t.mint + '18' : i % 2 === 0 ? t.card : t.el + '88',
                    border: 'none', borderBottom: i < CAT_COMMUNE.length - 1 ? '1px solid ' + t.bo : 'none',
                    cursor: 'pointer', textAlign: 'left'
                  }}>
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{c.ico}</span>
                    <span style={{ fontSize: 13, ...sp('o', addCat === c.n ? 600 : 400), color: addCat === c.n ? t.mintText : t.tx, flex: 1 }}>{c.n}</span>
                    {addCat === c.n && <span style={{ fontSize: 12, color: t.mintText }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
            {/* Who paid */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: .6, textTransform: 'uppercase', marginBottom: 8 }}>Qui a payé ?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {members.map(m => (
                  <button key={m.user_id} onClick={() => setAddPaid(m.user_id)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', background: addPaid === m.user_id ? t.mint + '22' : t.el, outline: addPaid === m.user_id ? '1.5px solid ' + t.mint + '55' : 'none' }}>
                    <div style={{ fontSize: 20, ...sp('s', 700), color: addPaid === m.user_id ? t.mintText : t.sub }}>{m.display_name.charAt(0).toUpperCase()}</div>
                    <div style={{ fontSize: 12, ...sp('o', 500), color: addPaid === m.user_id ? t.mintText : t.sub, marginTop: 4 }}>{m.display_name}</div>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveExpense} disabled={saving || !addAmt} style={{ width: '100%', padding: '15px', background: saving || !addAmt ? t.el : t.primary, border: 'none', borderRadius: 16, cursor: saving || !addAmt ? 'default' : 'pointer', ...sp('o', 700), fontSize: 15, color: saving || !addAmt ? t.sub : '#fff' }}>
              {saving ? 'Enregistrement…' : 'Ajouter · ' + fmt(parseFloat(addAmt || '0') / 2) + ' /pers'}
            </button>
          </div>
        </div>
      )}
      {pendingSettle && <ConfirmDialog t={t} message={'Enregistrer un remboursement de ' + fmt(pendingSettle.amount) + ' ?'} onConfirm={doSettle} onCancel={() => setPendingSettle(null)} />}
    </div>
  )
}
