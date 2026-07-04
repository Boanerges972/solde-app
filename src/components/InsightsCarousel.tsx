import { useState } from 'react'
import { sp } from '../lib/theme'
import type { Theme } from '../types'
import type { Insight } from '../lib/insights'

interface Props { insights: Insight[]; t: Theme }

const DISMISS_KEY = 'qdq-insights-dismissed'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
}

export const InsightsCarousel = ({ insights, t }: Props) => {
  const [dismissed, setDismissed] = useState<string[]>(getDismissed)
  const visible = insights.filter(i => !dismissed.includes(i.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
  }

  const toneColor = (tone: Insight['tone']) =>
    tone === 'up' ? t.rose : tone === 'down' ? t.mint : t.primary

  return (
    <div style={{ margin: '0 0 16px' }}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 16px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {visible.map(i => (
          <div key={i.id} style={{
            minWidth: 260, maxWidth: 280, scrollSnapAlign: 'start', flexShrink: 0,
            background: t.card, border: '1px solid ' + t.bo, borderRadius: 14,
            padding: '12px 14px', position: 'relative',
          }}>
            <button onClick={() => dismiss(i.id)} aria-label="Masquer cet insight"
              style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', color: t.muted, cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingRight: 18 }}>
              <span style={{ fontSize: 18 }}>{i.icon}</span>
              <span style={{ fontSize: 13, ...sp('o', 600), color: toneColor(i.tone) }}>{i.title}</span>
            </div>
            <div style={{ fontSize: 11.5, ...sp('o'), color: t.sub, lineHeight: 1.4 }}>{i.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
