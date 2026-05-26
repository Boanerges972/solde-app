import { describe, it, expect } from 'vitest'
import { detectAndParse, SUPPORTED_BANKS } from '../index'

const OFX_TEXT = `OFXHEADER:100\n<OFX>\n<STMTTRN>\n<DTPOSTED>20240115\n<TRNAMT>-10.00\n<NAME>TEST\n</STMTTRN>\n</OFX>`
const BNP_TEXT = `Date;Libellé;Montant;\n15/01/2024;TEST BNP;-10,00;\n`
const BOURSO_TEXT = `dateOp;dateVal;label;category;supplierFound;amount;accountNum;addressContractor;postal;city;paymentType\n2024-01-15;2024-01-15;" TEST BOURSO";;TEST;-10,00;FR76;;;\n`

describe('detectAndParse', () => {
  it('detects OFX by content', () => {
    const txs = detectAndParse(OFX_TEXT, 'export.ofx')
    expect(txs.length).toBeGreaterThan(0)
    expect(txs[0].amount).toBe(-10)
  })
  it('detects BNP CSV by header', () => {
    const txs = detectAndParse(BNP_TEXT, 'export.csv')
    expect(txs.length).toBe(1)
    expect(txs[0].merchant).toBe('TEST BNP')
  })
  it('detects Boursorama CSV by header', () => {
    const txs = detectAndParse(BOURSO_TEXT, 'export.csv')
    expect(txs.length).toBe(1)
    expect(txs[0].merchant).toBe('TEST BOURSO')
  })
  it('returns empty array for unrecognised format', () => {
    expect(detectAndParse('foo;bar;baz\n1;2;3', 'unknown.csv')).toEqual([])
  })
})

describe('SUPPORTED_BANKS', () => {
  it('includes BNP, Boursorama, OFX entries', () => {
    const ids = SUPPORTED_BANKS.map(b => b.id)
    expect(ids).toContain('bnp')
    expect(ids).toContain('boursorama')
    expect(ids).toContain('ofx')
  })
})
