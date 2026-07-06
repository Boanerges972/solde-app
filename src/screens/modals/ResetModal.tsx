import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import type { Theme } from '../../types'

interface Props { t: Theme; uid: string; onClose: () => void; onDone: () => void }

export const ResetModal = ({ t, uid, onClose, onDone }: Props) => {
  const [step, setStep] = useState(1) // 1=avertissement 2=confirmation 3=en cours 4=done
  const [typed, setTyped] = useState('')
  const CONFIRM_WORD = 'SUPPRIMER'

  const doReset = async () => {
    setStep(3)
    try {
      // Supprimer toutes les données de l'utilisateur en parallèle
      await Promise.all([
        db.from('transactions').delete().eq('user_id', uid),
        db.from('accounts').delete().eq('user_id', uid),
        db.from('weekly_budgets').delete().eq('user_id', uid),
        db.from('next_debits').delete().eq('user_id', uid),
      ])
      // Supprimer les données du foyer si membre
      const { data: gm } = await db.from('group_members').select('group_id').eq('user_id', uid).limit(1)
      if (gm && gm[0]) {
        await db.from('group_members').delete().eq('user_id', uid)
      }
      // Vider le localStorage (sauf préférences UI)
      const keep = ['qdq-dark','qdq-profile','qdq-period','qdq-alert-threshold',
        'qdq-lock-after','qdq-pin-enabled','qdq-pin-hash','qdq-bio-enabled']
      Object.keys(localStorage).forEach(k => {
        if (!keep.includes(k)) localStorage.removeItem(k)
      })
      setStep(4)
      setTimeout(() => { onDone(); onClose() }, 1800)
    } catch (e: any) {
      setStep(1)
      alert('Erreur : ' + e.message)
    }
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:600,background:'rgba(0,0,0,0.85)',
      backdropFilter:'blur(16px)',display:'flex',flexDirection:'column',
      justifyContent:'center',alignItems:'center',padding:24}}
      onClick={step<3?onClose:undefined}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:t.card,borderRadius:24,padding:'28px 24px',
          width:'100%',maxWidth:340,border:'1px solid '+t.rose+'44'}}>

        {/* ── ÉTAPE 1 : Avertissement ── */}
        {step===1&&(
          <>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:52,marginBottom:12}}>🗑️</div>
              <div style={{fontSize:18,...sp('s',700),color:t.rose,marginBottom:8}}>
                Remise à zéro
              </div>
              <div style={{fontSize:13,...sp('o'),color:t.sub,lineHeight:1.6}}>
                Cette action va supprimer <span style={{color:t.rose,...sp('o',700)}}>définitivement</span> :
              </div>
            </div>
            {['Toutes tes transactions','Tous tes comptes','Ton budget hebdomadaire',
              'Tes prélèvements configurés','Les données du foyer partagé'].map((item,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,
                padding:'8px 0',borderBottom:'1px solid '+t.bo}}>
                <span style={{fontSize:14,color:t.rose,flexShrink:0}}>✕</span>
                <span style={{fontSize:13,...sp('o'),color:t.sub}}>{item}</span>
              </div>
            ))}
            <div style={{marginTop:14,padding:'10px 12px',borderRadius:12,
              background:t.mD,border:'1px solid '+t.mint+'33',marginBottom:20}}>
              <span style={{fontSize:12,...sp('o',600),color:t.mintText}}>
                ✓ Ton compte et tes préférences sont conservés
              </span>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={onClose}
                style={{flex:1,padding:'13px',borderRadius:14,background:t.el,
                  border:'none',cursor:'pointer',...sp('o',600),fontSize:14,color:t.sub}}>
                Annuler
              </button>
              <button onClick={()=>setStep(2)}
                style={{flex:1,padding:'13px',borderRadius:14,background:t.rD,
                  border:'1px solid '+t.rose+'44',cursor:'pointer',
                  ...sp('o',700),fontSize:14,color:t.rose}}>
                Continuer →
              </button>
            </div>
          </>
        )}

        {/* ── ÉTAPE 2 : Confirmation par frappe ── */}
        {step===2&&(
          <>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:42,marginBottom:10}}>⚠️</div>
              <div style={{fontSize:16,...sp('s',700),color:t.tx,marginBottom:8}}>
                Confirmation requise
              </div>
              <div style={{fontSize:13,...sp('o'),color:t.sub,lineHeight:1.6}}>
                Tape <span style={{color:t.rose,...sp('m',700),
                  letterSpacing:1}}>{CONFIRM_WORD}</span> pour confirmer
              </div>
            </div>
            <input value={typed}
              onChange={e=>setTyped(e.target.value.toUpperCase())}
              placeholder={CONFIRM_WORD}
              autoFocus
              style={{width:'100%',padding:'14px',background:t.el,
                border:'2px solid '+(typed===CONFIRM_WORD?t.rose:t.bo),
                borderRadius:14,...sp('m',600),fontSize:18,color:t.rose,
                outline:'none',textAlign:'center',letterSpacing:2,marginBottom:16}}/>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setStep(1);setTyped('');}}
                style={{flex:1,padding:'13px',borderRadius:14,background:t.el,
                  border:'none',cursor:'pointer',...sp('o',600),fontSize:14,color:t.sub}}>
                ‹ Retour
              </button>
              <button onClick={doReset}
                disabled={typed!==CONFIRM_WORD}
                style={{flex:1,padding:'13px',borderRadius:14,cursor:'pointer',
                  ...sp('o',700),fontSize:14,
                  background:typed===CONFIRM_WORD?t.rose:t.el,
                  color:typed===CONFIRM_WORD?'#fff':t.muted,
                  border:'none',transition:'all .2s'}}>
                🗑 Supprimer
              </button>
            </div>
          </>
        )}

        {/* ── ÉTAPE 3 : En cours ── */}
        {step===3&&(
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:48,marginBottom:16,animation:'pulse 1s ease infinite'}}>⏳</div>
            <div style={{fontSize:16,...sp('s',600),color:t.tx,marginBottom:8}}>
              Suppression en cours…
            </div>
            <div style={{fontSize:13,...sp('o'),color:t.muted}}>
              Ne ferme pas l'application
            </div>
          </div>
        )}

        {/* ── ÉTAPE 4 : Terminé ── */}
        {step===4&&(
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:52,marginBottom:16}}>✅</div>
            <div style={{fontSize:16,...sp('s',700),color:t.tx,marginBottom:8}}>
              Base de données vidée
            </div>
            <div style={{fontSize:13,...sp('o'),color:t.muted}}>
              L'application va se rafraîchir…
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
