import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface OfflineBannerProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
  t: Theme
}

export const OfflineBanner = ({ isOnline, pendingCount, failedCount, isSyncing, t }: OfflineBannerProps) => {
  // Nothing to show
  if (isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing) return null

  let bg = t.rD
  let color = t.rose
  let text = ''

  if (!isOnline) {
    text = pendingCount > 0
      ? `📵 Hors-ligne · ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
      : '📵 Hors-ligne'
  } else if (isSyncing) {
    bg = t.mD; color = t.mint
    text = '🔄 Synchronisation en cours...'
  } else if (failedCount > 0) {
    text = `⚠ ${failedCount} action${failedCount > 1 ? 's' : ''} non synchronisée${failedCount > 1 ? 's' : ''}`
  } else if (pendingCount > 0) {
    bg = t.mD; color = t.mint
    text = `🔄 ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente de sync`
  }

  if (!text) return null

  return (
    <div style={{
      background: bg, color, padding: '10px 16px',
      fontSize: 13, textAlign: 'center',
      ...sp('o', 500),
    }}>
      {text}
    </div>
  )
}
