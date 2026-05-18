import type { CSSProperties } from 'react'
import type { Theme } from '../types'

export const T: { dark: Theme; light: Theme } = {
  dark: {
    bg: '#0F1117', card: '#191C26', el: '#22263A',
    tx: '#F0F2F7', sub: '#8B90A7', muted: '#4A4F66',
    bo: 'rgba(255,255,255,0.07)',
    mint: '#10E8C0', rose: '#FF6584', amber: '#F5A623',
    mD: 'rgba(16,232,192,0.12)', rD: 'rgba(255,101,132,0.12)', aD: 'rgba(245,166,35,0.12)',
    rB: 'rgba(255,101,132,0.25)',
  },
  light: {
    bg: '#F3F5FA', card: '#FFFFFF', el: '#E8EBF3',
    tx: '#0F1117', sub: '#5C6080', muted: '#9BA0B8',
    bo: 'rgba(0,0,0,0.07)',
    mint: '#08C8A8', rose: '#E8446A', amber: '#D4880A',
    mD: 'rgba(8,200,168,0.10)', rD: 'rgba(232,68,106,0.10)', aD: 'rgba(212,136,10,0.10)',
    rB: 'rgba(232,68,106,0.20)',
  },
}

type FontFamily = 'm' | 's' | 'o'
export const sp = (f: FontFamily = 'o', w = 400): CSSProperties => ({
  fontFamily: f === 'm' ? 'IBM Plex Mono' : f === 's' ? 'Sora' : 'Outfit',
  fontWeight: w,
})
