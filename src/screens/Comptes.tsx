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
  onTransfer?: () => void
}

const balColor = (a: Account, t: Theme): string => {
  if (a.bal > 0) return t.tx
  if (a.overdraft > 0 && a.bal >= -a.overdraft) return t.amber
  return t.rose
}

export const Comptes = ({ D, t, onEdit, onNew, onImport, onDeposit, onTransfer }: Props) => {
  const total = D.accounts.reduce((s, a) => s + a.bal, 0)
  const hasPerso = D.persoAccs.length > 0
  const hasPro = D.proAccs.length > 0
  const showSplit = hasPerso && hasPro

  return (
    <div style={{ padding: '0 20px 24px' }}>
      {/* Header */}
      <div style={{ padding: '16px 0 24px' }}>
        <div style={{ marginBottom: 4, fontSize: 12, ...sp('o', 500), color: t.sub, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Patrimoine total
        </div>
        <div style={{ fontSize: 32, ...sp('m', 600), color: total < 0 ? t.rose : t.tx, lineHeight: 1.1 }}>
          {(total < 0 ? '−' : '') + fmt(Math.abs(total))}
        </div>
        {showSplit && (
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: t.primary }} />
              <span style={{ fontSize: 11, ...sp('o', 500), color: t.sub }}>
                Perso · {(D.persoBal < 0 ? '−' : '') + fmt(Math.abs(D.persoBal))}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: t.amber }} />
              <span style={{ fontSize: 11, ...sp('o', 500), color: t.sub }}>
                Pro · {(D.proBal < 0 ? '−' : '') + fmt(Math.abs(D.proBal))}
              </span>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => onImport('pick')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: t.el, border: '1px solid ' + t.bo, borderRadius: 10, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13 }}>⬆️</span>
            <span style={{ fontSize: 12, ...sp('o', 600), color: t.sub }}>Importer</span>
          </button>
          <button
            onClick={onNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: t.mD, border: '1px solid ' + t.mint + '44', borderRadius: 10, cursor: 'pointer' }}
          >
            <Icon n="plus" sz={14} c={t.mint} />
            <span style={{ fontSize: 12, ...sp('o', 600), color: t.mintText }}>Ajouter</span>
          </button>
          {onTransfer && D.accounts.length >= 2 && (
            <button
              onClick={onTransfer}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: t.el, border: '1px solid ' + t.bo, borderRadius: 10, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 13 }}>⇄</span>
              <span style={{ fontSize: 12, ...sp('o', 600), color: t.sub }}>Transférer</span>
            </button>
          )}
        </div>
      </div>

      {/* Account cards */}
      {D.accounts.map(a => {
        const acc = a as Account & { alert?: boolean; msg?: string }
        const bc = balColor(a, t)
        const isNegInOverdraft = a.bal < 0 && a.overdraft > 0 && a.bal >= -a.overdraft
        const isOverLimit = a.bal < -(a.overdraft || 0)
        const hasDebits = a.debits && a.debits.length > 0

        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 12 }}>
            {/* Card */}
            <div
              style={{
                flex: 1,
                background: acc.alert ? t.rD : t.card,
                border: '1px solid ' + (acc.alert ? t.rB : t.bo),
                borderRadius: 20,
                padding: 18,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Top: color dot + name + type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: a.col + '22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 7, background: a.col }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.name}
                  </div>
                  <div style={{ fontSize: 11, ...sp('o', 400), color: t.sub, marginTop: 1 }}>
                    {a.type}{a.isPro ? ' · Pro' : ''}
                  </div>
                </div>
              </div>

              {/* Middle: balance */}
              <div>
                <div style={{ fontSize: 10, ...sp('o', 500), color: t.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>
                  Solde actuel
                </div>
                <div style={{ fontSize: 30, ...sp('m', 600), color: bc, lineHeight: 1.1 }}>
                  {fmtS(a.bal)}
                </div>
                {acc.alert && acc.msg && (
                  <div style={{ fontSize: 11, ...sp('o'), color: t.rose, marginTop: 4 }}>
                    ⚠ {acc.msg}
                  </div>
                )}
              </div>

              {/* Bottom: info row + edit link */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  {isNegInOverdraft && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        background: t.aD,
                        border: '1px solid ' + t.amber + '44',
                        borderRadius: 8,
                        fontSize: 11,
                        ...sp('o', 500),
                        color: t.amber,
                      }}
                    >
                      Découvert autorisé : {fmt(a.overdraft)}€
                    </div>
                  )}
                  {isOverLimit && !isNegInOverdraft && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        background: t.rD,
                        border: '1px solid ' + t.rose + '44',
                        borderRadius: 8,
                        fontSize: 11,
                        ...sp('o', 500),
                        color: t.rose,
                      }}
                    >
                      Dépassement découvert
                    </div>
                  )}
                  {!isNegInOverdraft && !isOverLimit && hasDebits && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        background: t.el,
                        border: '1px solid ' + t.bo,
                        borderRadius: 8,
                        fontSize: 11,
                        ...sp('o', 500),
                        color: t.sub,
                      }}
                    >
                      {a.debits.length} prélèvement{a.debits.length > 1 ? 's' : ''}
                    </div>
                  )}
                  {!isNegInOverdraft && !isOverLimit && !hasDebits && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        background: t.el,
                        border: '1px solid ' + t.bo,
                        borderRadius: 8,
                        fontSize: 11,
                        ...sp('o', 500),
                        color: t.sub,
                      }}
                    >
                      {a.type}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onEdit(a)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '3px 0 3px 12px',
                    fontSize: 11,
                    ...sp('o', 500),
                    color: t.muted,
                  }}
                >
                  Modifier →
                </button>
              </div>
            </div>

            {/* Deposit button */}
            <button
              onClick={e => { e.stopPropagation(); onDeposit(a) }}
              aria-label={'Ajouter des fonds sur ' + a.name}
              style={{
                width: 48,
                borderRadius: 16,
                background: t.mD,
                border: '1px solid ' + a.col + '44',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 18 }}>＋</span>
              <span style={{ fontSize: 8, ...sp('o', 600), color: t.mintText }}>fonds</span>
            </button>
          </div>
        )
      })}

      {D.accounts.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', ...sp('o'), fontSize: 13, color: t.muted }}>
          Aucun compte — clique "Ajouter" !
        </div>
      )}
    </div>
  )
}
