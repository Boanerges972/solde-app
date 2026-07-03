import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props { tab: string; onTab: (id: string) => void; onAdd: () => void; t: Theme }

const ITEMS = [
  { id: 'accueil', ic: 'home', lb: 'Accueil' },
  { id: 'depenses', ic: 'bag', lb: 'Dépenses' },
  { id: 'analyses', ic: 'chart', lb: 'Analyses' },
  { id: 'profil', ic: 'person', lb: 'Profil' },
]

export const Sidebar = ({ tab, onTab, onAdd, t }: Props) => (
  <nav aria-label="Navigation principale" style={{
    width: 220, flexShrink: 0, minHeight: '100vh', background: '#0D1B3E',
    display: 'flex', flexDirection: 'column', padding: '24px 12px', gap: 4,
    position: 'sticky', top: 0,
  }}>
    <div style={{ fontSize: 22, ...sp('s', 700), color: '#fff', letterSpacing: -0.5, padding: '0 12px 20px' }}>QDQ</div>
    {ITEMS.map(i => {
      const active = tab === i.id
      return (
        <button key={i.id} onClick={() => onTab(i.id)} aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
            borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
            background: active ? 'rgba(255,255,255,0.10)' : 'none',
            color: active ? '#fff' : 'rgba(255,255,255,0.55)',
          }}>
          <Icon n={i.ic} sz={20} c={active ? '#fff' : 'rgba(255,255,255,0.55)'} />
          <span style={{ fontSize: 14, ...sp('o', active ? 600 : 400) }}>{i.lb}</span>
        </button>
      )
    })}
    <button onClick={onAdd} aria-label="Nouvelle dépense"
      style={{
        marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: t.primary, color: '#fff', fontSize: 14, ...sp('o', 600),
      }}>
      <Icon n="plus" sz={18} c="#fff" /> Nouvelle dépense
    </button>
  </nav>
)
