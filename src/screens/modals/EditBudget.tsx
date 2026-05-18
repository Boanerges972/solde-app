import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData } from '../../types'

interface Props {
  D: AppData; t: Theme; uid: string
  onClose: () => void; onSaved: () => void
  defaultPeriod?: string
}

export const EditBudget = ({ D, t, uid, onClose, onSaved, defaultPeriod = 'week' }: Props) => {
  const [period, setPeriod] = useState(defaultPeriod)
  const [weekVal, setWeekVal] = useState(String(D.budget))
  const [monthVal, setMonthVal] = useState(String(D.monthBudget || D.budget * 4))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    if (period === 'week') {
      const n = parseFloat(weekVal)
      if (n > 0) await db.from('weekly_budgets').upsert({
        user_id: uid, week_number: D.wk || D.week, year: new Date().getFullYear(),
        budget: n, spent: parseFloat(String(D.spent || 0)), user_name: D.user || 'Utilisateur',
      }, { onConflict: 'user_id,week_number,year' })
    } else {
      const n = parseFloat(monthVal)
      if (n > 0) localStorage.setItem('qdq-monthly-budget', String(n))
    }
    setSaving(false); await onSaved(); onClose()
  }

  const isWeek = period === 'week'
  const val = isWeek ? weekVal : monthVal
  const setVal = isWeek ? setWeekVal : setMonthVal
  const presets = isWeek ? [150, 200, 300, 400, 500] : [1000, 1500, 2000, 2500, 3000]

  return (
    <div style={{position:'absolute',inset:0,zIndex:200,background:'rgba(0,0,0,0.65)',
      backdropFilter:'blur(10px)',display:'flex',flexDirection:'column',
      justifyContent:'flex-end',animation:'fadeIn .2s ease'}} onClick={onClose}>
      <div role="dialog" aria-modal={true} aria-labelledby="eb-title"
        onClick={e=>e.stopPropagation()}
        style={{background:t.card,borderRadius:'22px 22px 0 0',padding:'0 20px 36px',
          animation:'slideUp .28s ease'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}>
          <div style={{width:36,height:4,borderRadius:2,background:t.bo}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <button onClick={onClose} style={{padding:'6px 14px',borderRadius:10,background:t.el,
            border:'none',cursor:'pointer',...sp('o',600),fontSize:13,color:t.sub}}>Annuler</button>
          <span id="eb-title" style={{fontSize:15,...sp('s',700),color:t.tx}}>Budget</span>
          <div style={{width:70}}/>
        </div>

        {/* Toggle Semaine / Mois */}
        <div style={{display:'flex',background:t.el,borderRadius:14,padding:3,marginBottom:20}}>
          {[['week','📅 Semaine'],['month','🗓 Mois']].map(([p,lb])=>(
            <button key={p} onClick={()=>setPeriod(p)}
              style={{flex:1,padding:'9px',borderRadius:11,border:'none',cursor:'pointer',
                background:period===p?t.card:'transparent',transition:'all .2s',
                ...sp('o',600),fontSize:13,color:period===p?t.tx:t.sub}}>
              {lb}
            </button>
          ))}
        </div>

        {/* Context info */}
        <div style={{padding:'8px 12px',borderRadius:12,background:t.el,marginBottom:16,
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,...sp('o'),color:t.muted}}>
            {isWeek?'Dépenses discrétionnaires (extras)':'Charges fixes mensuelles'}
          </span>
          <span style={{fontSize:12,...sp('m',600),color:t.sub}}>
            {isWeek?`${fmt(D.spent,0)} dépensé`:`${fmt(D.monthSpent||0,0)} dépensé`}
          </span>
        </div>

        {/* Montant */}
        <div style={{position:'relative',textAlign:'center',marginBottom:20}}>
          <div style={{display:'inline-flex',alignItems:'baseline',gap:4}}>
            <span style={{fontSize:46,...sp('m',300),color:t.tx,lineHeight:1}}>{val||'0'}</span>
            <span style={{fontSize:22,...sp('m',300),color:t.sub}}>€</span>
          </div>
          <input type="number" min="1" value={val} onChange={e=>setVal(e.target.value)}
            aria-label={isWeek?'Budget hebdomadaire en euros':'Budget mensuel en euros'}
            style={{position:'absolute',opacity:0,width:'100%',height:'100%',top:0,left:0,cursor:'pointer'}}/>
        </div>

        {/* Presets */}
        <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
          {presets.map(v=>(
            <button key={v} onClick={()=>setVal(String(v))}
              style={{flex:1,minWidth:52,padding:'9px 0',borderRadius:10,border:'none',
                cursor:'pointer',...sp('o',600),fontSize:12,
                background:parseInt(val)===v?t.mint+'22':t.el,
                color:parseInt(val)===v?t.mint:t.sub}}>
              {v>=1000?v/1000+'k':v}€
            </button>
          ))}
        </div>

        <button onClick={save} disabled={saving}
          style={{width:'100%',padding:'14px',border:'none',borderRadius:14,
            cursor:saving?'wait':'pointer',...sp('o',700),fontSize:15,
            background:saving?t.el:'linear-gradient(135deg,'+t.mint+',#08C4A0)',
            color:saving?t.sub:'#0F1117'}}>
          {saving?'Enregistrement…':'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
