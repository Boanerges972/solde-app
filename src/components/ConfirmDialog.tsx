import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props {
  t: Theme
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog = ({ t, message, onConfirm, onCancel }: Props) => (
  <div role="dialog" aria-modal={true} aria-labelledby="cdlg-title"
    style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 32 }}>
    <div style={{ background: t.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 }}>
      <div id="cdlg-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx, textAlign: 'center', marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button autoFocus onClick={onCancel}
          style={{ flex: 1, padding: '13px', background: 'none', border: '1px solid ' + t.bo, borderRadius: 12, cursor: 'pointer', ...sp('o', 600), fontSize: 14, color: t.sub }}>
          Annuler
        </button>
        <button onClick={onConfirm}
          style={{ flex: 1, padding: '13px', background: t.rD, border: '1px solid ' + t.rose + '44', borderRadius: 12, cursor: 'pointer', ...sp('o', 700), fontSize: 14, color: t.dangerText }}>
          Supprimer
        </button>
      </div>
    </div>
  </div>
)
