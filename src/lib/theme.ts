import type { CSSProperties } from 'react'
import type { Theme } from '../types'

export const T: { dark: Theme; light: Theme } = {
  dark: {
    bg: '#0D1B3E', card: '#152347', el: '#1C2E57',
    tx: '#E8EDF8', sub: '#8B98B8', muted: '#4A5570',
    bo: 'rgba(255,255,255,0.08)',
    mint: '#1DBE72', rose: '#F44336', amber: '#FFA726',
    mD: 'rgba(29,190,114,0.15)', rD: 'rgba(244,67,54,0.15)', aD: 'rgba(255,167,38,0.15)',
    rB: 'rgba(244,67,54,0.25)',
    primary: '#3D8BFF', secondary: '#5BA8FF',
  },
  light: {
    bg: '#F7F9FC', card: '#FFFFFF', el: '#F0F3FA',
    tx: '#0D1B3E', sub: '#7B8494', muted: '#B0B8CC',
    bo: '#E5E9F2',
    mint: '#1DBE72', rose: '#F44336', amber: '#FFA726',
    mD: 'rgba(29,190,114,0.10)', rD: 'rgba(244,67,54,0.10)', aD: 'rgba(255,167,38,0.10)',
    rB: 'rgba(244,67,54,0.20)',
    primary: '#0A3D91', secondary: '#3D8BFF',
  },
}

type FontFamily = 'm' | 's' | 'o'
export const sp = (f: FontFamily = 'o', w = 400): CSSProperties => ({
  fontFamily: f === 'm' ? 'IBM Plex Mono, monospace' : 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontWeight: w,
})
