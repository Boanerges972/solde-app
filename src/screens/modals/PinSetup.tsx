import { useState, useEffect } from 'react'
import { sp } from '../../lib/theme'
import { bioAvailable, registerBiometric, checkPin, savePin, clearPin } from '../../lib/pin'
import type { Theme } from '../../types'
import type { User } from '@supabase/supabase-js'

interface Props { t: Theme; user: User | null; onClose: () => void }

export const PinSetup = ({ t, user, onClose }: Props) => {
  const pinOn = localStorage.getItem('qdq-pin-enabled') === '1'
  const bioOn = localStorage.getItem('qdq-bio-enabled') === '1'
  const [step, setStep] = useState(pinOn ? 'menu' : 'new1')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [cur, setCur] = useState('')
  const [err, setErr] = useState('')
  const [bioAvail, setBioAvail] = useState(false)
  const [loading, setLoading] = useState(false)
  const isIOS = /iphone|ipad/i.test(navigator.userAgent)

  useEffect(() => { bioAvailable().then(setBioAvail) }, [])

  const Pad = ({ value, onChange, label }: { value: string; onChange: React.Dispatch<React.SetStateAction<string>>; label: string }) => {
    const keys = ['1','2','3','4','5','6','7','8','9','','0','del']
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:'8px 0'}}>
        <div style={{fontSize:13,...sp('o'),color:t.sub,textAlign:'center'}}>{label}</div>
        <div style={{display:'flex',gap:14}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:14,height:14,borderRadius:7,
              background:i<value.length?t.mint:t.el,
              boxShadow:i<value.length?'0 0 6px '+t.mint+'66':'none',
              transition:'background .15s'}}/>
          ))}
        </div>
        {err&&<div style={{fontSize:12,...sp('o',600),color:t.rose}}>{err}</div>}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,width:240}}>
          {keys.map((k,i)=>{
            if (k==='') return <div key={i}/>
            if (k==='del') return (
              <button key={i} onClick={()=>{setErr('');onChange(v=>v.slice(0,-1));}}
                style={{height:62,borderRadius:16,background:t.el,border:'1px solid '+t.bo,
                  cursor:'pointer',fontSize:20,color:t.sub,display:'flex',
                  alignItems:'center',justifyContent:'center'}}>
                ⌫
              </button>
            )
            return (
              <button key={i} onClick={()=>{setErr('');if(value.length<4)onChange(v=>v+k);}}
                style={{height:62,borderRadius:16,background:t.el,border:'1px solid '+t.bo,
                  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:22,...sp('o',400),color:t.tx}}>{k}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  useEffect(() => { if (step==='new1' && pin1.length===4) { setErr(''); setStep('new2') } }, [pin1, step])
  useEffect(() => {
    if (step==='new2' && pin2.length===4) {
      if (pin2===pin1) {
        savePin(pin1).then(() => { setStep('ok'); setTimeout(onClose, 1400) })
      } else {
        setErr('Codes differents')
        setTimeout(() => { setPin2(''); setErr('') }, 700)
      }
    }
  }, [pin2, step, pin1])
  useEffect(() => {
    if (step==='disable' && cur.length===4) {
      checkPin(cur).then(ok => {
        if (ok) { clearPin(); onClose() }
        else { setErr('Code incorrect'); setTimeout(() => { setCur(''); setErr('') }, 700) }
      })
    }
  }, [cur, step])

  const enableBio = async () => {
    setLoading(true); setErr('')
    try {
      await registerBiometric(user?.id || 'qdq')
      setStep('biook'); setTimeout(onClose, 1400)
    } catch (e) { setErr('Biometrie non disponible sur cet appareil') }
    setLoading(false)
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,0.7)',
      backdropFilter:'blur(12px)',display:'flex',flexDirection:'column',
      justifyContent:'flex-end'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.card,
        borderRadius:'22px 22px 0 0',padding:'20px 24px 40px',
        animation:'slideUp .28s ease',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>

        {step==='menu'&&(
          <div>
            <div style={{fontSize:16,...sp('s',700),color:t.tx,marginBottom:4,textAlign:'center'}}>
              Securite
            </div>
            <div style={{fontSize:12,...sp('o'),color:t.sub,marginBottom:20,textAlign:'center'}}>
              Code PIN actif
            </div>
            {([
              {label:'Changer le code PIN',icon:'🔢',action:()=>{setPin1('');setPin2('');setStep('new1');}},
              (bioAvail&&!bioOn)?{label:isIOS?'Activer Face ID':'Activer Touch ID',icon:'🔒',action:enableBio}:null,
              bioOn?{label:'Desactiver la biometrie',icon:'❌',action:()=>{localStorage.removeItem('qdq-bio-enabled');localStorage.removeItem('qdq-biometric-credid');onClose();}}:null,
              {label:'Desactiver le code PIN',icon:'🔓',action:()=>{setCur('');setStep('disable');}},
            ] as Array<{label:string;icon:string;action:()=>void}|null>).filter(Boolean).map((item,i)=>(
              <button key={i} onClick={item!.action}
                style={{display:'flex',alignItems:'center',gap:12,width:'100%',
                  padding:'14px',background:t.el,borderRadius:14,
                  border:'1px solid '+t.bo,marginBottom:10,cursor:'pointer',textAlign:'left'}}>
                <span style={{fontSize:20}}>{item!.icon}</span>
                <span style={{fontSize:14,...sp('o',500),color:t.tx}}>{item!.label}</span>
              </button>
            ))}
            <button onClick={onClose} style={{width:'100%',padding:'13px',background:'none',
              border:'1px solid '+t.bo,borderRadius:14,cursor:'pointer',
              ...sp('o',600),fontSize:14,color:t.sub,marginTop:4}}>Fermer</button>
          </div>
        )}
        {step==='new1'&&<Pad value={pin1} onChange={setPin1} label="Choisissez un code a 4 chiffres"/>}
        {step==='new2'&&<Pad value={pin2} onChange={setPin2} label="Confirmez le code"/>}
        {step==='disable'&&<Pad value={cur} onChange={setCur} label="Entrez votre code actuel"/>}
        {step==='ok'&&(
          <div style={{textAlign:'center',padding:'32px 0'}}>
            <div style={{fontSize:52,marginBottom:12}}>✅</div>
            <div style={{fontSize:16,...sp('s',700),color:t.tx}}>Code PIN active !</div>
          </div>
        )}
        {step==='biook'&&(
          <div style={{textAlign:'center',padding:'32px 0'}}>
            <div style={{fontSize:52,marginBottom:12}}>{isIOS?'🔒':'☝️'}</div>
            <div style={{fontSize:16,...sp('s',700),color:t.tx}}>
              {isIOS?'Face ID active !':'Touch ID active !'}
            </div>
          </div>
        )}
        {err&&step==='menu'&&<div style={{fontSize:12,...sp('o',600),color:t.rose,textAlign:'center',marginTop:8}}>{err}</div>}
      </div>
    </div>
  )
}
