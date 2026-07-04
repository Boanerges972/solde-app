import type { Transaction } from '../types'

export interface MerchantEntry {
  name: string
  cat: string
  accId: string
  ico: string
  count: number
}

export function buildMerchantMemory(history: Transaction[]): Record<string, MerchantEntry> {
  const map: Record<string, { name: string; catFreq: Record<string, number>; accFreq: Record<string, number>; ico: string; count: number }> = {}
  ;(history || []).filter(tx => tx.amt < 0 && tx.m && tx.cat !== 'Virement interne').forEach(tx => {
    const key = tx.m.trim().toLowerCase()
    if (!map[key]) map[key] = { name: tx.m, catFreq: {}, accFreq: {}, ico: tx.ico || '📦', count: 0 }
    map[key].count++
    map[key].catFreq[tx.cat || 'Autre'] = (map[key].catFreq[tx.cat || 'Autre'] || 0) + 1
    map[key].accFreq[tx.acc || ''] = (map[key].accFreq[tx.acc || ''] || 0) + 1
    if (tx.ico) map[key].ico = tx.ico
  })
  const result: Record<string, MerchantEntry> = {}
  Object.entries(map).forEach(([key, v]) => {
    const cat = Object.entries(v.catFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Autre'
    const accId = Object.entries(v.accFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
    result[key] = { name: v.name, cat, accId, ico: v.ico, count: v.count }
  })
  return result
}

export function searchMerchants(query: string, memory: Record<string, MerchantEntry>, limit = 4): MerchantEntry[] {
  if (!query || query.length < 2) return []
  const q = query.trim().toLowerCase()
  return Object.values(memory)
    .filter(m => m.name.toLowerCase().includes(q))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
