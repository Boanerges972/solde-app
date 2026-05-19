import { Icon } from '../components/Icon'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import type { Theme, AppData, Account } from '../types'

interface Props {
  D: AppData
  t: Theme
  onEdit: (a: Account) => void
  onNew: () => void
  onImport: (bank: string) => void
  onDeposit: (a: Account) => void
}

export const Comptes = ({ D, t, onEdit, onNew, onImport, onDeposit }: Props) => (
  <div style={{padding:'0 20px 16px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0 18px'}}>
      <div>
        <div style={{fontSize:17,...sp('s',700),color:t.tx}}>Mes comptes</div>
        <div style={{fontSize:12,...sp('o'),color:t.sub}}>Total · {(()=>{const tot=D.accounts.reduce((s,a)=>s+a.bal,0);return(tot<0?'−':'')+fmt(Math.abs(tot));})()}</div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>onImport('pick')} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 13px',background:t.el,border:'1px solid '+t.bo,borderRadius:10,cursor:'pointer'}}>
          <span style={{fontSize:14}}>⬆️</span>
          <span style={{fontSize:12,...sp('o',600),color:t.sub}}>Importer</span>
        </button>
        <button onClick={onNew} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 13px',background:t.mD,border:'1px solid '+t.mint+'44',borderRadius:10,cursor:'pointer'}}>
          <Icon n="plus" sz={14} c={t.mint}/>
          <span style={{fontSize:12,...sp('o',600),color:t.mint}}>Ajouter</span>
        </button>
      </div>
    </div>
    {D.accounts.map(a=>{
      const acc = a as Account & { alert?: boolean; msg?: string }
      return (
        <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <button onClick={()=>onEdit(a)} style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:acc.alert?t.rD:t.card,border:'1px solid '+(acc.alert?t.rB:t.bo),borderRadius:16,cursor:'pointer',flex:1,textAlign:'left'}}>
            <div style={{width:46,height:46,borderRadius:15,background:a.col+'22',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:16,height:16,borderRadius:8,background:a.col}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,...sp('o',500),color:t.tx}}>{a.name}</div>
              <div style={{fontSize:12,...sp('o'),color:t.sub}}>{a.type}</div>
              {acc.alert&&<div style={{fontSize:11,...sp('o'),color:t.rose,marginTop:2}}>⚠ {acc.msg}</div>}
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:17,...sp('m',500),color:acc.alert?t.rose:a.bal<0?t.rose:t.tx}}>{fmtS(a.bal)}</div>
              <div style={{fontSize:10,...sp('o'),color:t.muted,marginTop:3}}>Modifier →</div>
            </div>
          </button>
          <button onClick={e=>{e.stopPropagation();onDeposit(a)}} aria-label={'Ajouter des fonds sur '+a.name}
            style={{width:48,height:48,borderRadius:14,background:t.mD,border:'1px solid '+a.col+'44',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1,flexShrink:0}}>
            <span style={{fontSize:16}}>＋</span>
            <span style={{fontSize:8,...sp('o',600),color:t.mint}}>fonds</span>
          </button>
        </div>
      )
    })}
    {D.accounts.length===0&&<div style={{padding:'32px',textAlign:'center',...sp('o'),fontSize:13,color:t.muted}}>Aucun compte — clique "Ajouter" !</div>}
  </div>
)
