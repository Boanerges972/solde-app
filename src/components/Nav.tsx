import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

type TabId = string

interface NavProps {
  tab: TabId
  onTab: (id: TabId) => void
  t: Theme
}

export const Nav = ({ tab, onTab, t }: NavProps) => {
  const items = [
    { id: 'journal', ic: 'home', lb: 'Journal' },
    { id: 'comptes', ic: 'cards', lb: 'Comptes' },
    { id: 'analyse', ic: 'chart', lb: 'Analyse' },
    { id: 'groupe', ic: 'users', lb: 'Groupe' },
    { id: 'reglages', ic: 'cog', lb: 'Réglages' },
  ]
  return (
    <nav aria-label="Navigation principale" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: t.card, borderTop: '1px solid ' + t.bo, display: 'flex', padding: '10px 0 22px', zIndex: 50 }}>
      {items.map(i => (
        <button key={i.id} onClick={() => onTab(i.id)}
          aria-label={i.lb} aria-current={tab === i.id ? 'page' : undefined}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', color: tab === i.id ? t.mint : t.muted, transition: 'color .2s' }}>
          <Icon n={i.ic} sz={22} c={tab === i.id ? t.mint : t.muted} />
          <span aria-hidden="true" style={{ fontSize: 9, ...sp('o', tab === i.id ? 600 : 400), letterSpacing: .2 }}>{i.lb}</span>
        </button>
      ))}
    </nav>
  )
}
