import { describe, it, expect } from 'vitest'
import { parseQonto } from '../qonto'

// Qonto export CSV: col0=status ("Exécuté"), col2=date (YYYY-MM-DD...), col5=amount, col22=label
// Needs >=25 columns total.
function qontoRow(status: string, date: string, amount: string, label: string): string {
  const cols = new Array(25).fill('')
  cols[0] = status
  cols[2] = date
  cols[5] = amount
  cols[22] = label
  return cols.join(';')
}

describe('parseQonto', () => {
  it('parses executed transactions with signed amount and date', () => {
    const header = new Array(25).fill('').join(';')
    const csv = [
      header,
      qontoRow('Exécuté', '2026-06-02', '-45,90', 'CARREFOUR CAYENNE'),
      qontoRow('Exécuté', '2026-06-03', '1500,00', 'VIR SALAIRE'),
    ].join('\n')
    const res = parseQonto(csv)
    expect(res).toHaveLength(2)
    // NOTE: parseQonto's date reassembly (y+'-'+m+'-'+d) inverts a YYYY-MM-DD
    // input into DD-MM-YYYY — this quirk is preserved from the original
    // implementation in ImportCSV.tsx (not fixed here, this is a pure move).
    expect(res[0]).toMatchObject({ dt: '02-06-2026', amount: -45.9, merchant: 'CARREFOUR CAYENNE' })
    expect(res[1].amount).toBe(1500)
  })

  it('skips rows not Exécuté, with too few columns, or empty lines', () => {
    const header = new Array(25).fill('').join(';')
    const csv = [
      header,
      '',
      qontoRow('En attente', '2026-06-02', '-10,00', 'TEST'),
      'too;few;cols',
      qontoRow('Exécuté', '2026-06-04', '-20,00', 'TEST OK'),
    ].join('\n')
    const res = parseQonto(csv)
    expect(res).toHaveLength(1)
    expect(res[0].merchant).toBe('TEST OK')
  })
})
