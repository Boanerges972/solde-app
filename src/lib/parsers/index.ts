import { parseOFX } from './ofx'
import { parseBNP } from './bnp'
import { parseBoursorama } from './boursorama'
import type { ParsedTx } from './ofx'

export type { ParsedTx }

export interface BankDef {
  id: string
  name: string
  icon: string
  detail: string
  color: string
  accept: string
  encoding: string
}

export const SUPPORTED_BANKS: BankDef[] = [
  { id: 'bnp',        name: 'BNP Paribas',       icon: '🏦', detail: 'Export CSV espace client',    color: '#009966', accept: '.csv,.txt', encoding: 'UTF-8' },
  { id: 'boursorama', name: 'Boursorama',          icon: '💛', detail: 'Export CSV transactions',     color: '#F7A800', accept: '.csv',      encoding: 'UTF-8' },
  { id: 'sg',         name: 'Société Générale',    icon: '🔴', detail: 'Export OFX espace client',    color: '#E30613', accept: '.ofx,.csv', encoding: 'UTF-8' },
  { id: 'ca',         name: 'Crédit Agricole',     icon: '🟢', detail: 'Export OFX espace client',    color: '#00894B', accept: '.ofx,.csv', encoding: 'UTF-8' },
  { id: 'lbp',        name: 'La Banque Postale',   icon: '🟡', detail: 'Export OFX espace client',    color: '#FFD800', accept: '.ofx,.csv', encoding: 'UTF-8' },
  { id: 'lcl',        name: 'LCL',                 icon: '🟤', detail: 'Export OFX espace client',    color: '#C8962E', accept: '.ofx,.csv', encoding: 'UTF-8' },
  { id: 'ofx',        name: 'Autre banque (OFX)',   icon: '📂', detail: 'Format OFX universel',        color: '#6B7FD7', accept: '.ofx',      encoding: 'UTF-8' },
]

export function detectAndParse(text: string, filename: string): ParsedTx[] {
  const lower = filename.toLowerCase()
  const firstLine = text.split('\n')[0] ?? ''

  if (lower.endsWith('.ofx') || text.includes('<OFX>') || text.includes('OFXHEADER')) {
    return parseOFX(text)
  }

  if (firstLine.toLowerCase().startsWith('dateop;')) {
    return parseBoursorama(text)
  }

  if (firstLine.toLowerCase().startsWith('date;') && firstLine.toLowerCase().includes('montant')) {
    return parseBNP(text)
  }

  return []
}
