import { useState, useMemo } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData, Transaction, Recurring, Group, Member } from '../../types'

interface Props {
  D: AppData; t: Theme; onClose: () => void
  onSave: (payload: any) => Promise<any>
  group: Group | null; members: Member[]; uid: string
  recurrings: Recurring[]; allHistory: Transaction[]
}

const CATS_E = [
  {n:'Courses',       ico:'🛒', col:'#10E8C0'},
  {n:'Restaurant',    ico:'🍽️', col:'#F5A623'},
  {n:'Transport',     ico:'🚗', col:'#6B7FD7'},
  {n:'Loisirs',       ico:'🎮', col:'#EC4899'},
  {n:'Santé',         ico:'💊', col:'#EF4444'},
  {n:'Maison',        ico:'🏠', col:'#8B5CF6'},
  {n:'Vêtements',     ico:'👗', col:'#F472B6'},
  {n:'Épargne',       ico:'🏦', col:'#14B8A6'},
  {n:'Abonnements',   ico:'📱', col:'#3B82F6'},
  {n:'Énergie',       ico:'⚡', col:'#F59E0B'},
  {n:'Banque',        ico:'🏛️', col:'#64748B'},
  {n:'Voyage',        ico:'✈️', col:'#06B6D4'},
  {n:'Sport',         ico:'🏋️', col:'#84CC16'},
  {n:'Education',     ico:'📚', col:'#A78BFA'},
  {n:'Animaux',       ico:'🐾', col:'#F97316'},
  {n:'Cadeaux',       ico:'🎁', col:'#EC4899'},
  {n:'Médias',        ico:'📰', col:'#8B5CF6'},
  {n:'Impôts',        ico:'🏛️', col:'#94A3B8'},
  {n:'Remboursement', ico:'💸', col:'#06B6D4'},
  {n:'Salaire',       ico:'💰', col:'#84CC16'},
  {n:'Autre',         ico:'📦', col:'#8B90A7'},
]

function calcARD(accounts: any[], recurrings: any[], days = 31) {
  const today = new Date()
  const result: Record<string, any> = {}
  accounts.forEach(acc => {
    const debits = recurrings.filter(r => r.account_id === acc.id).map(r => {
      const dayOfMonth = parseInt(r.date_label || '1', 10)
      const next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
      if (next < today) next.setMonth(next.getMonth() + 1)
      const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...r, next, daysUntil, amt: parseFloat(r.amount) }
    }).filter(r => r.daysUntil <= days)
    const committed = debits.reduce((s: number, r: any) => s + r.amt, 0)
    const overdraft = parseFloat(acc.overdraft || 0)
    const ard = acc.bal + overdraft - committed
    const realAvail = acc.bal + overdraft
    result[acc.id] = {
      ard, committed, debits, overdraft, realAvail,
      status: ard < 0 ? 'danger' : ard < Math.max(committed * 0.2, 50) ? 'warning' : 'ok',
    }
  })
  return result
}

function buildMerchantMemory(history: Transaction[]) {
  const map: Record<string, any> = {}
  ;(history || []).filter(tx => tx.amt < 0 && tx.m && tx.cat !== 'Virement interne').forEach(tx => {
    const key = tx.m.trim().toLowerCase()
    if (!map[key]) map[key] = { name: tx.m, catFreq: {}, accFreq: {}, ico: tx.ico || '📦', count: 0 }
    map[key].count++
    map[key].catFreq[tx.cat || 'Autre'] = (map[key].catFreq[tx.cat || 'Autre'] || 0) + 1
    map[key].accFreq[tx.acc || ''] = (map[key].accFreq[tx.acc || ''] || 0) + 1
    if (tx.ico) map[key].ico = tx.ico
  })
  const result: Record<string, any> = {}
  Object.entries(map).forEach(([key, v]: [string, any]) => {
    const cat = Object.entries(v.catFreq).sort(([, a]: any, [, b]: any) => b - a)[0]?.[0] || 'Autre'
    const accId = Object.entries(v.accFreq).sort(([, a]: any, [, b]: any) => b - a)[0]?.[0] || ''
    result[key] = { name: v.name, cat, accId, ico: v.ico, count: v.count }
  })
  return result
}

