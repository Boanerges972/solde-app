import { sp } from '../../lib/theme'
import { CATS_E } from '../../lib/expenseCategories'
import type { Theme } from '../../types'
import type { MerchantRule } from '../../lib/merchantRules'

interface Props {
  t: Theme
  rules: MerchantRule[]
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export const RulesScreen = ({ t, rules, onDelete, onClose }: Props) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
    <div role="dialog" aria-modal={true} aria-labelledby="rules-title" onClick={e => e.stopPropagation()}
      style={{ background: t.card, borderRadius: '22px 22px 0 0', padding: '0 20px 36px', animation: 'slideUp .28s ease', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.bo }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.sub, cursor: 'pointer', fontSize: 14, ...sp('o') }}>Fermer</button>
        <div id="rules-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Mes règles</div>
        <div style={{ width: 48 }} />
      </div>
      <div style={{ fontSize: 11.5, ...sp('o'), color: t.sub, marginBottom: 14, textAlign: 'center' }}>
        Apprises de tes saisies — appliquées automatiquement aux imports
      </div>

      {rules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: t.sub, fontSize: 13, ...sp('o') }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
          Aucune règle pour l'instant.<br />Saisis des dépenses : QDQ apprend tes catégories.
        </div>
      )}

      {rules.map(r => {
        const c = CATS_E.find(x => x.n === r.category)
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.el, borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{c?.ico || '📦'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, ...sp('m', 600), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.pattern}</div>
              <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>→ {r.category}</div>
            </div>
            <button onClick={() => onDelete(r.id)} aria-label={'Supprimer la règle ' + r.pattern}
              style={{ background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13 }}>🗑️</button>
          </div>
        )
      })}
    </div>
  </div>
)
