import { useRef, useState } from 'react'
import type { Theme } from '../types'

interface Props { onRefresh: () => Promise<unknown> | void; t: Theme; children: React.ReactNode }

const THRESHOLD = 70

export const PullToRefresh = ({ onRefresh, t, children }: Props) => {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const scroller = containerRef.current?.closest('main')
    if (scroller && scroller.scrollTop > 0) return
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setPull(Math.min(dy * 0.5, THRESHOLD + 30))
  }
  const onTouchEnd = async () => {
    const shouldRefresh = pull >= THRESHOLD && !refreshing
    startY.current = null
    if (shouldRefresh) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try { await onRefresh() } finally { setRefreshing(false); setPull(0) }
    } else {
      setPull(0)
    }
  }

  return (
    <div ref={containerRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div aria-hidden style={{
        height: pull, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: startY.current == null ? 'height .2s ease' : 'none', overflow: 'hidden',
      }}>
        <div style={{
          width: 22, height: 22, border: '2.5px solid ' + t.primary + '33', borderTop: '2.5px solid ' + t.primary,
          borderRadius: '50%', opacity: Math.min(pull / THRESHOLD, 1),
          animation: refreshing ? 'spin .8s linear infinite' : 'none',
          transform: refreshing ? undefined : `rotate(${pull * 3}deg)`,
        }} />
      </div>
      {children}
    </div>
  )
}
