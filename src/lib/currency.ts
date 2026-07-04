import type { Currency } from '../types'

let CURRENCY: Currency = { sym: '€', pos: 'after', dec: ',' }

export const fmt = (n: number, d = 2): string => {
  const s = Math.abs(n).toFixed(d)
    .replace('.', CURRENCY.dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return CURRENCY.pos === 'before' ? CURRENCY.sym + s : s + ' ' + CURRENCY.sym
}

export const fmtS = (n: number, d = 2): string => (n < 0 ? '−' : '') + fmt(n, d)

export const setCurrency = (c: Currency): void => { CURRENCY = c }
