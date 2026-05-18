import { TxRow } from './TxRow'
import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme, Transaction } from '../types'

interface FeedProps {
  txs: Transaction[]
  t: Theme
  onDelete: (id: string) => void
}

export const Feed = ({ txs, t, onDelete }: FeedProps) => {
  const today = txs.filter(x => x.dt === 'today')
  const yest = txs.filter(x => x.dt === 'yesterday')
  const other = txs.filter(x => x.dt !== 'today' && x.dt !== 'yesterday')
  const Section = ({ label, items }: { label: string; items: Transaction[] }) => items.length === 0 ? null : (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, ...sp('s', 700), letterSpacing: 1.5, color: t.muted,
        textTransform: 'uppercase', padding: '12px 0 6px' }}>{label}</div>
      {items.map(tx => <TxRow key={tx.id} tx={tx} t={t} onDelete={onDelete} />)}
    </div>
  )
  if (txs.length === 0) return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>💸</div>
      <div style={{ fontSize: 14, ...sp('o', 500), color: t.sub }}>Aucune transaction</div>
      <div style={{ fontSize: 12, ...sp('o'), color: t.muted, marginTop: 4 }}>Appuie sur + pour commencer</div>
    </div>
  )
  return (
    <div>
      <Section label="Aujourd'hui" items={today} />
      <Section label="Hier" items={yest} />
      <Section label="Précédentes" items={other.slice(0, 8)} />
    </div>
  )
}

interface AddBtnProps {
  t: Theme
  onTap: () => void
}

export const AddBtn = ({ t, onTap }: AddBtnProps) => (
  <button onClick={onTap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', borderRadius: 14, marginBottom: 18, background: 'none', border: '1.5px dashed ' + t.bo, cursor: 'pointer', color: t.sub, ...sp('o'), fontSize: 13 }}>
    <Icon n="plus" sz={15} c={t.sub} />Ajouter une dépense…
  </button>
)
