import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { Ic } from '../../components/Icon'
import type { Theme, Account } from '../../types'

interface Props { t: Theme; uid: string; accounts: Account[]; bank: 'cm' | 'qonto'; onClose: () => void; onImported: () => void; onCreateAccount?: () => void }

const CM_CATS: Record<string, string[]> = {
  'Courses':['CARREFOUR','LEADER PRICE','CASINO','LECLERC','INTERMARCHE','LIDL','ALDI','MONOPRIX','SUPERMARCHE','MARCHE'],
  'Loyer':['LOYER','GESTIMMO','IMMOBILIER','SCI','SYNDIC','HABITAT'],
  'Santé':['PHARMACIE','PHIE','MUTUELLE','COMPLEMENTAIRE SANTE','CGSS','MEDECIN','CPAM','SECU'],
  'Assurance':['ASSURANCE','HABITATION','AUTO','MMA','AXA','ALLIANZ','MAIF'],
  'Abonnement':['EDF','SGDE','ENEDIS','VEOLIA','EAU','GAZ','ORANGE','FREE','SFR','BOUYGUES','NETFLIX','SPOTIFY','AMAZON'],
  'Transport':['SNCF','RATP','UBER','TAXI','ESSENCE','TOTAL','BP','SHELL','CARBURANT'],
  'Banque':['COTIS','FRAIS','AGIOS','COMMISSION'],
  'Restaurant':['RESTAURANT','BRASSERIE','SNACK','PIZZA','BURGER','SUSHI'],
  'Sport':['FITNESS','SALLE DE SPORT','GYM','PISCINE'],
};
const QONTO_CATS: Record<string, string[]> = {
  'Abonnement':['APPLE','GOOGLE','MICROSOFT','NETFLIX','SPOTIFY','AMAZON','ADOBE','DROPBOX','SLACK','ZOOM'],
  'Courses':['CARREFOUR','LEADER','CASINO','LECLERC'],
  'Restaurant':['RESTAURANT','BRASSERIE','UBER EATS','DELIVEROO'],
  'Transport':['SNCF','RATP','UBER','TAXI','ESSENCE'],
  'Santé':['PHARMACIE','MEDECIN','CPAM'],
  'Fournitures':['AMAZON','FNAC','BUREAU'],
  'Salaire':['SALAIRE','REMUNERATION'],
};

function catFromKeywords(libelle: string, catMap: Record<string, string[]>): string {
  const l=libelle.toUpperCase();
  for(const[cat,kws] of Object.entries(catMap)){
    if(kws.some(k=>l.includes(k)))return cat;
  }
  return 'Autre';
}

interface CsvTx {
  dt: string; merchant: string; category: string; icon: string; amount: number;
}

const CM_ICONS: Record<string,string>={'Courses':'🛒','Loyer':'🏠','Santé':'💊','Assurance':'🛡️','Abonnement':'📱','Transport':'🚗','Banque':'🏦','Restaurant':'🍽️','Sport':'💪','Virement':'💸','Prélèvement':'🏦','Salaire':'💰','Autre':'📦'};

