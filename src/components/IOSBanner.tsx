import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props {
  t: Theme
  onDismiss: () => void
}

export const IOSBanner = ({ t, onDismiss }: Props) => (
  <div style={{ position: 'absolute', bottom: 90, left: 12, right: 12, zIndex: 300, background: t.card, borderRadius: 16, padding: '16px', border: '1px solid ' + t.mint + '44', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'slideUp .3s ease' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: t.mD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📱</div>
        <div>
          <div style={{ fontSize: 13, ...sp('s', 700), color: t.tx }}>Installer QDQ</div>
          <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>Ajouter à l'écran d'accueil</div>
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: t.el, border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', ...sp('o', 500), fontSize: 12, color: t.sub }}>✕</button>
    </div>
    {([['1', 'Tape sur', '⬆️', 'en bas de Safari'], ['2', 'Fais défiler et tape', '📋', "Sur l'écran d'accueil"], ['3', 'Tape', '✅', 'Ajouter en haut']] as [string, string, string, string][]).map(([n, a, ic, b]) => (
      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: t.mD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, ...sp('m', 700), color: t.mintText }}>{n}</span>
        </div>
        <span style={{ fontSize: 13, ...sp('o'), color: t.sub }}>{a} <span style={{ fontSize: 16 }}>{ic}</span> <span style={{ color: t.tx }}>{b}</span></span>
      </div>
    ))}
    <div style={{ textAlign: 'center', marginTop: 10, fontSize: 22, animation: 'bounce .8s ease infinite' }}>↓</div>
  </div>
)
