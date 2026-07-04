import { useRef, useState } from 'react'

/** Suivi d'un swipe horizontal ; expose l'offset courant et un reset. */
export function useSwipe(maxOffset = 88) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) setOffset(Math.max(dx, -maxOffset))
    else setOffset(0)
  }
  const onTouchEnd = () => {
    startX.current = null
    startY.current = null
    setOffset(o => (o < -maxOffset * 0.6 ? -maxOffset : 0))
  }
  const reset = () => setOffset(0)

  return { offset, handlers: { onTouchStart, onTouchMove, onTouchEnd }, reset, open: offset <= -maxOffset * 0.9 }
}