function stripQuotes(s: string): string { return s.trim().replace(/^["']|["']$/g,''); }

function parseCMDate(raw: string): string|null {
  // DD/MM/YYYY or YYYY-MM-DD
  const s=raw.trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const[d,m,y]=s.split('/');return `${y}-${m}-${d}`;}
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return null;
}

function parseCM(text: string): CsvTx[] {
  // Strip BOM
  const clean=text.replace(/^﻿/,'');
  const lines=clean.split('\n').map(l=>l.trimEnd()).filter(Boolean);
  const txs: CsvTx[]=[];

  // Detect format from header row
  const header=lines[0]?lines[0].split(';').map(stripQuotes).map(h=>h.toLowerCase()):[];
  // Format A: Date;Valeur;Montant;Libellé;Solde (5 cols, signed amount at col 2)
  // Format B: Date;DateValeur;Débit;Crédit;Libellé;Solde (6 cols, separate debit/credit)
  // Format C: Date;DateValeur;Montant;Libellé;Référence;IBAN;Solde;Catégorie (8 cols)
  // Auto-detect: look for header keywords or fall back to column count heuristic

  const hasDebitCredit=header.some(h=>h.includes('débit')||h.includes('debit'));
  const amtIdx=header.findIndex(h=>h.includes('montant'));
  const libIdx=header.findIndex(h=>h.includes('libel')||h.includes('opération')||h.includes('operation'));
  const debitIdx=header.findIndex(h=>h.includes('débit')||h.includes('debit'));
  const creditIdx=header.findIndex(h=>h.includes('crédit')||h.includes('credit'));
  const catIdx=header.findIndex(h=>h.includes('catégor')||h.includes('categor'));

  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(';').map(stripQuotes);
    if(cols.length<3)continue;

    const dateRaw=cols[0];
    const dt=parseCMDate(dateRaw);
    if(!dt)continue;

    let libelle='';
    let amount=NaN;

    if(header.length>=3){
      // Use header-detected indices
      libelle=libIdx>=0&&cols[libIdx]?cols[libIdx]:'';
      if(hasDebitCredit&&debitIdx>=0&&creditIdx>=0){
        const d=cols[debitIdx]?.replace(',','.').replace('+','');
        const c=cols[creditIdx]?.replace(',','.').replace('+','');
        if(d&&parseFloat(d))amount=-Math.abs(parseFloat(d));
        else if(c&&parseFloat(c))amount=Math.abs(parseFloat(c));
      }else if(amtIdx>=0&&cols[amtIdx]){
        amount=parseFloat(cols[amtIdx].replace(',','.').replace('+',''));
      }
      // fallback if indices not found
      if(!libelle)libelle=cols[3]||cols[2]||'';
      if(isNaN(amount)&&cols[2])amount=parseFloat(cols[2].replace(',','.').replace('+',''));
    }else{
      // No header — column count heuristic
      if(cols.length>=5){libelle=cols[3];amount=parseFloat(cols[2].replace(',','.').replace('+',''));}
      else if(cols.length>=4){libelle=cols[2];amount=parseFloat(cols[1].replace(',','.').replace('+',''));}
    }

    libelle=libelle.trim();
    if(!libelle||isNaN(amount)||amount===0)continue;

    const cmCat=catIdx>=0&&cols[catIdx]?cols[catIdx]:'';
    let cat='Autre';
    if(cmCat&&!['A catégoriser','Hors budget',''].includes(cmCat)){
      if(cmCat.includes('Santé'))cat='Santé';
      else if(cmCat.includes('Virement'))cat='Virement';
      else if(cmCat.includes('Frais'))cat='Banque';
      else if(cmCat.includes('Logement'))cat='Loyer';
      else if(cmCat.includes('Assurance'))cat='Assurance';
      else cat=catFromKeywords(libelle,CM_CATS);
    }else{
      cat=catFromKeywords(libelle,CM_CATS);
      if(cat==='Autre'){
        if(libelle.toUpperCase().includes('VIREMENT')||libelle.toUpperCase().includes('VIR SEPA'))cat='Virement';
        else if(libelle.toUpperCase().includes('PRELEVEMENT')||libelle.toUpperCase().includes('PRLV'))cat='Prélèvement';
        else if(libelle.toUpperCase().includes('SALAIRE'))cat='Salaire';
      }
    }
    txs.push({dt,merchant:libelle.slice(0,80),category:cat,icon:CM_ICONS[cat]||'📦',amount});
  }
  return txs;
}

function parseQonto(text: string): CsvTx[] {
  const lines=text.split('\n').filter(Boolean);
  const txs: CsvTx[]=[];
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(';');
    if(cols.length<25)continue;
    if(cols[0].trim()!=='Exécuté')continue;
    const dateRaw=cols[2].trim().substring(0,10);
    const nom=cols[22]?cols[22].trim():'';
    const montant=cols[5].trim().replace(',','.');
    if(!dateRaw||!montant)continue;
    const [d,m,y]=dateRaw.split('-');
    if(!d||!m||!y)continue;
    const amount=parseFloat(montant);
    if(isNaN(amount))continue;
    const cat=catFromKeywords(nom,QONTO_CATS);
    const icons: Record<string,string>={'Abonnement':'📱','Courses':'🛒','Restaurant':'🍽️','Transport':'🚗','Santé':'💊','Fournitures':'📦','Salaire':'💰','Autre':'📦'};
    txs.push({dt:y+'-'+m+'-'+d,merchant:nom||'Qonto',category:cat,icon:icons[cat]||'📦',amount});
  }
  return txs;
}

