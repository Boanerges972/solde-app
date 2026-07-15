import { useState } from 'react'
import { db } from '../../lib/supabase'
import { rpcSetBalance } from '../../lib/rpc'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Account } from '../../types'

interface Props {
  account: Account | null; isNew: boolean
  t: Theme; uid: string
  onClose: () => void; onSaved: () => void
}

const ACOLS = ['#10E8C0','#FF6584','#F5A623','#6B7FD7','#50C8A0','#E87040','#C084FC','#60A5FA']

export const EditAccount = ({ account, isNew, t, uid, onClose, onSaved }: Props) => {
  const [name, setName] = useState(account ? account.name : '')
  const [type, setType] = useState(account ? account.type : 'Courant')
  const [bal, setBal] = useState(account ? String(account.bal) : '')
  const [col, setCol] = useState(account ? account.col : '#10E8C0')
  const [overdraft, setOverdraft] = useState(account ? String(parseFloat(localStorage.getItem('qdq-od-' + (account?.id || '')) || '0')) : '0')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const save = async () => {
    if (!name.trim()) { setErr('Donne un nom'); return }
    const balance = parseFloat(String(bal).replace(',', '.').replace(/\s/g, ''))
    if (isNaN(balance)) { setErr('Solde invalide (ex: -983.50 ou 1560.75)'); return }
    setSaving(true)
    let accId = account?.id ?? ''
    if (isNew) {
      accId = name.toLowerCase().replace(/\s+/g, '_') + '_' + uid.slice(0, 6) + '_' + Math.random().toString(36).slice(2, 6)
      const { error } = await db.from('accounts').insert({
        id: accId, name: name.trim(), short_name: name.trim().slice(0, 4),
        balance, free: balance, type, color: col, user_id: uid, reserved: 0,
      })
      if (error) { setSaving(false); setErr(error.message); return }
    } else {
      // Colonnes éditables uniquement — balance/free NE passent PLUS en direct
      // (interdites côté client après Section 7 ; override du solde via RPC).
      const { error: uErr } = await db.from('accounts')
        .update({ name: name.trim(), short_name: name.trim().slice(0, 4), type, color: col })
        .eq('id', account!.id)
      if (uErr) { setSaving(false); setErr(uErr.message); return }
      if (balance !== account!.bal) {
        const { error: bErr } = await rpcSetBalance({ accountId: account!.id, balance })
        if (bErr) { setSaving(false); setErr(bErr.message); return }
      }
    }
    setSaving(false)
    const odKey = 'qdq-od-' + accId
    const odVal = parseFloat(overdraft || '0')
    if (odVal > 0) { localStorage.setItem(odKey, String(odVal)) }
    else { localStorage.removeItem(odKey) }
    await onSaved(); onClose()
  }

  const doDelete = async () => {
    await db.from('accounts').delete().eq('id', account!.id)
    await onSaved(); onClose()
  }

  return (
    <div style={{position:'absolute',inset:0,zIndex:200,background:'rgba(0,0,0,0.65)',backdropFilter:'blur(10px)',display:'flex',flexDirection:'column',justifyContent:'flex-end',animation:'fadeIn .2s ease'}} onClick={onClose}>
      <div role="dialog" aria-modal={true} aria-labelledby="ea-title" onClick={e=>e.stopPropagation()} style={{background:t.card,borderRadius:'28px 28px 0 0',padding:'0 20px 36px',maxHeight:'90vh',overflowY:'auto',animation:'slideUp .28s ease'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}><div style={{width:36,height:4,borderRadius:2,background:t.bo}}/></div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:10,background:t.el,border:'none',cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
          <span id="ea-title" style={{fontSize:15,...sp('s',700),color:t.tx}}>{isNew?'Nouveau compte':'Modifier'}</span>
          {!isNew
            ?<button onClick={()=>setConfirmDel(true)} style={{padding:'6px 12px',borderRadius:8,background:t.rD,border:'1px solid '+t.rose+'33',cursor:'pointer',...sp('o',600),fontSize:12,color:t.dangerText}}>Supprimer</button>
            :<div style={{width:70}}/>
          }
        </div>
        <div style={{marginBottom:14}}>
          <label htmlFor="acc-nom" style={{display:'block',fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:6}}>Nom</label>
          <input id="acc-nom" type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="ex: Compte courant"
            style={{width:'100%',padding:'12px 14px',background:t.el,border:'1.5px solid '+t.bo,borderRadius:12,...sp('o'),fontSize:14,color:t.tx,outline:'none'}}/>
        </div>
        <div style={{marginBottom:14}}>
          <label htmlFor="acc-bal" style={{display:'block',fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:6}}>Solde (€)</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button aria-label={String(bal).startsWith('-')?'Passer en positif':'Passer en négatif'}
              onClick={()=>setBal(s=>s.startsWith('-')?s.slice(1):'-'+s)}
              style={{width:44,height:44,borderRadius:12,flexShrink:0,border:'1.5px solid '+t.bo,
              background:String(bal).startsWith('-')?t.rD:t.el,cursor:'pointer',
              fontSize:20,color:String(bal).startsWith('-')?t.rose:t.sub}}>
              {String(bal).startsWith('-')?'−':'+'}
            </button>
            <input id="acc-bal" type="text" inputMode="decimal" value={bal} onChange={e=>setBal(e.target.value)} placeholder="0.00"
              style={{flex:1,padding:'12px 14px',background:t.el,border:'1.5px solid '+t.bo,borderRadius:12,...sp('m'),fontSize:18,color:String(bal).startsWith('-')?t.rose:t.mint,outline:'none'}}/>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Type</div>
          <div role="group" aria-label="Type de compte" style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['Courant','Charges','Épargne','Joint','Pro'].map(tp=>(
              <button key={tp} onClick={()=>setType(tp)} aria-pressed={type===tp}
                style={{padding:'7px 13px',borderRadius:50,border:'none',cursor:'pointer',background:type===tp?col+'22':t.el,...sp('o',500),fontSize:12,color:type===tp?col:t.sub}}>
                {tp}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <div id="acc-col-label" style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Couleur</div>
          <div role="group" aria-labelledby="acc-col-label" style={{display:'flex',gap:10}}>
            {ACOLS.map(c=>(
              <button key={c} onClick={()=>setCol(c)} aria-label={'Couleur '+c} aria-pressed={col===c}
                style={{width:30,height:30,borderRadius:15,background:c,border:'none',cursor:'pointer',outline:col===c?'3px solid '+t.tx:'3px solid transparent',outlineOffset:2}}>
                {col===c&&<span aria-hidden="true" style={{color:'#000',fontSize:12,lineHeight:'30px'}}>✓</span>}
              </button>
            ))}
          </div>
        </div>
        {/* Découvert autorisé */}
        <div style={{marginBottom:20}}>
          <label htmlFor="acc-od" style={{display:'block',fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:6}}>
            Découvert autorisé (€)
          </label>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span aria-hidden="true" style={{fontSize:22,color:t.amber}}>⚠</span>
            <input id="acc-od" type="number" min="0" step="50" value={overdraft}
              onChange={e=>setOverdraft(e.target.value)} placeholder="0"
              style={{flex:1,padding:'12px 14px',background:t.el,border:'1.5px solid '+t.bo,
                borderRadius:12,...sp('m'),fontSize:16,color:t.amber,outline:'none'}}/>
          </div>
          <div style={{fontSize:11,...sp('o'),color:t.muted,marginTop:6,lineHeight:1.4}}>
            Laisse 0 si ton compte n'a pas de découvert autorisé.
            Ce montant s'ajoute à ton solde dans le calcul de l'ARD.
          </div>
          {parseFloat(overdraft)>0&&(
            <div style={{marginTop:8,padding:'8px 12px',borderRadius:10,
              background:t.aD,border:'1px solid '+t.amber+'44'}}>
              <span style={{fontSize:12,...sp('o',600),color:t.amber}}>
                Seuil de rejet : {fmt(parseFloat(bal||'0')+parseFloat(overdraft))} disponibles
              </span>
            </div>
          )}
        </div>
        {err&&<div role="alert" style={{padding:'10px',borderRadius:10,background:t.rD,border:'1px solid '+t.rose+'44',marginBottom:12,...sp('o'),fontSize:13,color:t.dangerText}}>{err}</div>}
        <button onClick={save} disabled={saving} style={{width:'100%',padding:'14px',background:saving?t.el:'linear-gradient(135deg,'+col+','+col+'CC)',border:'none',borderRadius:14,cursor:saving?'wait':'pointer',...sp('o',700),fontSize:15,color:saving?t.sub:'#fff'}}>
          {saving?'Enregistrement…':(isNew?'Créer':'Enregistrer')}
        </button>
      </div>
      {confirmDel&&<ConfirmDialog t={t} message={'Supprimer le compte "'+name+'" ?'} onConfirm={doDelete} onCancel={()=>setConfirmDel(false)}/>}
    </div>
  )
}
