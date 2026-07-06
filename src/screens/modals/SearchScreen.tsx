import { useState, useEffect, useRef } from 'react'
import { TxRow } from '../../components/TxRow'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import { CATS_E } from '../../lib/expenseCategories'
import { downloadCsv, downloadXlsx } from '../../lib/exportTxs'
import type { Theme, Transaction, Account } from '../../types'

interface Props {
  t: Theme
  allTxs: Transaction[]
  accounts: Account[]
  onClose: () => void
  onDelete: (id: string) => void
}

export const SearchScreen = ({ t, allTxs, accounts, onClose, onDelete }: Props) => {
  const [q, setQ] = useState('')
  const [filterCats, setFilterCats] = useState<string[]>([])
  const [filterAccs, setFilterAccs] = useState<string[]>([])
  const [filterType, setFilterType] = useState('') // '' | 'debit' | 'credit'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amtMin, setAmtMin] = useState('')
  const [amtMax, setAmtMax] = useState('')
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const PAGE_SIZE = 15
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120) }, [])

  // Réinitialise la page à chaque changement de filtre
  const resetPage = () => setPage(0)

  // Catégories présentes dans les transactions
  const cats = [...new Set(allTxs.map(tx => tx.cat).filter(Boolean))].sort()

  const toggleCat = (c: string) => {
    setFilterCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    resetPage()
  }
  const toggleAcc = (id: string) => {
    setFilterAccs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    resetPage()
  }

  const min = parseFloat(amtMin.replace(',', '.'))
  const max = parseFloat(amtMax.replace(',', '.'))

  // Filtrage
  const results = allTxs.filter(tx => {
    if (q) {
      const lq = q.toLowerCase()
      const inMerchant = (tx.m || '').toLowerCase().includes(lq)
      const inCat = (tx.cat || '').toLowerCase().includes(lq)
      if (!inMerchant && !inCat) return false
    }
    if (filterCats.length > 0 && !filterCats.includes(tx.cat)) return false
    if (filterAccs.length > 0 && !filterAccs.includes(tx.acc || '')) return false
    if (filterType === 'debit' && tx.amt >= 0) return false
    if (filterType === 'credit' && tx.amt < 0) return false
    if (dateFrom && (tx.tx_date || tx.dt) < dateFrom) return false
    if (dateTo && (tx.tx_date || tx.dt) > dateTo) return false
    if (!isNaN(min) && Math.abs(tx.amt) < min) return false
    if (!isNaN(max) && Math.abs(tx.amt) > max) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageTxs = results.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Compte les filtres actifs
  const activeFilters = filterCats.length + filterAccs.length +
    [filterType, dateFrom, dateTo, amtMin, amtMax].filter(Boolean).length

  // Sommes
  const totalDebit = results.filter(tx => tx.amt < 0).reduce((s, tx) => s + tx.amt, 0)
  const totalCredit = results.filter(tx => tx.amt > 0).reduce((s, tx) => s + tx.amt, 0)
  const total = results.reduce((s, tx) => s + tx.amt, 0)
  const hasActiveSearch = Boolean(q) || activeFilters > 0

  const clearAll = () => {
    setQ(''); setFilterCats([]); setFilterAccs([]); setFilterType('')
    setDateFrom(''); setDateTo(''); setAmtMin(''); setAmtMax(''); resetPage()
  }

  const fmtDate = (d: string) => {
    const parts = d.split('-')
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d
  }

  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...filterCats.map(c => ({ key: 'cat-' + c, label: c, clear: () => toggleCat(c) })),
    ...filterAccs.map(id => ({
      key: 'acc-' + id,
      label: accounts.find(a => a.id === id)?.name || id,
      clear: () => toggleAcc(id),
    })),
    ...(amtMin ? [{ key: 'min', label: `≥ ${amtMin} €`, clear: () => { setAmtMin(''); resetPage() } }] : []),
    ...(amtMax ? [{ key: 'max', label: `≤ ${amtMax} €`, clear: () => { setAmtMax(''); resetPage() } }] : []),
    ...(dateFrom ? [{ key: 'from', label: `Depuis ${fmtDate(dateFrom)}`, clear: () => { setDateFrom(''); resetPage() } }] : []),
    ...(dateTo ? [{ key: 'to', label: `Jusqu'au ${fmtDate(dateTo)}`, clear: () => { setDateTo(''); resetPage() } }] : []),
    ...(filterType ? [{ key: 'type', label: filterType === 'debit' ? 'Débits' : 'Crédits', clear: () => { setFilterType(''); resetPage() } }] : []),
  ]

  return (
    <div style={{position:'fixed',inset:0,zIndex:400,background:t.bg,
      display:'flex',flexDirection:'column',
      paddingTop:'env(safe-area-inset-top,0px)'}}>

      {/* ── HEADER RECHERCHE ── */}
      <div style={{padding:'12px 16px 0',flexShrink:0}}>
        {/* Barre de recherche */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <div style={{flex:1,display:'flex',alignItems:'center',gap:10,
            padding:'11px 14px',background:t.card,borderRadius:16,
            border:'1px solid '+t.bo}}>
            <span style={{fontSize:18,opacity:.5}}>🔍</span>
            <input ref={inputRef} value={q}
              onChange={e=>{setQ(e.target.value);resetPage();}}
              placeholder="Libellé, catégorie..."
              style={{flex:1,background:'none',border:'none',outline:'none',
                fontSize:15,...sp('o'),color:t.tx,minWidth:0}}/>
            {q&&(
              <button onClick={()=>{setQ('');resetPage();inputRef.current?.focus();}}
                style={{background:'none',border:'none',cursor:'pointer',
                  fontSize:16,color:t.muted,lineHeight:1,padding:0}}>✕</button>
            )}
          </div>
          <button onClick={onClose}
            style={{padding:'11px 14px',background:t.card,borderRadius:16,
              border:'1px solid '+t.bo,cursor:'pointer',
              ...sp('o',600),fontSize:13,color:t.sub,whiteSpace:'nowrap'}}>
            Fermer
          </button>
        </div>

        {/* ── CHIPS FILTRES ACTIFS ── */}
        {activeChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 0 10px' }}>
            {activeChips.map(c => (
              <button key={c.key} onClick={c.clear}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: t.mD, border: '1px solid ' + t.primary + '44', color: t.primary, fontSize: 11, ...sp('o', 600), cursor: 'pointer' }}>
                {c.label} ✕
              </button>
            ))}
          </div>
        )}

        {/* Bouton filtres + badge */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <button onClick={()=>setShowFilters(f=>!f)}
            style={{display:'flex',alignItems:'center',gap:7,padding:'7px 14px',
              borderRadius:20,border:'1px solid '+(activeFilters?t.mint:t.bo),
              background:activeFilters?t.mD:'none',cursor:'pointer'}}>
            <span style={{fontSize:14}}>⚙️</span>
            <span style={{fontSize:12,...sp('o',activeFilters?700:500),
              color:activeFilters?t.mint:t.sub}}>Filtres</span>
            {activeFilters>0&&(
              <span style={{width:18,height:18,borderRadius:9,background:t.mint,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:10,...sp('o',700),color:t.bg}}>{activeFilters}</span>
            )}
          </button>
          {activeFilters>0&&(
            <button onClick={clearAll}
              style={{padding:'7px 12px',borderRadius:20,border:'1px solid '+t.rose+'44',
                background:t.rD,cursor:'pointer',fontSize:11,...sp('o',600),color:t.dangerText}}>
              Tout effacer
            </button>
          )}
          <span style={{marginLeft:'auto',fontSize:11,...sp('o'),color:t.muted}}>
            {results.length} résultat{results.length>1?'s':''}
          </span>
        </div>

        {/* ── PANEAU FILTRES ── */}
        {showFilters&&(
          <div style={{background:t.card,borderRadius:16,border:'1px solid '+t.bo,
            padding:'14px',marginBottom:10,display:'flex',flexDirection:'column',gap:12}}>

            {/* Type */}
            <div>
              <div style={{fontSize:10,...sp('s',700),color:t.muted,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Type</div>
              <div style={{display:'flex',gap:8}}>
                {([['','Tous'],['debit','Dépenses'],['credit','Revenus']] as [string,string][]).map(([v,lb])=>(
                  <button key={v} onClick={()=>{setFilterType(v);resetPage();}}
                    style={{flex:1,padding:'8px 4px',borderRadius:10,border:'none',cursor:'pointer',
                      background:filterType===v?t.mint:t.el,
                      ...sp('o',600),fontSize:12,
                      color:filterType===v?t.bg:t.sub,transition:'all .15s'}}>
                    {lb}
                  </button>
                ))}
              </div>
            </div>

            {/* Compte */}
            <div>
              <div style={{fontSize:10,...sp('s',700),color:t.muted,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Compte</div>
              <div style={{display:'flex',gap:6,overflowX:'auto',scrollbarWidth:'none'}}>
                {accounts.map(a=>{
                  const active=filterAccs.includes(a.id);
                  return(
                  <button key={a.id} onClick={()=>toggleAcc(a.id)}
                    style={{flex:'0 0 auto',display:'flex',alignItems:'center',gap:5,
                      padding:'7px 12px',borderRadius:20,border:'none',cursor:'pointer',
                      background:active?a.col:t.el,transition:'all .15s'}}>
                    <div style={{width:6,height:6,borderRadius:3,
                      background:active?'rgba(255,255,255,0.7)':a.col,flexShrink:0}}/>
                    <span style={{fontSize:12,...sp('o',600),
                      color:active?'rgba(255,255,255,.95)':t.sub,
                      whiteSpace:'nowrap'}}>{a.name}</span>
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Catégorie */}
            <div>
              <div style={{fontSize:10,...sp('s',700),color:t.muted,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Catégorie</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {cats.map(c=>{
                  const meta=CATS_E.find(x=>x.n===c);
                  const active=filterCats.includes(c);
                  return(
                    <button key={c} onClick={()=>toggleCat(c)}
                      style={{flex:'0 0 auto',padding:'7px 12px',borderRadius:20,border:'none',
                        cursor:'pointer',background:active?t.mint:t.el,
                        ...sp('o',600),fontSize:12,color:active?t.bg:t.sub}}>
                      {meta?meta.ico+' ':''}{c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Montant */}
            <div>
              <div style={{fontSize:10,...sp('s',700),color:t.muted,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Montant</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={amtMin} onChange={e => { setAmtMin(e.target.value); resetPage() }} placeholder="Min €" inputMode="decimal"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.el, color: t.tx, fontSize: 13, ...sp('o') }} />
                <input value={amtMax} onChange={e => { setAmtMax(e.target.value); resetPage() }} placeholder="Max €" inputMode="decimal"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.el, color: t.tx, fontSize: 13, ...sp('o') }} />
              </div>
            </div>

            {/* Période */}
            <div>
              <div style={{fontSize:10,...sp('s',700),color:t.muted,letterSpacing:1,
                textTransform:'uppercase',marginBottom:8}}>Période</div>
              <div style={{display:'flex',gap:8}}>
                {[
                  {val:dateFrom,set:setDateFrom,placeholder:'Du'},
                  {val:dateTo,set:setDateTo,placeholder:'Au'}
                ].map((d,i)=>(
                  <input key={i} type="date" value={d.val}
                    onChange={e=>{d.set(e.target.value);resetPage();}}
                    style={{flex:1,padding:'9px 10px',background:t.el,
                      border:'1px solid '+(d.val?t.mint:t.bo),borderRadius:12,
                      color:d.val?t.tx:t.muted,...sp('o'),fontSize:13,cursor:'pointer',
                      colorScheme:'dark'} as React.CSSProperties}/>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RÉSUMÉ RAPIDE ── */}
        {results.length>0&&(
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            {[
              {label:'Dépenses',val:totalDebit,col:t.rose,bg:t.rD},
              {label:'Revenus',val:totalCredit,col:t.mint,bg:t.mD},
            ].filter(k=>k.val!==0).map((k,i)=>(
              <div key={i} style={{flex:1,padding:'8px 12px',borderRadius:12,
                background:k.bg,border:'1px solid '+k.col+'33'}}>
                <div style={{fontSize:10,...sp('o'),color:k.col,marginBottom:2}}>{k.label}</div>
                <div style={{fontSize:14,...sp('m',600),color:k.col,lineHeight:1}}>
                  {k.val<0?'−':''}{fmt(Math.abs(k.val),0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── LISTE RÉSULTATS ── */}
      <div style={{flex:1,overflowY:'auto',padding:'0 16px',WebkitOverflowScrolling:'touch'}}>
        {hasActiveSearch && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 10px', fontSize: 12, ...sp('o'), color: t.sub }}>
            <span>{results.length} opération{results.length > 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {results.length > 0 && (
                <>
                  <button onClick={() => downloadCsv(results)} aria-label="Exporter en CSV"
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid ' + t.bo, background: t.el, color: t.sub, fontSize: 10.5, ...sp('o', 600), cursor: 'pointer' }}>CSV</button>
                  <button onClick={() => downloadXlsx(results)} aria-label="Exporter en Excel"
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid ' + t.bo, background: t.el, color: t.sub, fontSize: 10.5, ...sp('o', 600), cursor: 'pointer' }}>Excel</button>
                </>
              )}
              <span style={{ ...sp('m', 600), color: total < 0 ? t.dangerText : t.mintText }}>{fmt(total)}</span>
            </div>
          </div>
        )}
        {results.length===0?(
          <div style={{padding:'60px 0',textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:12}}>🔍</div>
            <div style={{fontSize:15,...sp('o',500),color:t.sub}}>Aucun résultat</div>
            <div style={{fontSize:12,...sp('o'),color:t.muted,marginTop:6}}>
              Essaie avec d{String.fromCharCode(39)}autres mots-clés ou filtres
            </div>
          </div>
        ):(
          <>
            {pageTxs.map(tx=>{
              const acc=accounts.find(a=>a.id===tx.acc);
              return(
                <div key={tx.id} style={{marginBottom:8}}>
                  {/* Badge compte */}
                  {acc&&(
                    <div style={{display:'inline-flex',alignItems:'center',gap:5,
                      marginBottom:4,padding:'3px 8px',borderRadius:8,
                      background:acc.col+'18',border:'1px solid '+acc.col+'33'}}>
                      <div style={{width:6,height:6,borderRadius:3,background:acc.col}}/>
                      <span style={{fontSize:10,...sp('o',600),color:acc.col}}>{acc.name}</span>
                    </div>
                  )}
                  <TxRow tx={tx} t={t} onDelete={onDelete}/>
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages>1&&(
              <div style={{padding:'16px 0 24px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',
                      borderRadius:12,border:'1px solid '+t.bo,background:t.el,
                      cursor:safePage===0?'default':'pointer',opacity:safePage===0?.3:1}}>
                    <span style={{fontSize:16,color:t.sub}}>‹</span>
                    <span style={{fontSize:12,...sp('o',600),color:t.sub}}>Préc.</span>
                  </button>
                  <div style={{display:'flex',gap:6}}>
                    {Array.from({length:totalPages},(_,i)=>(
                      <button key={i} onClick={()=>setPage(i)}
                        style={{width:i===safePage?22:8,height:8,borderRadius:4,border:'none',
                          cursor:'pointer',transition:'all .25s',
                          background:i===safePage?t.mint:t.el}}/>
                    ))}
                  </div>
                  <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage===totalPages-1}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',
                      borderRadius:12,border:'1px solid '+t.bo,background:t.el,
                      cursor:safePage===totalPages-1?'default':'pointer',
                      opacity:safePage===totalPages-1?.3:1}}>
                    <span style={{fontSize:12,...sp('o',600),color:t.sub}}>Suiv.</span>
                    <span style={{fontSize:16,color:t.sub}}>›</span>
                  </button>
                </div>
                <div style={{textAlign:'center',fontSize:11,...sp('o'),color:t.muted}}>
                  Page {safePage+1} sur {totalPages} · {results.length} résultat{results.length>1?'s':''}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
