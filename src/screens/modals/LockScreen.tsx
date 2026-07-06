import { useState, useEffect } from 'react'
import { sp } from '../../lib/theme'
import { bioAvailable, authenticateBiometric, checkPin } from '../../lib/pin'
import type { Theme } from '../../types'

interface Props { t: Theme; onUnlock: () => void }

export const LockScreen = ({ t, onUnlock }: Props) => {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [msg, setMsg] = useState('')
  const [bioAvail, setBioAvail] = useState(false)
  const bioOn = localStorage.getItem('qdq-bio-enabled') === '1'

  useEffect(() => {
    bioAvailable().then(ok => setBioAvail(ok && bioOn))
    if (bioOn) tryBio()
  }, [])

  const tryBio = async () => {
    try { const ok = await authenticateBiometric(); if (ok) onUnlock() }
    catch (e) { setMsg('Biométrie annulee') }
  }

  const handleDigit = async (d: string) => {
    if (pin.length >= 4) return
    const np = pin + d
    setPin(np)
    if (np.length === 4) {
      const ok = await checkPin(np)
      if (ok) { onUnlock() }
      else {
        setShake(true); setMsg('Code incorrect')
        setTimeout(() => { setPin(''); setShake(false); setMsg('') }, 700)
      }
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','bio','0','del']
  const isIOS = /iphone|ipad/i.test(navigator.userAgent)

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:t.bg,
      display:'flex',flexDirection:'column',alignItems:'center',
      justifyContent:'center',
      paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
      <div style={{marginBottom:40,textAlign:'center'}}>
        <div style={{fontSize:36,...sp('s',700),color:t.mintText,letterSpacing:-1.5}}>QDQ</div>
        <div style={{fontSize:13,...sp('o'),color:t.sub,marginTop:4}}>Entrez votre code</div>
      </div>
      <div style={{display:'flex',gap:18,marginBottom:14,
        animation:shake?'shake .4s ease':'none'}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:16,height:16,borderRadius:8,transition:'background .15s',
            background:i<pin.length?(shake?t.rose:t.mint):t.el,
            boxShadow:i<pin.length&&!shake?'0 0 8px '+t.mint+'88':'none'}}/>
        ))}
      </div>
      <div style={{height:20,marginBottom:24,fontSize:13,...sp('o',600),
        color:t.dangerText,opacity:msg?1:0,transition:'opacity .2s'}}>{msg}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,width:264}}>
        {keys.map((k,i)=>{
          if (k==='bio') return (
            <button key={i} onClick={bioAvail?tryBio:undefined}
              style={{height:72,borderRadius:18,background:bioAvail?t.el:'transparent',
                border:bioAvail?'1px solid '+t.bo:'none',cursor:bioAvail?'pointer':'default',
                display:'flex',flexDirection:'column',alignItems:'center',
                justifyContent:'center',gap:3}}>
              {bioAvail&&<>
                <span style={{fontSize:26}}>{isIOS?'🔒':'☝️'}</span>
                <span style={{fontSize:9,...sp('o',600),color:t.sub}}>{isIOS?'Face ID':'Touch ID'}</span>
              </>}
            </button>
          )
          if (k==='del') return (
            <button key={i} onClick={()=>setPin(p=>p.slice(0,-1))}
              style={{height:72,borderRadius:18,background:t.el,border:'1px solid '+t.bo,
                cursor:'pointer',fontSize:22,color:t.sub,display:'flex',
                alignItems:'center',justifyContent:'center'}}>
              ⌫
            </button>
          )
          return (
            <button key={i} onClick={()=>handleDigit(k)}
              style={{height:72,borderRadius:18,background:t.el,border:'1px solid '+t.bo,
                cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontSize:26,...sp('o',400),color:t.tx}}>{k}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
