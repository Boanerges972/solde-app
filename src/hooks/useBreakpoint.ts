import { useState, useEffect } from 'react'

export function useBreakpoint(): { isDesktop: boolean } {
  const query = '(min-width: 768px)'
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia(query).matches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const onChange = (e: { matches: boolean }) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { isDesktop }
}
