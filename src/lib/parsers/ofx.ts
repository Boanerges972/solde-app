import { catFromLabel, iconForCat } from './categories'

export interface ParsedTx {
  dt: string        // YYYY-MM-DD
  merchant: string
  category: string
  icon: string
  amount: number
}

function ofxTag(content: string, tag: string): string {
  // Matches both <TAG>value</TAG> and <TAG>value\n (SGML style)
  const re = new RegExp(`<${tag}>([^<\n\r]+)`, 'i')
  const m = content.match(re)
  return m ? m[1].trim() : ''
}

function parseDate(raw: string): string {
  // OFX date: 20240115000000 or 20240115
  const d = raw.replace(/[^0-9]/g, '').slice(0, 8)
  if (d.length < 8) return ''
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

export function parseOFX(text: string): ParsedTx[] {
  if (!text) return []

  // Split on transaction boundaries
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const txs: ParsedTx[] = []

  for (const block of blocks) {
    const end = block.indexOf('</STMTTRN>') !== -1
      ? block.indexOf('</STMTTRN>')
      : block.indexOf('<STMTTRN>') !== -1
        ? block.indexOf('<STMTTRN>')
        : block.length

    const chunk = block.slice(0, end)

    const dtRaw = ofxTag(chunk, 'DTPOSTED') || ofxTag(chunk, 'DTUSER')
    const amtRaw = ofxTag(chunk, 'TRNAMT')
    const name = ofxTag(chunk, 'NAME') || ofxTag(chunk, 'MEMO') || 'Inconnu'

    const dt = parseDate(dtRaw)
    const amount = parseFloat(amtRaw.replace(',', '.'))

    if (!dt || isNaN(amount)) continue

    const category = catFromLabel(name)
    txs.push({
      dt,
      merchant: name.slice(0, 80),
      category,
      icon: iconForCat(category),
      amount,
    })
  }

  return txs
}