export const ImportCSV = ({t,uid,accounts,bank,onClose,onImported,onCreateAccount}: Props) => {
  const[step,setStep]=useState('upload');
  const[txs,setTxs]=useState<CsvTx[]>([]);
  const[selected,setSelected]=useState<Record<number,boolean>>({});
  const[accId,setAccId]=useState(accounts[0]?accounts[0].id:'');
  const[loading,setLoading]=useState(false);
  const[progress,setProgress]=useState(0);
  const[err,setErr]=useState('');
  const[newAccName,setNewAccName]=useState('');
  const[newAccType,setNewAccType]=useState('Courant');
  const[newAccColor,setNewAccColor]=useState('#10E8C0');
  const[createErr,setCreateErr]=useState('');

  const isCM=bank==='cm';
  const bankName=isCM?'Crédit Mutuel':'Qonto';
  const bankColor=isCM?'#E03030':'#21BF73';
  const bankIcon=isCM?'🏦':'⚡';

  const handleFile=async(file: File|null|undefined)=>{
    if(!file)return;
    setErr('');setLoading(true);
    try{
      const text=await new Promise<string>((res,rej)=>{
        const r=new FileReader();
        r.onload=e=>res(e.target!.result as string);
        r.onerror=rej;
        r.readAsText(file,isCM?'ISO-8859-1':'UTF-8');
      });
      const parsed=isCM?parseCM(text):parseQonto(text);
      if(!parsed.length){setErr('Aucune transaction trouvée. Vérifiez le fichier.');setLoading(false);return;}
      const sel: Record<number,boolean>={};parsed.forEach((_,i)=>sel[i]=true);
      setTxs(parsed);setSelected(sel);setStep('preview');
    }catch(e: any){setErr('Erreur: '+e.message);}
    setLoading(false);
  };

  const doImport=async()=>{
    const toImport=txs.filter((_,i)=>selected[i]);
    if(!toImport.length||!accId)return;
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

  const doCreateAndImport=async()=>{
    if(!newAccName.trim()){setCreateErr('Nom requis');return;}
    setCreateErr('');setLoading(true);setProgress(0);
    const toImport=txs.filter((_,i)=>selected[i]);
    const bal=parseFloat(toImport.reduce((s,tx)=>s+tx.amount,0).toFixed(2));
    const newId=newAccName.trim().toLowerCase().replace(/\s+/g,'_')+'_'+uid.slice(0,6)+'_'+Math.random().toString(36).slice(2,6);
    const{error}=await db.from('accounts').insert({
      id:newId,name:newAccName.trim(),short_name:newAccName.trim().slice(0,4),
      balance:bal,free:bal,type:newAccType,color:newAccColor,user_id:uid,reserved:0,
    });
    if(error){setCreateErr(error.message);setLoading(false);return;}
    let done=0;
    for(const tx of toImport){
      await db.from('transactions').insert({
        user_id:uid,merchant:tx.merchant,category:tx.category,
        icon:tx.icon,amount:tx.amount,account_id:newId,
        tx_date:tx.dt,group_id:null,paid_by:null,
      });
      done++;setProgress(Math.round(done/toImport.length*100));
    }
    setLoading(false);setStep('done');
    setTimeout(()=>{onImported();onClose();},1500);
  };

  const expCount=txs.filter((_,i)=>selected[i]&&txs[i].amount<0).length;
  const totalDebits=txs.filter((_,i)=>selected[i]&&txs[i].amount<0).reduce((s,tx)=>s+Math.abs(tx.amount),0);

  return(
    <div style={{position:'fixed',inset:0,zIndex:500,background:t.bg,display:'flex',flexDirection:'column',animation:'fadeIn .2s ease'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 20px',borderBottom:'1px solid '+t.bo,flexShrink:0}}>
        <button onClick={onClose} style={{background:t.el,border:'none',borderRadius:10,padding:'8px',cursor:'pointer',display:'flex'}}>
          <Ic n="back" sz={18} c={t.tx}/>
        </button>
        <div>
          <div style={{fontSize:15,...sp('s',600),color:t.tx}}>{bankIcon} Import {bankName}</div>
          <div style={{fontSize:11,...sp('o'),color:t.sub}}>
            {step==='upload'?'Sélectionne ton export CSV':step==='preview'?txs.length+' transactions trouvées':'Import terminé !'}
          </div>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
        {step==='upload'&&(
          <div>
            <label style={{display:'block',padding:'32px 20px',borderRadius:16,border:'2px dashed '+bankColor+'55',textAlign:'center',cursor:'pointer',background:bankColor+'11',marginBottom:20}}>
              <input type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>handleFile(e.target.files?.[0])}/>
              <div style={{fontSize:40,marginBottom:12}}>{loading?'⏳':'📊'}</div>
              <div style={{fontSize:15,...sp('s',600),color:t.tx,marginBottom:6}}>{loading?'Lecture…':'Sélectionner le fichier CSV'}</div>
              <div style={{fontSize:12,...sp('o'),color:t.sub}}>Export {bankName} · CSV</div>
            </label>
            {err&&<div style={{padding:'12px',borderRadius:12,background:t.rD,...sp('o'),fontSize:13,color:t.rose}}>{err}</div>}
            <div style={{padding:'16px',background:t.card,borderRadius:14,border:'1px solid '+t.bo}}>
              <div style={{fontSize:12,...sp('s',600),color:t.sub,marginBottom:10}}>
                {isCM?'Export Crédit Mutuel :':'Export Qonto :'}
              </div>
              {isCM
                ?['Espace client CM → Mes comptes','Sélectionner le compte','Télécharger → Format CSV','Importer ici'].map((s,i)=>(
                  <div key={i} style={{display:'flex',gap:10,marginBottom:8}}>
                    <div style={{width:20,height:20,borderRadius:10,background:bankColor+'22',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:10,...sp('m',700),color:bankColor}}>{i+1}</span>
                    </div>
                    <span style={{fontSize:12,...sp('o'),color:t.sub}}>{s}</span>
                  </div>
                ))
                :['Qonto → Transactions','Cliquer Exporter en haut à droite','Choisir CSV','Importer ici'].map((s,i)=>(
                  <div key={i} style={{display:'flex',gap:10,marginBottom:8}}>
                    <div style={{width:20,height:20,borderRadius:10,background:bankColor+'22',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:10,...sp('m',700),color:bankColor}}>{i+1}</span>
                    </div>
                    <span style={{fontSize:12,...sp('o'),color:t.sub}}>{s}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
        {step==='preview'&&(
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              <div style={{flex:1,padding:'12px',background:t.rD,borderRadius:12,border:'1px solid '+t.rose+'33'}}>
                <div style={{fontSize:11,...sp('o'),color:t.rose}}>{expCount} dépenses</div>
                <div style={{fontSize:16,...sp('m',600),color:t.tx,marginTop:2}}>{fmt(totalDebits)}</div>
              </div>
              <div style={{flex:1,padding:'12px',background:t.mD,borderRadius:12,border:'1px solid '+t.mint+'33'}}>
                <div style={{fontSize:11,...sp('o'),color:t.mint}}>Sélectionnées</div>
                <div style={{fontSize:16,...sp('m',600),color:t.tx,marginTop:2}}>{Object.values(selected).filter(Boolean).length}</div>
              </div>
            </div>
            {accounts.length>0?(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Importer dans</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {accounts.map(a=>(
                    <button key={a.id} onClick={()=>setAccId(a.id)} style={{padding:'8px 13px',borderRadius:10,border:'none',cursor:'pointer',background:accId===a.id?a.col+'22':t.el,outline:accId===a.id?'1.5px solid '+a.col+'55':'none'}}>
                      <span style={{fontSize:12,...sp('o',600),color:accId===a.id?a.col:t.tx}}>{a.short}</span>
                    </button>
                  ))}
                </div>
              </div>
            ):(
              <div style={{marginBottom:14,padding:'16px',background:t.card,borderRadius:14,border:'1px solid '+t.bo}}>
                <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:10}}>Créer le compte</div>
                <input type="text" value={newAccName} onChange={e=>setNewAccName(e.target.value)} placeholder="Nom du compte (ex: Compte courant CM)"
                  style={{width:'100%',padding:'11px 14px',background:t.el,border:'1.5px solid '+(createErr?t.rose:t.bo),borderRadius:12,...sp('o'),fontSize:14,color:t.tx,outline:'none',marginBottom:10,boxSizing:'border-box'}}/>
                {createErr&&<div style={{fontSize:12,...sp('o'),color:t.rose,marginBottom:8}}>{createErr}</div>}
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  {['Courant','Épargne','Pro'].map(tp=>(
                    <button key={tp} onClick={()=>setNewAccType(tp)} style={{padding:'7px 12px',borderRadius:10,border:'none',cursor:'pointer',...sp('o',600),fontSize:12,background:newAccType===tp?newAccColor+'33':t.el,color:newAccType===tp?newAccColor:t.sub}}>
                      {tp}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  {['#10E8C0','#FF6584','#F5A623','#6B7FD7','#50C8A0','#E87040','#C084FC','#60A5FA'].map(c=>(
                    <button key={c} onClick={()=>setNewAccColor(c)} style={{width:28,height:28,borderRadius:14,background:c,border:'none',cursor:'pointer',outline:newAccColor===c?'3px solid '+t.tx:'3px solid transparent',outlineOffset:2}}/>
                  ))}
                </div>
                <div style={{padding:'10px 12px',background:t.mD,borderRadius:10,fontSize:12,...sp('o'),color:t.mint}}>
                  💰 Solde calculé : <b>{fmt(Math.abs(txs.filter((_,i)=>selected[i]).reduce((s,tx)=>s+tx.amount,0)))}</b>
                  {txs.filter((_,i)=>selected[i]).reduce((s,tx)=>s+tx.amount,0)<0?' (débiteur)':' (créditeur)'}
                </div>
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontSize:12,...sp('o'),color:t.sub}}>{Object.values(selected).filter(Boolean).length} / {txs.length}</span>
              <button onClick={()=>{const all=Object.values(selected).every(Boolean);const ns: Record<number,boolean>={};txs.forEach((_,i)=>ns[i]=!all);setSelected(ns);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,...sp('o',600),color:t.mint}}>
                {Object.values(selected).every(Boolean)?'Tout désélectionner':'Tout sélectionner'}
              </button>
            </div>
            {txs.map((tx,i)=>(
              <div key={i} onClick={()=>setSelected(s=>({...s,[i]:!s[i]}))}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,marginBottom:6,cursor:'pointer',background:selected[i]?t.card:t.el,border:'1px solid '+(selected[i]?t.bo:'transparent'),opacity:selected[i]?1:.5}}>
                <div style={{fontSize:18,flexShrink:0}}>{tx.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,...sp('o',500),color:t.tx,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.merchant}</div>
                  <div style={{fontSize:11,...sp('o'),color:t.sub,marginTop:1}}>{tx.category} · {tx.dt.split('-').reverse().join('/')}</div>
                </div>
                <div style={{fontSize:13,...sp('m',500),color:tx.amount<0?t.tx:t.mint,flexShrink:0}}>
                  {tx.amount<0?'−':'+'}{fmt(Math.abs(tx.amount))}
                </div>
                <div style={{width:18,height:18,borderRadius:9,flexShrink:0,background:selected[i]?t.mint:t.bo,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {selected[i]&&<span style={{fontSize:10,color:'#fff',fontWeight:700}}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {step==='done'&&(
          <div style={{textAlign:'center',paddingTop:60}}>
            <div style={{fontSize:56,marginBottom:16}}>✅</div>
            <div style={{fontSize:18,...sp('s',700),color:t.tx}}>Import terminé !</div>
            <div style={{fontSize:13,...sp('o'),color:t.sub,marginTop:8}}>{Object.values(selected).filter(Boolean).length} transactions importées</div>
          </div>
        )}
      </div>
      {step==='preview'&&(
        <div style={{padding:'16px 20px',borderTop:'1px solid '+t.bo,flexShrink:0}}>
          {loading?(
            <div>
              <div style={{height:6,background:t.el,borderRadius:3,overflow:'hidden',marginBottom:8}}>
                <div style={{width:progress+'%',height:'100%',background:bankColor,borderRadius:3,transition:'width .3s ease'}}/>
              </div>
              <div style={{textAlign:'center',fontSize:12,...sp('o'),color:t.sub}}>Import… {progress}%</div>
            </div>
          ):(
            <div style={{display:'flex',gap:10}}>
              <button onClick={onClose} style={{flex:1,padding:'15px',background:'none',border:'1px solid '+t.bo,borderRadius:14,cursor:'pointer',...sp('o',600),fontSize:14,color:t.sub}}>
                Annuler
              </button>
              <button onClick={accounts.length===0?doCreateAndImport:doImport} style={{flex:2,padding:'15px',background:'linear-gradient(135deg,'+bankColor+','+bankColor+'CC)',border:'none',borderRadius:14,cursor:'pointer',...sp('o',700),fontSize:14,color:'#fff'}}>
                {accounts.length===0?'Créer & importer':'Importer'} ({Object.values(selected).filter(Boolean).length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
