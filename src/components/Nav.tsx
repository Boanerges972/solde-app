import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface NavProps {
  tab: string
  onTab: (id: string) => void
  onAdd: () => void
  t: Theme
}

export const Nav = ({ tab, onTab, onAdd, t }: NavProps) => {
  const NAV_BG = '#0D1B3E'
  const left = [
    { id: 'accueil', ic: 'home', lb: 'Accueil' },
    { id: 'depenses', ic: 'bag', lb: 'Dépenses' },
  ]
  const right = [
    { id: 'analyses', ic: 'chart', lb: 'Analyses' },
    { id: 'profil', ic: 'person', lb: 'Profil' },
  ]
  const renderTab = (i: { id: string; ic: string; lb: string }) => {
    const active = tab === i.id
    return (
      <button key={i.id} onClick={() => onTab(i.id)}
        aria-label={i.lb} aria-current={active ? 'page' : undefined}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 4px',
          color: active ? '#ffffff' : 'rgba(255,255,255,0.45)', transition: 'color .2s'
        }}>
        <Icon n={i.ic} sz={22} c={active ? '#ffffff' : 'rgba(255,255,255,0.45)'} />
        <span style={{
          fontSize: 10, ...sp('o', active ? 600 : 400), letterSpacing: .2,
          color: active ? '#ffffff' : 'rgba(255,255,255,0.45)'
        }}>{i.lb}</span>
      </button>
    )
  }
  return (
    <nav aria-label="Navigation principale" style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: NAV_BG,
      borderTop: 'none',
      display: 'flex', alignItems: 'flex-end',
      padding: '0 0 20px', zIndex: 50, height: 72
    }}>
      {left.map(renderTab)}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 4 }}>
        <button onClick={onAdd} aria-label="Nouvelle dépense"
          style={{
            width: 56, height: 56, borderRadius: 28,
            background: t.primary, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(10,61,145,0.5)',
            transform: 'translateY(-12px)', flexShrink: 0
          }}>
          <Icon n="plus" sz={24} c="#fff" />
        </button>
      </div>
      {right.map(renderTab)}
    </nav>
  )
}
