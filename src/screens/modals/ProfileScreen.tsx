import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { setCurrency } from '../../lib/currency'
import type { Theme, Profile } from '../../types'
import type { User } from '@supabase/supabase-js'

const AVATARS = ['😊','😎','🤠','🧑','👩','👨','🦸','🧙','🏄','🎯','🚀','🌟','🦁','🐯','🦊','🐧']
const CURRENCIES = [
  {code:'EUR',sym:'€',label:'Euro',pos:'after' as const,dec:','},
  {code:'USD',sym:'$',label:'Dollar US',pos:'before' as const,dec:'.'},
  {code:'GBP',sym:'£',label:'Livre sterling',pos:'before' as const,dec:'.'},
  {code:'XOF',sym:'FCFA',label:'Franc CFA',pos:'after' as const,dec:','},
  {code:'CHF',sym:'CHF',label:'Franc suisse',pos:'after' as const,dec:'.'},
  {code:'CAD',sym:'CA$',label:'Dollar canadien',pos:'before' as const,dec:'.'},
  {code:'MAD',sym:'DH',label:'Dirham marocain',pos:'after' as const,dec:','},
  {code:'TND',sym:'DT',label:'Dinar tunisien',pos:'after' as const,dec:','},
]

interface Props {
  t: Theme
  user: User | null
  onClose: () => void
  onSaved: (p: Profile) => void
}

export const ProfileScreen = ({ t, user, onClose, onSaved }: Props) => {
  const saved = JSON.parse(localStorage.getItem('qdq-profile') || '{}')
  const [name, setName] = useState(saved.name || user?.email?.split('@')[0] || '')
  const [avatar, setAvatar] = useState(saved.avatar || '😊')
  const [currency, setCurrencyState] = useState(saved.currency || 'EUR')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)

  const save = async () => {
    setSaving(true)
    const profile: Profile = { name: name.trim() || 'Utilisateur', avatar, currency }
    localStorage.setItem('qdq-profile', JSON.stringify(profile))
    // Apply currency globally
    const cur = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]
    setCurrency(cur)
    // Save name to Supabase user metadata
    await db.auth.updateUser({ data: { name: name.trim() } })
    setSaving(false); setOk(true)
    setTimeout(() => { setOk(false); onSaved && onSaved(profile) }, 1200)
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:500,background:t.bg,display:'flex',flexDirection:'column',animation:'fadeIn .2s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid '+t.bo,flexShrink:0}}>
        <button onClick={onClose} style={{padding:'6px 14px',borderRadius:10,background:t.el,border:'none',cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
        <span style={{fontSize:15,...sp('s',600),color:t.tx}}>Mon profil</span>
        <button onClick={save} disabled={saving||ok}
          style={{padding:'6px 14px',borderRadius:10,border:'none',cursor:'pointer',...sp('o',700),fontSize:13,
          background:ok?t.mD:saving?t.el:'linear-gradient(135deg,'+t.mint+',#08C4A0)',
          color:ok?t.mint:saving?t.sub:'#0F1117'}}>
          {ok?'✓ Sauvé':saving?'…':'Sauver'}
        </button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'24px 20px'}}>
        {/* Avatar + name */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:28}}>
          <div style={{width:80,height:80,borderRadius:40,background:t.mD,
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:42,marginBottom:12,
            border:'2px solid '+t.mint+'44'}}>
            {avatar}
          </div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ton prénom"
            style={{textAlign:'center',background:'none',border:'none',outline:'none',
              ...sp('s',700),fontSize:22,color:t.tx,width:'100%'}}/>
          <div style={{fontSize:11,...sp('o'),color:t.muted,marginTop:4}}>{user?.email}</div>
        </div>

        {/* Avatar picker */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:10}}>Avatar</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:8}}>
            {AVATARS.map(a=>(
              <button key={a} onClick={()=>setAvatar(a)} style={{
                width:'100%',aspectRatio:'1',borderRadius:12,border:'none',cursor:'pointer',
                fontSize:22,background:avatar===a?t.mD:t.el,
                outline:avatar===a?'2px solid '+t.mint:'2px solid transparent',
                transition:'all .15s'}}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Currency */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:10}}>Devise</div>
          <div style={{borderRadius:14,border:'1px solid '+t.bo,overflow:'hidden'}}>
            {CURRENCIES.map((c,i)=>(
              <button key={c.code} onClick={()=>setCurrencyState(c.code)} style={{
                display:'flex',alignItems:'center',width:'100%',padding:'12px 14px',
                background:currency===c.code?t.mD:i%2===0?t.card:t.el+'88',
                border:'none',borderBottom:i<CURRENCIES.length-1?'1px solid '+t.bo:'none',
                cursor:'pointer',textAlign:'left'}}>
                <div style={{width:40,height:28,borderRadius:6,background:currency===c.code?t.mint+'22':t.el,
                  display:'flex',alignItems:'center',justifyContent:'center',marginRight:12,flexShrink:0}}>
                  <span style={{fontSize:12,...sp('m',700),color:currency===c.code?t.mint:t.sub}}>{c.sym}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,...sp('o',500),color:currency===c.code?t.tx:t.sub}}>{c.label}</div>
                  <div style={{fontSize:10,...sp('m'),color:t.muted,marginTop:1}}>
                    {c.pos==='before'?c.sym+' 1 234,56':'1 234,56 '+c.sym}
                  </div>
                </div>
                {currency===c.code&&<span style={{color:t.mint,fontSize:16}}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
