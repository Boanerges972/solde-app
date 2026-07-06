import type { CSSProperties } from 'react'

export interface Theme {
  bg: string; card: string; el: string
  tx: string; sub: string; muted: string
  bo: string
  mint: string; rose: string; amber: string
  mD: string; rD: string; aD: string; rB: string
  primary: string; secondary: string
  // ── Tokens direction hybride V3 (optionnels — présents seulement sur le thème V3)
  /** Menthe de remplissage / icônes (vif). */
  mintFill?: string
  /** Menthe pour le TEXTE sur fond clair — assombrie pour respecter WCAG AA (≥ 4.5:1). */
  mintText?: string
  /** Indigo de marque (structure & actions). */
  indigo?: string
  /** Violet — accent décoratif non sémantique. */
  violet?: string
  /** Couleurs sémantiques dédiées (distinctes de l'accent de marque). */
  success?: string; alert?: string; danger?: string; info?: string; neutral?: string
}

export interface AccountDebit { n: string; d: string; a: number }

export interface Account {
  id: string; name: string; short: string
  bal: number; col: string; type: string
  isPro: boolean; overdraft: number
  debits: AccountDebit[]
  balance?: number; color?: string; short_name?: string
}

export interface Transaction {
  id: string; merchant: string; category: string
  icon: string; amount: number; tx_date: string
  account_id: string; group_id?: string | null; paid_by?: string | null
  // champs calculés
  acc: string; dt: string; m: string; cat: string; ico: string; amt: number
  isTransfer: boolean; isPro: boolean; isProPerso: boolean
  pending?: boolean
}

export interface Cat { n: string; col: string; ico: string; amt: number; pct: number }

export interface AppData {
  user: string; week: number; wk: number
  budget: number; spent: number; rem: number
  accounts: Account[]; txs: Transaction[]; cats: Cat[]
  persoAccs: Account[]; proAccs: Account[]
  persoTxs: Transaction[]; proTxs: Transaction[]
  persoBal: number; proBal: number
  proMonthSpent: number; proMonthIncome: number; proNet: number
  monthBudget: number; monthSpent: number; monthIncome: number
  monthRem: number; monthLabel: string
}

export interface Recurring {
  id: string; user_id: string; account_id: string
  name: string; amount: string | number; date_label: string
  icon?: string
}

export interface DetectedRecurring {
  name: string; key: string; nMonths: number
  avg: number; std: number; typicalDay: number; topAcc: string
  consecutive: number; consecutiveRate: number; isRegularAmt: boolean
  confidence: 'confirmed' | 'probable' | 'watching'
  lastDate: string; txs: Transaction[]
}

export interface Group {
  id: string; name: string; invite_code: string
  created_by?: string; myName: string
}

export interface Member { user_id: string; display_name: string }

export interface Currency {
  sym: string; pos: 'before' | 'after'; dec: string; code?: string
}

export interface Profile {
  name?: string; avatar?: string; currency?: string
}
