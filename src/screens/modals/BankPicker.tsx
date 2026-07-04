import { sp } from '../../lib/theme'
import { SUPPORTED_BANKS } from '../../lib/parsers/index'
import type { Theme } from '../../types'

interface Props { t: Theme; onPick: (bank: string) => void; onClose: () => void }

export const BankPicker = ({ t, onPick, onClose }: Props) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
    <div role="dialog" aria-modal={true} aria-labelledby="bp-title" onClick={e => e.stopPropagation()}
      style={{ background: t.card, borderRadius: '22px 22px 0 0', padding: '0 20px 36px', animation: 'slideUp .28s ease', maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.bo }} />
      </div>
      <div id="bp-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx, marginBottom: 4, textAlign: 'center' }}>Importer un relevé</div>
      <div style={{ fontSize: 12, ...sp('o'), color: t.sub, marginBottom: 16, textAlign: 'center' }}>Choisissez votre banque</div>

      {SUPPORTED_BANKS.map(b => (
        <button key={b.id} onClick={() => onPick(b.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px', background: t.el, border: 'none', borderRadius: 14, marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: b.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{b.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, ...sp('o', 600), color: t.tx }}>{b.name}</div>
            <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 2 }}>{b.detail}</div>
          </div>
          <div style={{ color: t.muted, fontSize: 16 }}>›</div>
        </button>
      ))}

      <button onClick={onClose} style={{ width: '100%', padding: '13px', background: 'none', border: '1px solid ' + t.bo, borderRadius: 14, cursor: 'pointer', ...sp('o', 600), fontSize: 14, color: t.sub, marginTop: 4 }}>
        Annuler
      </button>
    </div>
  </div>
)
