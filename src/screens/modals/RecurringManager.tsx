import { useState, useMemo } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Account, Recurring, Transaction, DetectedRecurring } from '../../types'

interface Props {
  t: Theme; accounts: Account[]; recurrings: Recurring[]
  allHistory: Transaction[]; onAdd: (r: any) => Promise<any>
  onDelete: (id: string) => Promise<void>; onUpdate: (id: string, fields: any) => Promise<void>
  onClose: () => void
}

function detectRecurrings(txs: Transaction[], minMonths = 2): DetectedRecurring[] {
  // Ne garder que les dépenses (pas virements internes)
  const debits = txs.filter(tx => tx.amt < 0 && tx.cat !== 'Virement interne' && tx.m);

  // Normaliser le nom du marchand (upper, tronqué à 25 chars)
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 25);

  // Regrouper par marchand normalisé
  const map: Record<string, { name: string; key: string; txs: Transaction[]; months: Set<string>; accounts: Record<string, number> }> = {};
  debits.forEach(tx => {
    const key = norm(tx.m);
    if (!map[key]) map[key] = { name: tx.m, key, txs: [], months: new Set(), accounts: {} };
    const ym = tx.tx_date ? tx.tx_date.substring(0, 7) : '';
    if (ym) map[key].months.add(ym);
    map[key].txs.push(tx);
    // compte le plus fréquent pour ce marchand
    const aid = tx.acc || '';
    map[key].accounts[aid] = (map[key].accounts[aid] || 0) + 1;
  });

  return Object.values(map)
    .filter(g => g.months.size >= minMonths)
    .map(g => {
      const months = [...g.months].sort();
      const nMonths = g.months.size;
      // Montant moyen et écart-type
      const amts = g.txs.map(tx => Math.abs(tx.amt));
      const avg = amts.reduce((s, a) => s + a, 0) / amts.length;
      const std = Math.sqrt(amts.map(a => (a - avg) ** 2).reduce((s, v) => s + v, 0) / amts.length);
      const isRegularAmt = std / avg < 0.15; // <15% d'écart → montant stable

      // Jour du mois le plus fréquent
      const days = g.txs.map(tx => tx.tx_date ? parseInt(tx.tx_date.split('-')[2]) : 1);
      const dayFreq: Record<number, number> = {};
      days.forEach(d => dayFreq[d] = (dayFreq[d] || 0) + 1);
      const typicalDay = parseInt(Object.entries(dayFreq).sort(([, a], [, b]) => b - a)[0][0]);

      // Compte le plus souvent débité
      const topAcc = Object.entries(g.accounts).sort(([, a], [, b]) => b - a)[0][0];

      // Vérifier la consécutivité des mois (mois manquants ?)
      let consecutive = 0;
      for (let i = 1; i < months.length; i++) {
        const [y1, m1] = months[i - 1].split('-').map(Number);
        const [y2, m2] = months[i].split('-').map(Number);
        const diff = (y2 - y1) * 12 + (m2 - m1);
        if (diff === 1) consecutive++;
      }
      const consecutiveRate = months.length > 1 ? consecutive / (months.length - 1) : 0;

      // Score de confiance
      let confidence: 'confirmed' | 'probable' | 'watching';
      if (nMonths >= 6 && consecutiveRate >= 0.8 && isRegularAmt) confidence = 'confirmed';
      else if (nMonths >= 6 || (nMonths >= 3 && consecutiveRate >= 0.6)) confidence = 'probable';
      else confidence = 'watching';

      return {
        name: g.name, key: g.key, nMonths, avg, std, typicalDay,
        topAcc, consecutive, consecutiveRate, isRegularAmt, confidence,
        lastDate: months[months.length - 1], txs: g.txs,
      };
    })
    .filter(g => g.confidence !== 'watching' || g.nMonths >= 3)
    .sort((a, b) => {
      const rank: Record<string, number> = { confirmed: 0, probable: 1, watching: 2 };
      return rank[a.confidence] - rank[b.confidence] || b.nMonths - a.nMonths;
    });
}

