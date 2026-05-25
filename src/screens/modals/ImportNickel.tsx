import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { Ic } from '../../components/Icon'
import type { Theme, Account } from '../../types'

interface Props { t: Theme; uid: string; accounts: Account[]; onClose: () => void; onImported: () => void }

const NICKEL_CATS: Record<string, string[]> = {
  'Courses':['LEADER PRICE','CARREFOUR','GARDEN K','STORES AL','AU SUCRE','COFFEA','BGD','MTZ TRADING','MARCHE','SUPERMARCHE','MONOPRIX','LECLERC','INTERMARCHE','LIDL','ALDI','CASINO'],
  'Restaurant':['TAKEWAY','FOODBT','TI DELICE','YUTSO','GABAN','TRD LES ROCHERS','SAS TAMARA','RESTAURANT','BRASSERIE','SNACK','BURGER','PIZZA','SUSHI','KFC','MCDO','DOMINO','SUBWAY'],
  'Abonnement':['NETFLIX','DEEZER','MICROSOFT','APPLE.COM','GOOGLE PLAY','CRUNCHYROLL','DISNEY','ORANGE','FREE','SFR','BOUYGUES','AMAZON PRIME','SPOTIFY','CANAL'],
  'Transport':['DAB','SNCF','RATP','UBER','BOLT','TAXI','PARKING','ESSENCE','TOTAL','BP','SHELL'],
  'Santé':['PHARMACIE','PHIE','CGSS','MEDECIN','DOCTEUR','HOPITAL','CLINIQUE','MUTUELLE','CPAM'],
  'Sport':['FITNESS','KELEN','OXYZEN','SALLE DE SPORT','GYM','PISCINE','SPORT'],
  'Loyer':['GESTIMMO','LOYER','AGENCE','IMMOBILIER','SCI','SYNDIC'],
  'Cinéma':['CINEMA','CINE'],
  'Salaire':['SALAIRE','GF CONSULTING','GF CONSULT'],
};

const NICKEL_ICONS: Record<string, string> = {
  'Courses':'🛒','Restaurant':'🍽️','Abonnement':'📱','Transport':'🚗',
  'Santé':'💊','Sport':'💪','Loyer':'🏠','Cinéma':'🎬','Salaire':'💰',
  'Virement':'💸','Prélèvement':'🏦','Autre':'📦'
};

function categorizeNickel(libelle: string, typeOp: string): string {
  const l=(libelle+' '+typeOp).toUpperCase();
  for(const[cat,keywords] of Object.entries(NICKEL_CATS)){
    if(keywords.some(k=>l.includes(k)))return cat;
  }
  if(l.includes('VIREMENT'))return 'Virement';
  if(l.includes('PRELEVEMENT'))return 'Prélèvement';
  return 'Autre';
}

interface NickelTx {
  dt: string; merchant: string; category: string;
  icon: string; amount: number; type: string;
}

function parseNickelPDF(text: string): NickelTx[] {
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const transactions: NickelTx[]=[];

  const dateRe=/^(\d{2}\/\d{2}\/\d{4})$/;

  let i=0;
  while(i<lines.length){
    const l=lines[i];
    if(dateRe.test(l)&&i>0){
      const type=lines[i+1]||'';
      let libelle='';
      let amount: string|null=null;
      let j=i+2;
      while(j<lines.length&&j<i+8){
        const candidate=lines[j].replace(/\s/g,'').replace(',','.');
        const numVal=parseFloat(candidate.replace(/[^-\d.]/g,''));
        if((lines[j].includes('€')||/^-?[\d\s]+,\d{2}$/.test(lines[j]))&&!isNaN(numVal)&&numVal!==0){
          amount=lines[j].replace(/[€\s]/g,'').replace(',','.');
          break;
        }
        if(!dateRe.test(lines[j])&&lines[j]!==type){
          libelle+=(libelle?' ':'')+lines[j];
        }
        j++;
      }
      if(amount&&!isNaN(parseFloat(amount))){
        const[d,m,y]=l.split('/');
        const isoDate=y+'-'+m+'-'+d;
        const cat=categorizeNickel(libelle,type);
        transactions.push({
          dt:isoDate,
          merchant:libelle.substring(0,50)||type,
          category:cat,
          icon:NICKEL_ICONS[cat]||'📦',
          amount:parseFloat(amount),
          type
        });
        i=j+1;
        continue;
      }
    }
    i++;
  }
  return transactions;
}

