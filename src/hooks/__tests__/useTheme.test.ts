import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'
import { T } from '../../lib/theme'

function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  }))
  return listeners
}

describe('useTheme', () => {
  beforeEach(() => localStorage.clear())

  it('mode auto + système clair → palette light', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('auto')
    expect(result.current.t).toBe(T.light)
  })

  it('mode auto + système sombre → palette dark', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.t).toBe(T.dark)
  })

  it('setMode("dark") force la palette dark et persiste', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(result.current.t).toBe(T.dark)
    expect(localStorage.getItem('qdq-theme')).toBe('dark')
  })

  it('mode persisté relu au montage', () => {
    mockMatchMedia(false)
    localStorage.setItem('qdq-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    expect(result.current.t).toBe(T.dark)
  })

  it('changement système en mode auto met à jour la palette', () => {
    const listeners = mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.t).toBe(T.light)
    act(() => listeners.forEach(cb => cb({ matches: true })))
    expect(result.current.t).toBe(T.dark)
  })
})