function searchMerchants(query: string, memory: Record<string, any>, limit = 4) {
  if (!query || query.length < 2) return []
  const q = query.trim().toLowerCase()
  return Object.values(memory)
    .filter(m => m.name.toLowerCase().includes(q))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export const ExpEntry = ({ D, t, onClose, onSave, group, members, uid, recurrings, allHistory }: Props) => {
  const [cat, setCat] = useState('Courses')
  const [acc, setAcc] = useState(D.accounts[0] ? D.accounts[0].id : '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [paidBy, setPaidBy] = useState(uid || '')
  const [saving, setSaving] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [isProPerso, setIsProPerso] = useState(false)
  const catO = CATS_E.find(c => c.n === cat) || CATS_E[0]

  const memory = useMemo(() => buildMerchantMemory(allHistory || []), [allHistory])
  const suggestions = showSuggestions ? searchMerchants(note, memory, 4) : []

  const applySuggestion = (s: any) => {
    setNote(s.name)
    setCat(s.cat || 'Courses')
    const accExists = D.accounts.find(a => a.id === s.accId)
    if (accExists) setAcc(s.accId)
    setShowSuggestions(false)
  }

  return (
    <div style={{position:'absolute',inset:0,zIndex:100,background:'rgba(0,0,0,0.65)',backdropFilter:'blur(10px)',display:'flex',flexDirection:'column',justifyContent:'flex-end',animation:'fadeIn .2s ease'}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:t.card,borderRadius:'22px 22px 0 0',padding:'0 20px 36px',animation:'slideUp .28s ease',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:10,background:t.el,border:'none',cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
          <span style={{fontSize:14,...sp('s',600),color:t.tx}}>Nouvelle dépense</span>
          <div style={{width:70}}/>
        </div>
        <div style={{position:'relative',textAlign:'center',marginBottom:20}}>
          <div style={{display:'inline-flex',alignItems:'baseline',gap:2}}>
            <span style={{fontSize:46,...sp('m',300),color:amount?t.tx:t.muted,lineHeight:1}}>{amount||'0,00'}</span>
            <span style={{fontSize:20,...sp('m',300),color:t.sub}}> €</span>
            <span style={{fontSize:42,...sp('m',300),color:t.mint,animation:'blink 1s infinite',lineHeight:1}}>|</span>
          </div>
          <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}
            style={{position:'absolute',opacity:0,width:'100%',height:'100%',top:0,left:0,cursor:'pointer'}}/>
        </div>
        {/* Champ note + suggestions marchands */}
        <div style={{marginBottom:14,position:'relative'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',
            background:t.el,borderRadius:12,border:'1px solid '+t.bo}}>
            <span style={{fontSize:16,opacity:.5}}>🏪</span>
            <input value={note}
              onChange={e=>{setNote(e.target.value);setShowSuggestions(true);}}
              onFocus={()=>setShowSuggestions(true)}
              placeholder="Marchand ou note…"
              style={{flex:1,background:'none',border:'none',outline:'none',...sp('o'),fontSize:14,color:t.tx}}/>
            {note&&(
              <button onClick={()=>{setNote('');setShowSuggestions(false);}}
                style={{background:'none',border:'none',cursor:'pointer',
                  fontSize:15,color:t.muted,lineHeight:1,padding:0,flexShrink:0}}>✕</button>
            )}
          </div>
          {/* Suggestions */}
          {suggestions.length>0&&(
            <div style={{position:'absolute',left:0,right:0,top:'100%',zIndex:200,
              background:t.card,border:'1px solid '+t.bo,borderRadius:14,
              marginTop:4,overflow:'hidden',boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}>
              {suggestions.map((s: any, i: number)=>{
                const catMeta=CATS_E.find(c=>c.n===s.cat)
                const accMeta=D.accounts.find(a=>a.id===s.accId)
                return(
                  <button key={i} onClick={()=>applySuggestion(s)}
                    style={{display:'flex',alignItems:'center',gap:12,width:'100%',
                      padding:'11px 14px',background:'none',
                      border:'none',borderBottom:i<suggestions.length-1?'1px solid '+t.bo:'none',
                      cursor:'pointer',textAlign:'left',transition:'background .1s'}}>
                    <div style={{width:36,height:36,borderRadius:11,
                      background:(catMeta?.col||t.mint)+'18',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:17,flexShrink:0}}>
                      {catMeta?.ico||s.ico||'📦'}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,...sp('o',600),color:t.tx,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {s.name}
                      </div>
                      <div style={{display:'flex',gap:6,marginTop:2,alignItems:'center'}}>
                        <span style={{fontSize:11,...sp('o'),
                          color:catMeta?.col||t.sub}}>{s.cat}</span>
                        {accMeta&&(
                          <>
                            <span style={{fontSize:10,color:t.bo}}>·</span>
                            <div style={{width:6,height:6,borderRadius:3,background:accMeta.col,flexShrink:0}}/>
                            <span style={{fontSize:11,...sp('o'),color:t.muted}}>{accMeta.name}</span>
                          </>
                        )}
                        <span style={{fontSize:10,...sp('o'),color:t.muted}}>
                          · {s.count}×
                        </span>
                      </div>
                    </div>
                    <span style={{fontSize:14,color:t.muted,flexShrink:0}}>›</span>
                  </button>
                )
              })}
              <button onClick={()=>setShowSuggestions(false)}
                style={{display:'block',width:'100%',padding:'8px',background:t.el,
                  border:'none',cursor:'pointer',fontSize:11,...sp('o'),color:t.muted}}>
                Saisir manuellement
              </button>
            </div>
          )}
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:6}}>Catégorie</div>
          <div style={{maxHeight:160,overflowY:'auto',borderRadius:12,border:'1px solid '+t.bo}}>
            {CATS_E.map((c,i)=>(
              <button key={c.n} onClick={()=>setCat(c.n)} style={{
                display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',
                background:cat===c.n?c.col+'18':i%2===0?t.card:t.el+'88',
                border:'none',borderBottom:i<CATS_E.length-1?'1px solid '+t.bo:'none',
                cursor:'pointer',textAlign:'left'}}>
                <span style={{fontSize:16,width:22,textAlign:'center',flexShrink:0}}>{c.ico}</span>
                <span style={{fontSize:13,...sp('o',cat===c.n?600:400),color:cat===c.n?c.col:t.tx,flex:1}}>{c.n}</span>
                {cat===c.n&&<span style={{fontSize:12,color:c.col}}>✓</span>}
              </button>
            ))}
          </div>
        </div>
        {group&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 14px',background:isGroup?t.mint+'0F':t.el,borderRadius:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:13,...sp('o',500),color:t.tx}}>Dépense de groupe</div>
              <div style={{fontSize:11,...sp('o'),color:t.sub,marginTop:2}}>{group.name}</div>
            </div>
            <button onClick={()=>setIsGroup(s=>!s)} style={{width:44,height:24,borderRadius:12,padding:2,border:'none',cursor:'pointer',background:isGroup?t.mint:t.muted,transition:'background .2s',display:'flex',alignItems:'center'}}>
              <div style={{width:20,height:20,borderRadius:10,background:'#fff',transform:isGroup?'translateX(20px)':'translateX(0)',transition:'transform .2s'}}/>
            </button>
          </div>
        )}
        {isGroup&&members.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Qui a payé ?</div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              {members.map(m=>(
                <button key={m.user_id} onClick={()=>setPaidBy(m.user_id)} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:50,background:paidBy===m.user_id?t.mint+'22':t.el,border:'1px solid '+(paidBy===m.user_id?t.mint+'55':'transparent'),cursor:'pointer'}}>
                  <span style={{fontSize:14,...sp('s',700),color:paidBy===m.user_id?t.mint:t.sub}}>{m.display_name.charAt(0).toUpperCase()}</span>
                  <span style={{fontSize:12,...sp('o',500),color:paidBy===m.user_id?t.mint:t.sub}}>{m.display_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {/* ASSISTANT "PAYER AVEC..." */}
        {D.accounts.length>0&&(()=>{
          const n=parseFloat((amount||'0').replace(',','.'))
          const ardMap=calcARD(D.accounts,recurrings||[])
          return(
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,...sp('s',700),color:t.sub,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Payer avec…</div>
              {D.accounts.map(a=>{
                const v=ardMap[a.id]||{ard:a.bal,committed:0,debits:[],status:'ok',overdraft:0}
                const afterPurchase=v.ard-n
                const selected=acc===a.id
                const risk=n>0&&afterPurchase<0?'danger'
                  :n>0&&afterPurchase<Math.max(50,v.overdraft*0.1)?'warning':'ok'
                const statusCol=risk==='danger'?t.rose:risk==='warning'?t.amber:v.status==='ok'?t.mint:t.amber
                const statusIco=risk==='danger'?'🔴':risk==='warning'?'🟡':'🟢'
                const isRecommended=risk==='ok'&&v.status==='ok'&&!selected&&
                  D.accounts.every((other: any)=>{
                    if(other.id===a.id)return true
                    const ov=ardMap[other.id]||{ard:other.bal}
                    return v.ard>=ov.ard
                  })
                return(
                  <button key={a.id} onClick={()=>setAcc(a.id)}
                    style={{display:'flex',alignItems:'center',gap:12,width:'100%',
                      padding:'13px 14px',borderRadius:16,marginBottom:8,
                      background:selected?a.col+'18':t.el,cursor:'pointer',
                      border:'1.5px solid '+(selected?a.col+'88':risk==='danger'?t.rose+'33':t.bo),
                      textAlign:'left',transition:'all .15s'}}>
                    <div style={{width:10,height:10,borderRadius:5,
                      background:a.col,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:13,...sp('s',600),color:selected?a.col:t.tx}}>
                          {a.name}
                        </span>
                        {isRecommended&&(
                          <span style={{fontSize:9,...sp('o',700),color:t.mint,
                            background:t.mD,padding:'1px 6px',borderRadius:5}}>
                            RECOMMANDÉ
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:11,...sp('o'),color:t.muted,marginTop:2}}>
                        ARD&nbsp;
                        <span style={{color:v.ard<0?t.rose:t.sub,...sp('m',600)}}>
                          {v.ard<0?'−':''}{fmt(Math.abs(v.ard),0)}
                        </span>
                        {v.debits.length>0&&(
                          <span style={{color:t.muted}}>
                            &nbsp;· {v.debits.length} prél. à venir
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:14,...sp('m',600),
                        color:n>0?statusCol:t.tx,lineHeight:1}}>
                        {n>0?(afterPurchase<0?'−':'')+fmt(Math.abs(afterPurchase),0):fmt(a.bal,0)}
                      </div>
                      <div style={{fontSize:11,marginTop:2}}>
                        {n>0?statusIco:''}
                        <span style={{...sp('o'),color:t.muted,marginLeft:2}}>
                          {n>0?'après achat':'solde'}
                        </span>
                      </div>
                    </div>
                    {selected&&(
                      <div style={{width:22,height:22,borderRadius:11,
                        background:a.col,display:'flex',alignItems:'center',
                        justifyContent:'center',flexShrink:0,fontSize:12}}>✓</div>
                    )}
                  </button>
                )
              })}
              {/* Alerte rejet si risque sur le compte sélectionné */}
              {acc&&n>0&&(()=>{
                const v=ardMap[acc]||{ard:0}
                const after=v.ard-n
                if(after>=0)return null
                const selAcc=D.accounts.find(a=>a.id===acc)
                return(
                  <div style={{padding:'10px 14px',borderRadius:12,
                    background:t.rD,border:'1px solid '+t.rose+'44',marginTop:4}}>
                    <div style={{fontSize:12,...sp('o',700),color:t.rose,marginBottom:4}}>
                      ⚠ Risque de rejet ou découvert
                    </div>
                    <div style={{fontSize:11,...sp('o'),color:t.rose,opacity:.9}}>
                      ARD insuffisant sur {selAcc?.name||'ce compte'}.
                      Après achat&nbsp;: {fmt(after,0)} €
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}
        {/* Toggle Pro/Perso si compte pro sélectionné */}
        {(()=>{
          const selAcc=D.accounts.find(a=>a.id===acc)
          if(!selAcc?.isPro)return null
          return(
            <div style={{padding:'12px 14px',borderRadius:14,
              background:isProPerso?t.aD:'#C084FC0A',
              border:'1px solid '+(isProPerso?t.amber+'44':'#C084FC33'),
              marginBottom:14,
              display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <div>
                <div style={{fontSize:13,...sp('o',600),
                  color:isProPerso?t.amber:'#C084FC'}}>
                  {isProPerso?'👤 Dépense personnelle':'💼 Dépense professionnelle'}
                </div>
                <div style={{fontSize:11,...sp('o'),color:t.muted,marginTop:2}}>
                  {isProPerso?'Comptée dans tes dépenses perso':'Tap pour la compter en perso'}
                </div>
              </div>
              <button onClick={()=>setIsProPerso(v=>!v)}
                style={{width:44,height:24,borderRadius:12,padding:2,border:'none',
                  cursor:'pointer',
                  background:isProPerso?t.amber:'#C084FC',
                  display:'flex',alignItems:'center',flexShrink:0,
                  transition:'background .2s'}}>
                <div style={{width:20,height:20,borderRadius:10,background:'#fff',
                  transform:isProPerso?'translateX(0)':'translateX(20px)',
                  transition:'transform .2s'}}/>
              </button>
            </div>
          )
        })()}
        <button onClick={async()=>{
          const selAcc=D.accounts.find(a=>a.id===acc)
          const finalCat=selAcc?.isPro&&isProPerso?'Dépense perso':cat
          const n=parseFloat(amount.replace(',','.'))
          if(!n||n<=0||!acc)return
          setSaving(true)
          const catO2=CATS_E.find(c=>c.n===finalCat)||catO
          await onSave({merchant:note||finalCat,category:finalCat,icon:catO2.ico,
            amount:n,account_id:acc,group_id:isGroup&&group?group.id:null,paid_by:isGroup?paidBy:null})
          setSaving(false);onClose()
        }} disabled={saving||!amount||!acc}
          style={{width:'100%',padding:'15px',border:'none',borderRadius:16,
            cursor:saving||!amount||!acc?'default':'pointer',...sp('o',700),fontSize:15,
            background:saving||!amount||!acc?t.el:'linear-gradient(135deg,'+t.mint+',#08C4A0)',
            color:saving||!amount||!acc?t.sub:'#0F1117'}}>
          {saving?'Enregistrement…':'Ajouter'}
        </button>
      </div>
    </div>
  )
}