export const ImportNickel = ({t,uid,accounts,onClose,onImported}: Props) => {
  const[step,setStep]=useState('upload');
  const[txs,setTxs]=useState<NickelTx[]>([]);
  const[selected,setSelected]=useState<Record<number,boolean>>({});
  const[accId,setAccId]=useState(accounts[0]?accounts[0].id:'');
  const[loading,setLoading]=useState(false);
  const[progress,setProgress]=useState(0);
  const[err,setErr]=useState('');

  const handleFile=async(file: File|null|undefined)=>{
    if(!file)return;
    setErr('');setLoading(true);
    try{
      if(!(window as any).pdfjsLib){
        await new Promise<void>((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload=()=>res();s.onerror=rej;
          document.head.appendChild(s);
        });
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const ab=await file.arrayBuffer();
      const pdf=await (window as any).pdfjsLib.getDocument({data:ab}).promise;
      let fullText='';
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const tc=await page.getTextContent();
        const items=(tc.items as any[]).sort((a,b)=>{
          const yDiff=Math.round(b.transform[5]/3)*3-Math.round(a.transform[5]/3)*3;
          return yDiff!==0?yDiff:a.transform[4]-b.transform[4];
        });
        fullText+=items.map((i:any)=>i.str).join('\n')+'\n';
      }
      const parsed=parseNickelPDF(fullText);
      if(parsed.length===0){
        setErr('Aucune transaction trouvée. Vérifiez que c\'est bien un relevé Nickel.');
        setLoading(false);return;
      }
      const sel: Record<number,boolean>={};
      parsed.forEach((_,i)=>sel[i]=true);
      setTxs(parsed);setSelected(sel);setStep('preview');
    }catch(e: any){
      setErr('Erreur lecture PDF: '+e.message);
    }
    setLoading(false);
  };

  const doImport=async()=>{
    const toImport=txs.filter((_,i)=>selected[i]);
    if(!toImport.length)return;
    setLoading(true);setProgress(0);
    let done=0;
    for(const tx of toImport){
      await db.from('transactions').insert({
        user_id:uid,merchant:tx.merchant,category:tx.category,
        icon:tx.icon,amount:tx.amount,account_id:accId,
        tx_date:tx.dt,group_id:null,paid_by:null,
      });
      done++;setProgress(Math.round(done/toImport.length*100));
    }
    const{data:allTxs}=await db.from('transactions')
      .select('amount').eq('account_id',accId).eq('user_id',uid);
    if(allTxs&&allTxs.length){
      const newBal=allTxs.reduce((s,tx)=>s+parseFloat((tx as any).amount),0);
      await db.from('accounts').update({balance:parseFloat(newBal.toFixed(2)),free:parseFloat(newBal.toFixed(2))})
        .eq('id',accId).eq('user_id',uid);
    }
    setLoading(false);setStep('done');
    setTimeout(()=>{onImported();onClose();},1500);
  };

  const incomeCount=txs.filter((_,i)=>selected[i]&&txs[i].amount>0).length;
  const expCount=txs.filter((_,i)=>selected[i]&&txs[i].amount<0).length;
  const totalDebits=txs.filter((_,i)=>selected[i]&&txs[i].amount<0).reduce((s,tx)=>s+Math.abs(tx.amount),0);

  return(
    <div style={{position:'fixed',inset:0,zIndex:500,background:t.bg,display:'flex',flexDirection:'column',animation:'fadeIn .2s ease'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 20px',borderBottom:'1px solid '+t.bo,flexShrink:0}}>
        <button onClick={onClose} style={{background:t.el,border:'none',borderRadius:10,padding:'8px',cursor:'pointer',display:'flex'}}>
          <Ic n="back" sz={18} c={t.tx}/>
        </button>
        <div>
          <div style={{fontSize:15,...sp('s',600),color:t.tx}}>Import Nickel</div>
          <div style={{fontSize:11,...sp('o'),color:t.sub}}>
            {step==='upload'?'Sélectionne ton relevé PDF':step==='preview'?txs.length+' transactions trouvées':'Import terminé !'}
          </div>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
        {/* STEP: UPLOAD */}
        {step==='upload'&&(
          <div>
            <label style={{display:'block',padding:'32px 20px',borderRadius:16,border:'2px dashed '+t.mint+'55',textAlign:'center',cursor:'pointer',background:t.mD,marginBottom:20}}>
              <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFile(e.target.files?.[0])}/>
              <div style={{fontSize:40,marginBottom:12}}>{loading?'⏳':'📄'}</div>
              <div style={{fontSize:15,...sp('s',600),color:t.tx,marginBottom:6}}>
                {loading?'Lecture en cours…':'Glisser ou sélectionner le PDF'}
              </div>
              <div style={{fontSize:12,...sp('o'),color:t.sub}}>Relevé de compte Nickel · PDF uniquement</div>
            </label>
            {err&&<div style={{padding:'12px',borderRadius:12,background:t.rD,border:'1px solid '+t.rose+'44',...sp('o'),fontSize:13,color:t.rose,marginBottom:12}}>{err}</div>}
            <div style={{padding:'16px',background:t.card,borderRadius:14,border:'1px solid '+t.bo}}>
              <div style={{fontSize:12,...sp('s',600),color:t.sub,marginBottom:10}}>Comment exporter depuis Nickel ?</div>
              {['Ouvre l\'app Nickel ou espace.nickel.eu','Va dans Mon compte → Relevés','Télécharge le relevé du mois voulu','Importe-le ici'].map((s,i)=>(
                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:8}}>
                  <div style={{width:20,height:20,borderRadius:10,background:t.mD,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:10,...sp('m',700),color:t.mint}}>{i+1}</span>
                  </div>
                  <span style={{fontSize:12,...sp('o'),color:t.sub,lineHeight:1.5}}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP: PREVIEW */}
        {step==='preview'&&(
          <div>
            {/* Summary */}
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              {[[expCount+' dépenses',fmt(totalDebits),t.rose,t.rD],[incomeCount+' entrées','',t.mint,t.mD]].map(([lb,val,col,bg],i)=>(
                <div key={i} style={{flex:1,padding:'12px',background:bg as string,borderRadius:12,border:'1px solid '+(col as string)+'33'}}>
                  <div style={{fontSize:11,...sp('o'),color:col as string}}>{lb}</div>
                  {val&&<div style={{fontSize:16,...sp('m',600),color:t.tx,marginTop:2}}>{val}</div>}
                </div>
              ))}
            </div>
            {/* Account selector */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Importer dans le compte</div>
              <div style={{display:'flex',gap:6}}>
                {accounts.map(a=>(
                  <button key={a.id} onClick={()=>setAccId(a.id)} style={{flex:1,padding:'9px 6px',borderRadius:10,border:'none',cursor:'pointer',background:accId===a.id?a.col+'22':t.el,outline:accId===a.id?'1.5px solid '+a.col+'55':'none'}}>
                    <div style={{fontSize:12,...sp('o',600),color:accId===a.id?a.col:t.tx}}>{a.short}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* Select all */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:12,...sp('o'),color:t.sub}}>{Object.values(selected).filter(Boolean).length} sélectionnées</span>
              <button onClick={()=>{
                const all=Object.values(selected).every(Boolean);
                const ns: Record<number,boolean>={};txs.forEach((_,i)=>ns[i]=!all);setSelected(ns);
              }} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,...sp('o',600),color:t.mint}}>
                {Object.values(selected).every(Boolean)?'Tout désélectionner':'Tout sélectionner'}
              </button>
            </div>
            {/* Transaction list */}
            {txs.map((tx,i)=>(
              <div key={i} onClick={()=>setSelected(s=>({...s,[i]:!s[i]}))}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                  borderRadius:12,marginBottom:6,cursor:'pointer',
                  background:selected[i]?t.card:t.el,
                  border:'1px solid '+(selected[i]?t.bo:'transparent'),
                  opacity:selected[i]?1:.5}}>
                <div style={{fontSize:20,flexShrink:0}}>{tx.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,...sp('o',500),color:t.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.merchant}</div>
                  <div style={{fontSize:11,...sp('o'),color:t.sub,marginTop:1}}>{tx.category} · {tx.dt.split('-').reverse().join('/')}</div>
                </div>
                <div style={{fontSize:13,...sp('m',500),color:tx.amount<0?t.tx:t.mint,flexShrink:0}}>
                  {tx.amount<0?'−':'+' }{fmt(Math.abs(tx.amount))}
                </div>
                <div style={{width:18,height:18,borderRadius:9,flexShrink:0,
                  background:selected[i]?t.mint:t.bo,
                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {selected[i]&&<span style={{fontSize:10,color:'#0F1117',fontWeight:700}}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP: DONE */}
        {step==='done'&&(
          <div style={{textAlign:'center',paddingTop:60}}>
            <div style={{fontSize:56,marginBottom:16}}>✅</div>
            <div style={{fontSize:18,...sp('s',700),color:t.tx}}>Import terminé !</div>
            <div style={{fontSize:13,...sp('o'),color:t.sub,marginTop:8}}>{Object.values(selected).filter(Boolean).length} transactions importées</div>
          </div>
        )}
      </div>

      {/* Footer */}
      {step==='preview'&&(
        <div style={{padding:'16px 20px',borderTop:'1px solid '+t.bo,flexShrink:0}}>
          {loading?(
            <div>
              <div style={{height:6,background:t.el,borderRadius:3,overflow:'hidden',marginBottom:8}}>
                <div style={{width:progress+'%',height:'100%',background:t.mint,borderRadius:3,transition:'width .3s ease'}}/>
              </div>
              <div style={{textAlign:'center',fontSize:12,...sp('o'),color:t.sub}}>Import en cours… {progress}%</div>
            </div>
          ):(
            <div style={{display:'flex',gap:10}}>
              <button onClick={onClose} style={{flex:1,padding:'15px',background:'none',border:'1px solid '+t.bo,borderRadius:14,cursor:'pointer',...sp('o',600),fontSize:14,color:t.sub}}>
                Annuler
              </button>
              <button onClick={doImport} style={{flex:2,padding:'15px',background:t.primary,border:'none',borderRadius:14,cursor:'pointer',...sp('o',700),fontSize:14,color:'#0F1117'}}>
                Importer ({Object.values(selected).filter(Boolean).length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
