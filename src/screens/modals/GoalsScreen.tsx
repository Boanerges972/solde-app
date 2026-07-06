import { useState } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme } from '../../types'
import type { SavingsGoal } from '../../hooks/useGoals'

interface Props {
  t: Theme
  goals: SavingsGoal[]
  onAdd: (g: { name: string; icon: string; target_amount: number; deadline: string | null; account_id: string | null }) => Promise<unknown>
  onDeposit: (id: string, amount: number) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

const ICONS = ['🎯', '✈️', '🏠', '🚗', '💻', '🎓', '💍', '🛡️']

/** Nombre de mois restants (>= 1) jusqu'à une deadline ISO. */
function monthsLeft(deadline: string | null): number | null {
  if (!deadline) return null
  const now = new Date()
  const end = new Date(deadline)
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  return Math.max(1, months)
}

const Ring = ({ ratio, color, t }: { ratio: number; color: string; t: Theme }) => {
  const r = 24, c = 2 * Math.PI * r
  const pct = Math.min(Math.max(ratio, 0), 1)
  return (
    <svg width={60} height={60} viewBox="0 0 60 60" aria-hidden>
      <circle cx={30} cy={30} r={r} fill="none" stroke={t.bo} strokeWidth={5} />
      <circle cx={30} cy={30} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" transform="rotate(-90 30 30)" />
      <text x={30} y={34} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

export const GoalsScreen = ({ t, goals, onAdd, onDeposit, onDelete, onClose }: Props) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [depositFor, setDepositFor] = useState<string | null>(null)
  const [depositAmt, setDepositAmt] = useState('')

  const submit = async () => {
    const amt = parseFloat(target.replace(',', '.'))
    if (!name.trim() || isNaN(amt) || amt <= 0) return
    setSaving(true)
    await onAdd({ name: name.trim(), icon, target_amount: amt, deadline: deadline || null, account_id: null })
    setSaving(false)
    setAdding(false)
    setName(''); setTarget(''); setDeadline(''); setIcon('🎯')
  }

  const doDeposit = async (id: string) => {
    const amt = parseFloat(depositAmt.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) return
    await onDeposit(id, amt)
    setDepositFor(null)
    setDepositAmt('')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={onClose}>
      <div role="dialog" aria-modal={true} aria-labelledby="goals-title" onClick={e => e.stopPropagation()}
        style={{ background: t.card, borderRadius: '22px 22px 0 0', padding: '0 20px 36px', animation: 'slideUp .28s ease', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.bo }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.sub, cursor: 'pointer', fontSize: 14, ...sp('o') }}>Fermer</button>
          <div id="goals-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx }}>Objectifs d'épargne</div>
          <button onClick={() => setAdding(a => !a)} style={{ background: 'none', border: 'none', color: t.primary, cursor: 'pointer', fontSize: 14, ...sp('o', 600) }}>
            {adding ? 'Annuler' : '+ Objectif'}
          </button>
        </div>

        {adding && (
          <div style={{ background: t.el, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {ICONS.map(i => (
                <button key={i} onClick={() => setIcon(i)} aria-pressed={icon === i}
                  style={{ width: 36, height: 36, borderRadius: 10, fontSize: 17, cursor: 'pointer',
                    background: icon === i ? t.primary + '33' : t.card,
                    border: '1px solid ' + (icon === i ? t.primary : t.bo) }}>{i}</button>
              ))}
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Voyage au Japon"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 14, ...sp('o'), marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Cible (€)" inputMode="decimal"
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 14, ...sp('m', 600) }} />
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} aria-label="Échéance"
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 13, ...sp('o') }} />
            </div>
            <button onClick={submit} disabled={saving || !name.trim() || !target}
              style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: t.primary, color: '#fff', fontSize: 14, ...sp('o', 600), opacity: saving || !name.trim() || !target ? 0.5 : 1 }}>
              {saving ? 'Création…' : "Créer l'objectif"}
            </button>
          </div>
        )}

        {goals.length === 0 && !adding && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: t.sub, fontSize: 13, ...sp('o') }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
            Aucun objectif d'épargne.<br />Fixe-toi une cible et suis ta progression.
          </div>
        )}

        {goals.map(g => {
          const ratio = g.target_amount > 0 ? g.saved_amount / g.target_amount : 0
          const done = ratio >= 1
          const months = monthsLeft(g.deadline)
          const suggested = months && !done ? (g.target_amount - g.saved_amount) / months : null
          return (
            <div key={g.id} style={{ background: t.el, borderRadius: 14, padding: '12px 14px', marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Ring ratio={ratio} color={done ? t.mint : t.primary} t={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{g.icon}</span>
                  <span style={{ fontSize: 13, ...sp('o', 600), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                </div>
                <div style={{ fontSize: 11, ...sp('m', 600), color: done ? t.mintText : t.sub, marginTop: 3 }}>
                  {fmt(g.saved_amount)} / {fmt(g.target_amount)}
                </div>
                {suggested != null && (
                  <div style={{ fontSize: 10.5, ...sp('o'), color: t.sub, marginTop: 2 }}>
                    💡 {fmt(suggested)}/mois pour tenir l'échéance
                  </div>
                )}
                {depositFor === g.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input value={depositAmt} onChange={e => setDepositAmt(e.target.value)} placeholder="€" inputMode="decimal" autoFocus
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid ' + t.bo, background: t.card, color: t.tx, fontSize: 13, ...sp('m', 600) }} />
                    <button onClick={() => doDeposit(g.id)}
                      style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: t.mint, color: '#fff', fontSize: 12, ...sp('o', 600), cursor: 'pointer' }}>OK</button>
                    <button onClick={() => { setDepositFor(null); setDepositAmt('') }}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid ' + t.bo, background: 'none', color: t.sub, fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  !done && (
                    <button onClick={() => setDepositFor(g.id)}
                      style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.primary + '44', background: t.mD, color: t.primary, fontSize: 11.5, ...sp('o', 600), cursor: 'pointer' }}>
                      + Verser
                    </button>
                  )
                )}
              </div>
              <button onClick={() => onDelete(g.id)} aria-label={'Supprimer ' + g.name}
                style={{ background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start' }}>🗑️</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
