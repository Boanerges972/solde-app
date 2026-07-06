import { useState, useEffect, useCallback } from 'react'
// Direction V3 (hybride indigo + menthe). L'ancien thème menthe/navy `T`
// reste dans src/lib/theme.ts si besoin de rollback.
import { TV3 as T } from '../lib/tokens'
import type { Theme } from '../types'

export type ThemeMode = 'auto' | 'light' | 'dark'
const KEY = 'qdq-theme'

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme(): { t: Theme; mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'auto'
  })
  const [sysDark, setSysDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: { matches: boolean }) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    if (m === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, m)
  }, [])

  const dark = mode === 'dark' || (mode === 'auto' && sysDark)
  return { t: dark ? T.dark : T.light, mode, setMode }
}
