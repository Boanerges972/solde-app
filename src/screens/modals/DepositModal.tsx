import { useState } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Account } from '../../types'

const CATS = [
  { n: 'Salaire', ico: '💼' },
  { n: 'Remboursement', ico: '↩️' },
  { n: 'Virement reçu', ico: '🔄' },
  { n: 'Autre entrée', ico: '💰' },
]

interface Props {
  account: Account
  t: Theme
  onClose: () => void
  onSave: (p: { merchant: string; category: string; icon: string; amount: number; account_id: string }) => Promise<any>
}

export const DepositModal = ({ account, t, onClose, onSave }: Props) => {
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [cat, setCat] = useState(CATS[0])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const n = parseFloat(amount.replace(',', '.').replace(/\s/g, ''))

  const handleKey = (k: string) => {
    if (k === '⌫') { setAmount(s => s.slice(0, -1)); return }
    if (k === ',' && amount.includes(',')) return
    if (amount === '0' && k !== ',') { setAmount(k); return }
    setAmount(s => (s + k).slice(0, 10))
  }

  const save = async () => {
    if (!n || n <= 0) { setErr('Saisis un montant valide'); return }
    setSaving(true)
    const e = await onSave({
      merchant: label.trim() || cat.n,
      category: cat.n,
      icon: cat.ico,
      amount: n,
      account_id: account.id,
    })
    setSaving(false)
    if (e) { setErr(e.message); return }
    onClose()
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9',',','0','⌫']

  return (
    <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(12px)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.card,borderRadius:'24px 24px 0 0',padding:'0 20px 36px',animation:'slideUp .28s ease'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:10,background:t.el,border:'none',cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:14,...sp('s',700),color:t.tx}}>Ajouter des fonds</div>
            <div style={{fontSize:11,...sp('o'),color:t.sub}}>{account.name}</div>
          </div>
          <div style={{width:70}}/>
        </div>

        {/* Montant affiché */}
        <div style={{textAlign:'center',marginBottom:16}}>
          <div style={{fontSize:42,...sp('m',300),color:amount?t.mintText:t.muted,letterSpacing:1,minHeight:52}}>
            {amount ? '+' + fmt(n || 0) : '0,00 €'}
          </div>
          <div style={{fontSize:12,...sp('o'),color:t.sub,marginTop:2}}>
            Solde actuel : {fmt(account.bal)} → <span style={{color:t.mintText}}>{fmt((account.bal||0)+(n||0))}</span>
          </div>
        </div>

        {/* Catégories */}
        <div style={{display:'flex',gap:6,marginBottom:14,overflowX:'auto',paddingBottom:4}}>
          {CATS.map(c=>(
            <button key={c.n} onClick={()=>setCat(c)}
              style={{flexShrink:0,padding:'6px 12px',borderRadius:50,border:'none',cursor:'pointer',
                background:cat.n===c.n?t.mD:t.el,...sp('o',500),fontSize:12,
                color:cat.n===c.n?t.mintText:t.sub,
                outline:cat.n===c.n?'1.5px solid '+t.mint:'none'}}>
              {c.ico} {c.n}
            </button>
          ))}
        </div>

        {/* Label optionnel */}
        <input
          type="text" value={label} onChange={e=>setLabel(e.target.value)}
          placeholder={cat.n + ' (optionnel)'}
          style={{width:'100%',padding:'10px 14px',background:t.el,border:'1.5px solid '+t.bo,
            borderRadius:12,...sp('o'),fontSize:14,color:t.tx,outline:'none',marginBottom:14}}
        />

        {/* Pavé numérique */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
          {KEYS.map(k=>(
            <button key={k} onClick={()=>handleKey(k)}
              style={{padding:'16px 0',borderRadius:14,border:'none',cursor:'pointer',
                background:k==='⌫'?t.rD:t.el,
                ...(k==='⌫'?{color:t.dangerText}:{color:t.tx}),
                fontSize:k==='⌫'?18:20,...sp('m',400)}}>
              {k}
            </button>
          ))}
        </div>

        {err&&<div role="alert" style={{padding:'8px 12px',borderRadius:10,background:t.rD,border:'1px solid '+t.rose+'44',marginBottom:10,...sp('o'),fontSize:13,color:t.dangerText}}>{err}</div>}

        <button onClick={save} disabled={saving||!n}
          style={{width:'100%',padding:'15px',background:(!n||saving)?t.el:t.primary,
            border:'none',borderRadius:14,cursor:(!n||saving)?'not-allowed':'pointer',
            ...sp('o',700),fontSize:16,color:(!n||saving)?t.sub:'#fff'}}>
          {saving?'Enregistrement…':'Confirmer le dépôt'}
        </button>
      </div>
    </div>
  )
}
