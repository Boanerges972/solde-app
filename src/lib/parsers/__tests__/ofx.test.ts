import { describe, it, expect } from 'vitest'
import { parseOFX } from '../ofx'

const SAMPLE_OFX = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRNLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115000000
<TRNAMT>-45.50
<FITID>20240115001
<NAME>CARREFOUR CITY
<MEMO>CARTE CB CARREFOUR CITY
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240101000000
<TRNAMT>2500.00
<FITID>20240101001
<NAME>VIREMENT SALAIRE
</STMTTRN>
</BANKTRNLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`

describe('parseOFX', () => {
  it('parses 2 transactions', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs).toHaveLength(2)
  })
  it('parses debit amount correctly', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[0].amount).toBe(-45.50)
  })
  it('parses credit amount correctly', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[1].amount).toBe(2500)
  })
  it('parses date as YYYY-MM-DD', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[0].dt).toBe('2024-01-15')
  })
  it('uses NAME as merchant', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[0].merchant).toBe('CARREFOUR CITY')
  })
  it('categorizes CARREFOUR as Courses', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[0].category).toBe('Courses')
  })
  it('categorizes SALAIRE as Salaire', () => {
    const txs = parseOFX(SAMPLE_OFX)
    expect(txs[1].category).toBe('Salaire')
  })
  it('returns empty array for empty input', () => {
    expect(parseOFX('')).toEqual([])
  })
})
