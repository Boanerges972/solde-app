import { useState } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData } from '../../types'

interface Props { D: AppData; t: Theme; onClose: () => void; onTransfer: (p: any) => Promise<any> }

export const TransferEntry = ({ D, t, onClose, onTransfer }: Props) => {
  const[fromId,setFromId]=useState(D.accounts[0]?.id||'');
  const[toId,setToId]=useState(D.accounts[1]?.id||D.accounts[0]?.id||'');
  const[amount,setAmount]=useState('');
  const[note,setNote]=useState('');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');

  const fromAcc=D.accounts.find(a=>a.id===fromId);
  const toAcc=D.accounts.find(a=>a.id===toId);
  const n=parseFloat((amount||'0').replace(',','.'));
  const afterFrom=fromAcc?fromAcc.bal-n:0;
  const afterTo=toAcc?toAcc.bal+n:0;

  const swap=()=>{setFromId(toId);setToId(fromId);};

  const save=async()=>{
    if(!n||n<=0){setErr('Montant invalide');return;}
    if(fromId===toId){setErr('Choisir deux comptes différents');return;}
    if(fromAcc&&afterFrom<-fromAcc.bal*2){setErr('Solde insuffisant');return;}
    setSaving(true);setErr('');
    const res=await onTransfer({fromId,toId,amount:n,note:note.trim()});
    setSaving(false);
    if(res?.error){setErr(res.error);}else{onClose();}
  };

  return(
    <div style={{position:'absolute',inset:0,zIndex:100,
      background:'rgba(0,0,0,0.65)',backdropFilter:'blur(10px)',
      display:'flex',flexDirection:'column',justifyContent:'flex-end',
      animation:'fadeIn .2s ease'}} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="te-title"
        onClick={e=>e.stopPropagation()}
        style={{background:t.card,borderRadius:'28px 28px 0 0',
          padding:'0 20px 36px',animation:'slideUp .28s ease',
          maxHeight:'90vh',overflowY:'auto'}}>

        {/* Handle */}
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <button onClick={onClose}
            style={{padding:'6px 14px',borderRadius:10,background:t.el,border:'none',
              cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span aria-hidden="true" style={{fontSize:18}}>🔄</span>
            <span id="te-title" style={{fontSize:14,...sp('s',600),color:t.tx}}>Virement interne</span>
          </div>
          <div style={{width:70}}/>
        </div>

        {/* Montant */}
        <div style={{position:'relative',textAlign:'center',marginBottom:24}}>
          <div style={{display:'inline-flex',alignItems:'baseline',gap:2}}>
            <span style={{fontSize:46,...sp('m',300),color:amount?t.tx:t.muted,lineHeight:1}}>
              {amount||'0,00'}
            </span>
            <span style={{fontSize:20,...sp('m',300),color:t.sub}}> €</span>
            <span style={{fontSize:42,...sp('m',300),color:t.mintText,animation:'blink 1s infinite',lineHeight:1}}>|</span>
          </div>
          <input type="number" min="0" step="0.01" value={amount}
            aria-label="Montant du virement en euros"
            onChange={e=>{setAmount(e.target.value);setErr('');}}
            style={{position:'absolute',opacity:0,width:'100%',height:'100%',top:0,left:0,cursor:'pointer'}}/>
        </div>

        {/* Sélecteur FROM → TO avec bouton swap */}
        <div style={{position:'relative',marginBottom:16}}>
          {/* Compte source */}
          <div style={{fontSize:10,...sp('s',700),color:t.sub,letterSpacing:1,
            textTransform:'uppercase',marginBottom:6}}>De</div>
          <div style={{display:'flex',gap:6,marginBottom:4}}>
            {D.accounts.map(a=>(
              <button key={a.id} onClick={()=>{
                  setFromId(a.id);
                  if(a.id===toId)setToId(D.accounts.find(x=>x.id!==a.id)?.id||'');
                }}
                style={{flex:1,padding:'10px 8px',borderRadius:14,cursor:'pointer',
                  textAlign:'center',border:'none',
                  background:fromId===a.id?a.col+'22':t.el,
                  outline:fromId===a.id?'1.5px solid '+a.col+'66':'none',
                  opacity:a.id===toId&&fromId!==a.id?0.5:1}}>
                <div style={{width:8,height:8,borderRadius:4,background:a.col,margin:'0 auto 4px'}}/>
                <div style={{fontSize:11,...sp('o',600),
                  color:fromId===a.id?a.col:t.sub,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                <div style={{fontSize:10,...sp('m'),color:a.bal<0?t.rose:t.muted,marginTop:2}}>
                  {a.bal<0?'−':''}{fmt(Math.abs(a.bal),0)}
                </div>
              </button>
            ))}
          </div>

          {/* Bouton swap */}
          <div style={{display:'flex',justifyContent:'center',margin:'4px 0'}}>
            <button onClick={swap}
              style={{width:36,height:36,borderRadius:18,background:t.el,
                border:'1px solid '+t.bo,cursor:'pointer',fontSize:18,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              ⇅
            </button>
          </div>

          {/* Compte destination */}
          <div style={{fontSize:10,...sp('s',700),color:t.sub,letterSpacing:1,
            textTransform:'uppercase',marginBottom:6}}>Vers</div>
          <div style={{display:'flex',gap:6}}>
            {D.accounts.map(a=>(
              <button key={a.id} onClick={()=>{
                  setToId(a.id);
                  if(a.id===fromId)setFromId(D.accounts.find(x=>x.id!==a.id)?.id||'');
                }}
                style={{flex:1,padding:'10px 8px',borderRadius:14,cursor:'pointer',
                  textAlign:'center',border:'none',
                  background:toId===a.id?a.col+'22':t.el,
                  outline:toId===a.id?'1.5px solid '+a.col+'66':'none',
                  opacity:a.id===fromId&&toId!==a.id?0.5:1}}>
                <div style={{width:8,height:8,borderRadius:4,background:a.col,margin:'0 auto 4px'}}/>
                <div style={{fontSize:11,...sp('o',600),
                  color:toId===a.id?a.col:t.sub,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                <div style={{fontSize:10,...sp('m'),color:a.bal<0?t.rose:t.muted,marginTop:2}}>
                  {a.bal<0?'−':''}{fmt(Math.abs(a.bal),0)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Simulation après virement */}
        {n>0&&fromId!==toId&&(
          <div style={{padding:'12px 14px',borderRadius:14,background:t.el,
            border:'1px solid '+t.bo,marginBottom:14}}>
            <div style={{fontSize:10,...sp('s',700),color:t.sub,letterSpacing:1,
              textTransform:'uppercase',marginBottom:10}}>Simulation après virement</div>
            <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
              {[
                {acc:fromAcc,after:afterFrom,dir:'−'},
                {acc:toAcc,after:afterTo,dir:'+'},
              ].filter((x): x is {acc: NonNullable<typeof fromAcc>; after: number; dir: string} => !!x.acc).map(({acc,after,dir})=>(
                <div key={acc.id} style={{flex:1,padding:'10px',borderRadius:12,
                  background:after<0?t.rD:t.card,
                  border:'1px solid '+(after<0?t.rose+'33':t.bo)}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
                    <div style={{width:6,height:6,borderRadius:3,background:acc.col}}/>
                    <span style={{fontSize:11,...sp('o',600),color:acc.col}}>{acc.name}</span>
                  </div>
                  <div style={{fontSize:13,...sp('m',600),
                    color:after<0?t.rose:t.tx,lineHeight:1}}>
                    {after<0?'−':''}{fmt(Math.abs(after),0)}
                  </div>
                  <div style={{fontSize:10,...sp('o'),color:t.muted,marginTop:3}}>
                    {dir}{fmt(n,0)}
                    {after<0&&<span style={{color:t.dangerText}}> ⚠ découvert</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note optionnelle */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',
          background:t.el,borderRadius:12,marginBottom:14,border:'1px solid '+t.bo}}>
          <input value={note} onChange={e=>setNote(e.target.value)}
            placeholder="Motif du virement (optionnel)…"
            style={{flex:1,background:'none',border:'none',outline:'none',
              ...sp('o'),fontSize:14,color:t.tx}}/>
        </div>

        {/* Rappel : hors budget */}
        <div style={{padding:'9px 12px',borderRadius:12,background:t.mD,
          border:'1px solid '+t.mint+'33',marginBottom:14,
          display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:15}}>ℹ️</span>
          <span style={{fontSize:12,...sp('o'),color:t.mintText}}>
            Ce virement ne compte pas dans tes dépenses hebdomadaires
          </span>
        </div>

        {err&&(
          <div style={{padding:'10px 14px',borderRadius:12,background:t.rD,
            border:'1px solid '+t.rose+'44',marginBottom:14,
            ...sp('o',600),fontSize:13,color:t.dangerText}}>{err}</div>
        )}

        <button onClick={save} disabled={saving||!n||fromId===toId}
          style={{width:'100%',padding:'16px',border:'none',borderRadius:18,cursor:'pointer',
            background:saving||!n||fromId===toId?t.el:'linear-gradient(135deg,#4D96FF,#2563EB)',
            ...sp('o',700),fontSize:15,
            color:saving||!n||fromId===toId?t.sub:'#fff'}}>
          {saving?'Traitement…':'Effectuer le virement'}
        </button>
      </div>
    </div>
  );
};