export const RecurringManager = ({ t, accounts, recurrings, allHistory, onAdd, onDelete, onUpdate, onClose }: Props) => {
  const[tab,setTab]=useState('confirmed'); // confirmed | detected | add
  const[name,setName]=useState('');
  const[amount,setAmount]=useState('');
  const[dayOfMonth,setDayOfMonth]=useState<number|string>('1');
  const[accId,setAccId]=useState(accounts[0]?.id||'');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const[addingKey,setAddingKey]=useState<string|null>(null); // clé du détecté en cours d'ajout

  // Calcul détection
  const detected=useMemo(()=>detectRecurrings(allHistory||[],2),[allHistory]);

  // Déjà dans next_debits ? (pour éviter doublons dans détectés)
  const existingNames=new Set(recurrings.map(r=>r.name?.toUpperCase().trim().substring(0,25)));
  const newDetected=detected.filter(d=>!existingNames.has(d.key));
  const confirmedDetected=newDetected.filter(d=>d.confidence==='confirmed');
  const probableDetected=newDetected.filter(d=>d.confidence==='probable');
  const watchingDetected=newDetected.filter(d=>d.confidence==='watching');

  const totalMonthly=recurrings.reduce((s,r)=>s+parseFloat(String(r.amount||0)),0);
  const sorted=[...recurrings].sort((a,b)=>parseInt(String(a.date_label||0))-parseInt(String(b.date_label||0)));

  const save=async(overrides: any={})=>{
    const n=overrides.name||name.trim();
    const a=overrides.amount||parseFloat((amount||'0').replace(',','.'));
    const d=overrides.dayOfMonth||dayOfMonth;
    const acc=overrides.accId||accId;
    if(!n||!a||!acc){setErr('Remplis tous les champs');return;}
    setSaving(true);setErr('');
    const e=await onAdd({name:n,amount:a,date_label:String(d).padStart(2,'0'),account_id:acc});
    setSaving(false);
    if(e){setErr(e.message);}
    else{setTab('confirmed');setName('');setAmount('');setAddingKey(null);}
  };

  const confirmDetected=async(d: DetectedRecurring)=>{
    // Pré-remplir depuis la détection
    const accExists=accounts.find(a=>a.id===d.topAcc);
    await save({
      name:d.name,amount:parseFloat(d.avg.toFixed(2)),
      dayOfMonth:d.typicalDay,accId:accExists?d.topAcc:accounts[0]?.id||'',
    });
  };

  const CONF_LABEL: Record<string, {ico: string; label: string; col: string}> = {
    confirmed:{ico:'✅',label:'Confirmé',col:t.mint},
    probable:{ico:'🔍',label:'Probable',col:t.amber},
    watching:{ico:'👁',label:'En observation',col:t.sub}
  };

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,0.7)',
      backdropFilter:'blur(12px)',display:'flex',flexDirection:'column',
      justifyContent:'flex-end'}} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="rm-title"
        onClick={e=>e.stopPropagation()}
        style={{background:t.card,borderRadius:'28px 28px 0 0',
          padding:'0 20px 40px',maxHeight:'92vh',overflowY:'auto',
          animation:'slideUp .28s ease'}}>

        {/* Handle */}
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 4px'}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <button onClick={tab==='add'?()=>setTab('confirmed'):onClose}
            style={{padding:'6px 12px',borderRadius:10,background:t.el,border:'none',
              cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>
            {tab==='add'?'‹ Retour':'Fermer'}
          </button>
          <span id="rm-title" style={{fontSize:15,...sp('s',700),color:t.tx}}>Prélèvements</span>
          {tab!=='add'?(
            <button onClick={()=>setTab('add')}
              style={{padding:'6px 12px',borderRadius:10,background:t.mD,
                border:'1px solid '+t.mint+'44',cursor:'pointer',
                ...sp('o',600),fontSize:13,color:t.mintText}}>+ Manuel</button>
          ):<div style={{width:70}}/>}
        </div>

        {/* Onglets */}
        {tab!=='add'&&(
          <div style={{display:'flex',background:t.el,borderRadius:14,padding:3,marginBottom:14}}>
            {([
              ['confirmed','Confirmés',sorted.length],
              ['detected','Détectés',newDetected.length],
            ] as [string, string, number][]).map(([id,lb,count])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{flex:1,padding:'8px',borderRadius:11,border:'none',cursor:'pointer',
                  background:tab===id?t.card:'transparent',transition:'all .2s',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <span style={{fontSize:12,...sp('o',600),color:tab===id?t.tx:t.sub}}>{lb}</span>
                {count>0&&<span style={{fontSize:10,...sp('o',700),
                  background:tab===id?t.primary:t.bo,color:tab===id?t.bg:t.sub,
                  padding:'1px 6px',borderRadius:8}}>{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ══ ONGLET CONFIRMÉS ══ */}
        {tab==='confirmed'&&(
          <>
            {/* Résumé */}
            <div style={{padding:'12px 14px',background:t.el,borderRadius:14,
              marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:10,...sp('o'),color:t.sub}}>Engagé chaque mois</div>
                <div style={{fontSize:20,...sp('m',300),color:t.tx,marginTop:2}}>{fmt(totalMonthly,2)}</div>
              </div>
              {confirmedDetected.length>0&&(
                <button onClick={()=>setTab('detected')}
                  style={{padding:'6px 10px',borderRadius:10,background:t.amber+'22',
                    border:'1px solid '+t.amber+'44',cursor:'pointer',
                    fontSize:11,...sp('o',600),color:t.amber}}>
                  {confirmedDetected.length} à valider →
                </button>
              )}
            </div>

            {sorted.length===0?(
              <div style={{padding:'32px 0',textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:10}}>📋</div>
                <div style={{fontSize:14,...sp('o',500),color:t.sub}}>Aucun prélèvement confirmé</div>
                <div style={{fontSize:12,...sp('o'),color:t.muted,marginTop:6,lineHeight:1.5}}>
                  Ajoute manuellement ou valide les détections automatiques
                </div>
              </div>
            ):sorted.map((r)=>{
              const acc=accounts.find(a=>a.id===r.account_id);
              return(
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:12,
                  padding:'12px 14px',background:t.el,borderRadius:14,marginBottom:8}}>
                  <div style={{width:38,height:38,borderRadius:12,flexShrink:0,
                    background:(acc?.col||t.mint)+'22',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:17}}>📋</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,...sp('o',600),color:t.tx,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                    <div style={{display:'flex',gap:6,marginTop:2,alignItems:'center'}}>
                      {acc&&<div style={{width:5,height:5,borderRadius:3,background:acc.col}}/>}
                      <span style={{fontSize:11,...sp('o'),color:t.muted}}>
                        {acc?.name||'?'} · le {parseInt(String(r.date_label||1))}
                      </span>
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:14,...sp('m',600),color:t.rose}}>−{fmt(parseFloat(String(r.amount||0)),2)}</div>
                    <button onClick={()=>onDelete(r.id)}
                      style={{fontSize:10,...sp('o'),color:t.muted,background:'none',
                        border:'none',cursor:'pointer',marginTop:2}}>supprimer</button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ ONGLET DÉTECTÉS ══ */}
        {tab==='detected'&&(
          <>
            {/* Info règle */}
            <div style={{padding:'10px 12px',borderRadius:12,background:t.mD,
              border:'1px solid '+t.mint+'33',marginBottom:14,
              display:'flex',gap:8,alignItems:'flex-start'}}>
              <span style={{fontSize:16,flexShrink:0}}>🤖</span>
              <div style={{fontSize:11,...sp('o'),color:t.mintText,lineHeight:1.5}}>
                Analyse de ton historique. ✅ = 6 mois+ consécutifs · 🔍 = 3 à 5 mois · 👁 = à surveiller
              </div>
            </div>

            {newDetected.length===0?(
              <div style={{padding:'32px 0',textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                <div style={{fontSize:14,...sp('o',500),color:t.sub}}>Aucun pattern détecté</div>
                <div style={{fontSize:12,...sp('o'),color:t.muted,marginTop:6}}>
                  Il faut au moins 3 mois d'historique
                </div>
              </div>
            ):[
              {items:confirmedDetected,title:'Confirmés (6+ mois)'},
              {items:probableDetected,title:'Probables (3-5 mois)'},
              {items:watchingDetected,title:'En observation'},
            ].filter(g=>g.items.length>0).map((group,gi)=>(
              <div key={gi} style={{marginBottom:16}}>
                <div style={{fontSize:10,...sp('s',700),color:t.sub,letterSpacing:1,
                  textTransform:'uppercase',marginBottom:8,paddingLeft:2}}>
                  {group.title}
                </div>
                {group.items.map((d)=>{
                  const conf=CONF_LABEL[d.confidence];
                  const acc=accounts.find(a=>a.id===d.topAcc);
                  const isAdding=addingKey===d.key;
                  return(
                    <div key={d.key} style={{marginBottom:8,borderRadius:16,
                      background:t.el,overflow:'hidden',
                      border:'1px solid '+(d.confidence==='confirmed'?t.mint+'33':t.bo)}}>
                      {/* Ligne principale */}
                      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px'}}>
                        <div style={{width:38,height:38,borderRadius:12,flexShrink:0,
                          background:conf.col+'18',display:'flex',alignItems:'center',
                          justifyContent:'center',fontSize:16}}>{conf.ico}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,...sp('o',600),color:t.tx,
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</div>
                          <div style={{display:'flex',gap:8,marginTop:2,flexWrap:'wrap'}}>
                            <span style={{fontSize:10,...sp('o'),color:t.muted}}>
                              {d.nMonths} mois · ~le {d.typicalDay}
                            </span>
                            {acc&&(
                              <div style={{display:'flex',alignItems:'center',gap:3}}>
                                <div style={{width:5,height:5,borderRadius:3,background:acc.col}}/>
                                <span style={{fontSize:10,...sp('o'),color:t.muted}}>{acc.name}</span>
                              </div>
                            )}
                            {!d.isRegularAmt&&(
                              <span style={{fontSize:9,...sp('o',600),color:t.amber,
                                background:t.aD,padding:'1px 5px',borderRadius:4}}>
                                Montant variable
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:13,...sp('m',600),color:t.rose,lineHeight:1}}>
                            ~{fmt(d.avg,2)}
                          </div>
                          <div style={{fontSize:9,...sp('o'),color:t.muted,marginTop:2}}>
                            /mois
                          </div>
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{display:'flex',gap:0,borderTop:'1px solid '+t.bo+'66'}}>
                        <button onClick={()=>confirmDetected(d)}
                          style={{flex:1,padding:'10px',background:'none',border:'none',
                            cursor:'pointer',fontSize:12,...sp('o',600),color:t.mintText,
                            borderRight:'1px solid '+t.bo+'66'}}>
                          ✓ Ajouter aux prélèvements
                        </button>
                        <button onClick={()=>setAddingKey(isAdding?null:d.key)}
                          style={{padding:'10px 14px',background:'none',border:'none',
                            cursor:'pointer',fontSize:11,...sp('o'),color:t.sub}}>
                          ✎
                        </button>
                      </div>
                      {/* Mini-formulaire d'édition avant ajout */}
                      {isAdding&&(
                        <div style={{padding:'12px 14px',borderTop:'1px solid '+t.bo+'44',
                          display:'flex',flexDirection:'column',gap:10,background:t.card}}>
                          <div style={{display:'flex',gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,...sp('o'),color:t.muted,marginBottom:4}}>Montant</div>
                              <input type="number" defaultValue={d.avg.toFixed(2)} id={'amt-'+d.key}
                                style={{width:'100%',padding:'8px 10px',background:t.el,
                                  border:'1px solid '+t.bo,borderRadius:10,...sp('m'),
                                  fontSize:14,color:t.rose,outline:'none'}}/>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,...sp('o'),color:t.muted,marginBottom:4}}>Jour</div>
                              <input type="number" min="1" max="31" defaultValue={d.typicalDay} id={'day-'+d.key}
                                style={{width:'100%',padding:'8px 10px',background:t.el,
                                  border:'1px solid '+t.bo,borderRadius:10,...sp('m'),
                                  fontSize:14,color:t.tx,outline:'none'}}/>
                            </div>
                          </div>
                          <button onClick={()=>{
                            const amtEl=document.getElementById('amt-'+d.key) as HTMLInputElement|null;
                            const dayEl=document.getElementById('day-'+d.key) as HTMLInputElement|null;
                            const accExists=accounts.find(a=>a.id===d.topAcc);
                            save({
                              name:d.name,
                              amount:parseFloat(amtEl?.value||String(d.avg)),
                              dayOfMonth:parseInt(dayEl?.value||String(d.typicalDay)),
                              accId:accExists?d.topAcc:accounts[0]?.id||'',
                            });
                          }}
                            style={{padding:'10px',background:t.primary,border:'none',
                              borderRadius:12,cursor:'pointer',
                              ...sp('o',700),fontSize:13,color:t.bg}}>
                            Confirmer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {/* ══ AJOUT MANUEL ══ */}
        {tab==='add'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label htmlFor="rec-name" style={{display:'block',fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,
                textTransform:'uppercase',marginBottom:6}}>Libellé</label>
              <input id="rec-name" value={name} onChange={e=>setName(e.target.value)}
                placeholder="ex: Loyer, EDF, SFR..."
                style={{width:'100%',padding:'12px 14px',background:t.el,
                  border:'1.5px solid '+t.bo,borderRadius:12,...sp('o'),
                  fontSize:14,color:t.tx,outline:'none'}}/>
            </div>
            <div>
              <label htmlFor="rec-amount" style={{display:'block',fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,
                textTransform:'uppercase',marginBottom:6}}>Montant estimé (€)</label>
              <input id="rec-amount" type="number" min="0" step="0.01" value={amount}
                onChange={e=>setAmount(e.target.value)} placeholder="0,00"
                style={{width:'100%',padding:'12px 14px',background:t.el,
                  border:'1.5px solid '+t.bo,borderRadius:12,...sp('m'),
                  fontSize:18,color:t.rose,outline:'none'}}/>
            </div>
            <div>
              <div id="rec-day-label" style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,
                textTransform:'uppercase',marginBottom:8}}>Jour du prélèvement</div>
              <div role="group" aria-labelledby="rec-day-label" style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {[1,2,3,4,5,6,7,8,9,10,12,14,15,20,25,28,29,30].map(d=>(
                  <button key={d} onClick={()=>setDayOfMonth(d)} aria-pressed={dayOfMonth==d}
                    style={{width:40,height:36,borderRadius:10,border:'none',cursor:'pointer',
                      fontSize:12,...sp('o',600),
                      background:dayOfMonth==d?t.mint:t.el,color:dayOfMonth==d?t.bg:t.sub}}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div id="rec-acc-label" style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,
                textTransform:'uppercase',marginBottom:8}}>Compte débité</div>
              <div role="group" aria-labelledby="rec-acc-label" style={{display:'flex',gap:8}}>
                {accounts.map(a=>(
                  <button key={a.id} onClick={()=>setAccId(a.id)} aria-pressed={accId===a.id}
                    style={{flex:1,padding:'10px 8px',borderRadius:12,border:'none',cursor:'pointer',
                      textAlign:'center',background:accId===a.id?a.col+'22':t.el,
                      outline:accId===a.id?'1.5px solid '+a.col:'none'}}>
                    <div aria-hidden="true" style={{width:8,height:8,borderRadius:4,background:a.col,margin:'0 auto 4px'}}/>
                    <div style={{fontSize:11,...sp('o',600),color:accId===a.id?a.col:t.sub,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                  </button>
                ))}
              </div>
            </div>
            {err&&<div role="alert" style={{padding:'10px',borderRadius:10,background:t.rD,
              color:t.rose,...sp('o',600),fontSize:13}}>{err}</div>}
            <button onClick={()=>save()} disabled={saving}
              style={{padding:'15px',background:saving?t.el:t.primary,
                border:'none',borderRadius:16,cursor:saving?'wait':'pointer',
                ...sp('o',700),fontSize:15,color:saving?t.sub:t.bg}}>
              {saving?'Enregistrement…':'Ajouter le prélèvement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
