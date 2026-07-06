import { describe, it, expect } from 'vitest'
import { TV3, BRAND } from '../tokens'

/** Ratio de contraste WCAG entre deux couleurs hex. */
function contrast(hex1: string, hex2: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '')
    const rgb = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    const lin = rgb.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  }
  const [a, b] = [lum(hex1), lum(hex2)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

describe('tokens V3 — direction hybride', () => {
  it('indigo = marque/action, menthe fill = accent positif', () => {
    expect(TV3.light.primary).toBe(BRAND.indigo)
    expect(TV3.light.mintFill).toBe('#10E8C0')
  })

  it('menthe-texte sur fond clair respecte le contraste AA (≥ 4.5:1)', () => {
    expect(contrast(TV3.light.mintText!, TV3.light.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('texte principal sur fond clair respecte AA', () => {
    expect(contrast(TV3.light.tx, TV3.light.bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('menthe de marque ≠ vert de succès (pas de confusion identité/validé)', () => {
    expect(TV3.light.mintFill).not.toBe(TV3.light.success)
  })

  it('thème sombre : la menthe vive sert de menthe-texte', () => {
    expect(TV3.dark.mintText).toBe(TV3.dark.mintFill)
  })

  it('bouton danger : blanc sur dangerBtn respecte AA (fix du 3.76:1 sur #EF4444)', () => {
    expect(contrast('#FFFFFF', TV3.light.dangerBtn!)).toBeGreaterThanOrEqual(4.5)
  })

  it('texte secondaire sur fond clair respecte AA', () => {
    expect(contrast(TV3.light.sub, TV3.light.bg)).toBeGreaterThanOrEqual(4.5)
  })
})
