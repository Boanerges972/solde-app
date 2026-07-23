import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, Recurring, Account } from '../types'

interface Props {
  t: Theme
  recurrings: Recurring[]
  accounts: Account[]
}

const MONTH_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTH_FR_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function getLastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function parseDateLabel(dateLabel: string, year: number, month: number): number {
  const lower = dateLabel.toLowerCase()
  if (lower.includes('fin') || lower.includes('dernier') || lower.includes('last')) {
    return getLastDayOfMonth(year, month)
  }
  const match = dateLabel.match(/\d+/)
  if (match) {
    const day = parseInt(match[0])
    if (day >= 1 && day <= 31) return day
  }
  return 1
}

interface TimelineEvent {
  day: number
  date: Date
  recurring: Recurring
  amount: number
  accountName: string
  runningBalance: number
  isToday: boolean
  isPast: boolean
}

export const PrevisionelView = ({ t, recurrings, accounts }: Props) => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const todayDay = today.getDate()
  const lastDay = getLastDayOfMonth(year, month)

  const [selectedAccId, setSelectedAccId] = useState<string>('all')

  // Vue dédiée aux prélèvements : exclure les revenus récurrents (kind credit),
  // sinon un salaire serait soustrait du prévisionnel et affiché en négatif.
  const debitRecurrings = (recurrings || []).filter(r => r.kind !== 'credit')
  const filteredRecurrings = selectedAccId === 'all'
    ? debitRecurrings
    : debitRecurrings.filter(r => r.account_id === selectedAccId)

  if (!recurrings || recurrings.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 15, ...sp('s', 600), color: t.tx, marginBottom: 6 }}>Aucun prélèvement prévu</div>
        <div style={{ fontSize: 13, ...sp('o'), color: t.sub }}>
          Ajoutez des prélèvements récurrents pour voir votre projection de solde
        </div>
      </div>
    )
  }

  // Build per-account starting balances
  const accMap: Record<string, Account> = {}
  accounts.forEach(a => { accMap[a.id] = a })

  // Build timeline events for current month (today → end of month)
  const events: TimelineEvent[] = []

  filteredRecurrings.forEach(r => {
    const amount = parseFloat(String(r.amount)) || 0
    if (amount <= 0) return
    const day = parseDateLabel(r.date_label, year, month)
    // Only include days from today to end of month
    if (day < 1 || day > lastDay) return
    const eventDate = new Date(year, month, day)
    const isPast = day < todayDay
    const isToday = day === todayDay
    const acc = accMap[r.account_id]
    const accountName = acc ? acc.name : 'Compte inconnu'
    events.push({
      day,
      date: eventDate,
      recurring: r,
      amount,
      accountName,
      runningBalance: 0, // will be computed below
      isToday,
      isPast,
    })
  })

  // Sort events by day
  events.sort((a, b) => a.day - b.day)

  // Compute running balance per account (starting from account.bal, subtracting each recurring)
  // We'll compute a global balance across all accounts in the filter
  let runningBal: number
  if (selectedAccId === 'all') {
    runningBal = accounts.reduce((s, a) => s + (a.bal || 0), 0)
  } else {
    runningBal = accMap[selectedAccId]?.bal || 0
  }

  const startBalance = runningBal

  // Apply past events to get "current" balance already considering past recurrings
  // (We show them grayed out but still reflect them in the running balance)
  events.forEach(ev => {
    runningBal -= ev.amount
    ev.runningBalance = runningBal
  })

  const futureEvents = events.filter(ev => !ev.isPast || ev.isToday)
  const pastEvents = events.filter(ev => ev.isPast && !ev.isToday)
  const endBalance = events.length > 0 ? events[events.length - 1].runningBalance : startBalance

  // Check if all recurrings already passed
  const allPassed = events.length > 0 && futureEvents.length === 0

  const endMonthLabel = `${lastDay} ${MONTH_FR[month]}`

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header card */}
      <div style={{
        background: t.card, borderRadius: 20, border: '1px solid ' + t.bo,
        padding: '18px 20px', marginBottom: 14
      }}>
        <div style={{ fontSize: 11, ...sp('s', 600), color: t.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          Projection jusqu'au {endMonthLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 28, ...sp('m', 600), color: t.tx }}>{fmt(startBalance, 0)}</div>
          <div style={{ fontSize: 13, ...sp('o'), color: t.sub }}>solde actuel</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 13, ...sp('m', 600),
            color: endBalance >= 0 ? t.mintText : t.dangerText
          }}>
            {fmt(endBalance, 0)}
          </div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>
            fin {MONTH_FR_SHORT[month]}
          </div>
          <div style={{
            fontSize: 11, ...sp('o', 600),
            color: endBalance >= startBalance ? t.mintText : t.dangerText,
            background: endBalance >= startBalance ? t.mD : t.rD,
            padding: '2px 7px', borderRadius: 6
          }}>
            {endBalance >= startBalance ? '+' : ''}{fmt(endBalance - startBalance, 0)}
          </div>
        </div>
      </div>

      {/* Account filter pills */}
      {accounts.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          {[{ id: 'all', name: 'Tous' }, ...accounts].map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAccId(a.id)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20,
                border: '1px solid ' + (selectedAccId === a.id ? t.primary : t.bo),
                background: selectedAccId === a.id ? t.primary : t.card,
                color: selectedAccId === a.id ? '#fff' : t.sub,
                fontSize: 12, ...sp('o', 600), cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {allPassed ? (
        <div style={{ padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, ...sp('s', 600), color: t.tx, marginBottom: 4 }}>
            Tous vos prélèvements sont passés
          </div>
          <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>
            Il ne reste plus de prélèvement prévu jusqu'à fin {MONTH_FR[month]}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical timeline line */}
          <div style={{
            position: 'absolute', left: 19, top: 32, bottom: 32, width: 2,
            background: 'linear-gradient(' + t.primary + '44, ' + t.primary + '11)',
            borderRadius: 1,
          }} />

          {/* Today marker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, position: 'relative' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 4px ' + t.primary + '22',
              zIndex: 1,
            }}>
              <span style={{ fontSize: 18 }}>📍</span>
            </div>
            <div style={{
              flex: 1, padding: '12px 16px', background: t.primary + '12',
              borderRadius: 14, border: '1px solid ' + t.primary + '33',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, ...sp('s', 700), color: t.primary }}>Aujourd'hui</div>
                  <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>
                    {todayDay} {MONTH_FR[month]} {year}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, ...sp('m', 700), color: t.tx }}>{fmt(startBalance, 0)}</div>
                  <div style={{ fontSize: 10, ...sp('o'), color: t.sub }}>solde actuel</div>
                </div>
              </div>
            </div>
          </div>

          {/* Past events (grayed out) */}
          {pastEvents.map((ev, i) => (
            <div key={'past-' + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12, position: 'relative', opacity: 0.45 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: t.el, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid ' + t.bo,
                zIndex: 1,
              }}>
                <span style={{ fontSize: 15 }}>{ev.recurring.icon || '💸'}</span>
              </div>
              <div style={{
                flex: 1, padding: '11px 14px', background: t.card, borderRadius: 14,
                border: '1px solid ' + t.bo,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ fontSize: 13, ...sp('o', 600), color: t.sub }}>{ev.recurring.name}</div>
                  <div style={{ fontSize: 14, ...sp('m', 600), color: t.sub }}>-{fmt(ev.amount, 0)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 10, ...sp('o'), color: t.muted,
                    background: t.el, padding: '2px 7px', borderRadius: 5
                  }}>{ev.day} {MONTH_FR_SHORT[month]}</div>
                  <div style={{ fontSize: 11, ...sp('m'), color: t.muted }}>{fmt(ev.runningBalance, 0)}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Future events */}
          {futureEvents.map((ev, i) => {
            const isToday = ev.isToday
            const dotColor = isToday ? t.rose : t.primary
            return (
              <div key={'fut-' + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12, position: 'relative' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: dotColor + '18',
                  border: '2px solid ' + dotColor + '66',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1,
                }}>
                  <span style={{ fontSize: 15 }}>{ev.recurring.icon || '💸'}</span>
                </div>
                <div style={{
                  flex: 1, padding: '11px 14px', background: t.card, borderRadius: 14,
                  border: '1px solid ' + (isToday ? t.rose + '44' : t.bo),
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ fontSize: 13, ...sp('o', 600), color: t.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                      {ev.recurring.name}
                    </div>
                    <div style={{ fontSize: 14, ...sp('m', 600), color: t.dangerText, flexShrink: 0 }}>
                      -{fmt(ev.amount, 0)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        fontSize: 10, ...sp('o', 600),
                        color: dotColor,
                        background: dotColor + '18',
                        padding: '2px 7px', borderRadius: 5
                      }}>
                        {isToday ? "Aujourd'hui" : ev.day + ' ' + MONTH_FR_SHORT[month]}
                      </div>
                      <div style={{ fontSize: 10, ...sp('o'), color: t.muted }}>{ev.accountName}</div>
                    </div>
                    <div style={{
                      fontSize: 12, ...sp('m', 600),
                      color: ev.runningBalance >= 0 ? t.mintText : t.dangerText,
                    }}>
                      {fmt(ev.runningBalance, 0)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* End of month card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, position: 'relative' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: endBalance >= 0 ? t.mintText : t.dangerText,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 4px ' + (endBalance >= 0 ? t.mintText : t.dangerText) + '22',
              zIndex: 1,
            }}>
              <span style={{ fontSize: 18 }}>{endBalance >= 0 ? '✅' : '⚠️'}</span>
            </div>
            <div style={{
              flex: 1, padding: '14px 16px',
              background: endBalance >= 0 ? t.mD : t.rD,
              borderRadius: 14,
              border: '1px solid ' + (endBalance >= 0 ? t.mint + '44' : t.rose + '44'),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{
                    fontSize: 13, ...sp('s', 700),
                    color: endBalance >= 0 ? t.mintText : t.dangerText
                  }}>
                    Fin {MONTH_FR[month]}
                  </div>
                  <div style={{ fontSize: 11, ...sp('o'), color: t.sub, marginTop: 1 }}>
                    {endMonthLabel} {year}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 20, ...sp('m', 700),
                    color: endBalance >= 0 ? t.mintText : t.dangerText
                  }}>
                    {fmt(endBalance, 0)}
                  </div>
                  <div style={{
                    fontSize: 10, ...sp('o'),
                    color: endBalance >= 0 ? t.mintText : t.dangerText,
                    opacity: 0.8, marginTop: 1
                  }}>
                    {endBalance >= 0 ? 'solde positif' : 'solde négatif'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
