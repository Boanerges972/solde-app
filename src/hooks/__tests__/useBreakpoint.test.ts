import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBreakpoint } from '../useBreakpoint'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

describe('useBreakpoint', () => {
  it('≥768px → desktop', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current.isDesktop).toBe(true)
  })
  it('<768px → mobile', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current.isDesktop).toBe(false)
  })
})
