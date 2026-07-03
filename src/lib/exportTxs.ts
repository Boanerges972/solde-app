import * as XLSX from 'xlsx'
import type { Transaction } from '../types'

const HEADER = ['Date', 'Marchand', 'Catégorie', 'Montant', 'Compte']

function esc(v: string): string {
  return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

/** CSV point-virgule (Excel FR) des transactions. */
export function buildCsv(txs: Transaction[]): string {
  const rows = txs.map(t =>
    [t.dt, esc(t.m || ''), esc(t.cat || ''), t.amt.toFixed(2), t.acc || ''].join(';'))
  return [HEADER.join(';'), ...rows].join('\n')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Télécharge les transactions en CSV (BOM UTF-8 pour Excel). */
export function downloadCsv(txs: Transaction[], filename = 'qdq-transactions.csv') {
  download(new Blob(['﻿' + buildCsv(txs)], { type: 'text/csv;charset=utf-8' }), filename)
}

/** Télécharge les transactions en .xlsx. */
export function downloadXlsx(txs: Transaction[], filename = 'qdq-transactions.xlsx') {
  const data = txs.map(t => ({
    Date: t.dt, Marchand: t.m || '', 'Catégorie': t.cat || '',
    Montant: t.amt, Compte: t.acc || '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  XLSX.writeFile(wb, filename)
}
