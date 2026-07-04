export const TEST_UID = 'user-test-1'
export const BASE_URL = 'http://test.supabase.co'

export const DB_ACCOUNTS = [
  {
    id: 'acc-1', user_id: TEST_UID, name: 'Compte Principal',
    short_name: 'Prin', balance: '1000.00', color: '#10E8C0',
    type: 'Courant', reserved: '0', free: '1000.00',
  },
  {
    id: 'acc-2', user_id: TEST_UID, name: 'Épargne',
    short_name: 'Épar', balance: '5000.00', color: '#FF6584',
    type: 'Épargne', reserved: '0', free: '5000.00',
  },
]

export const DB_TRANSACTIONS = [
  {
    id: 'tx-1', user_id: TEST_UID, merchant: 'Carrefour', category: 'Courses',
    icon: '🛒', amount: '-45.50', account_id: 'acc-1', tx_date: '2026-05-10',
  },
  {
    id: 'tx-2', user_id: TEST_UID, merchant: 'SNCF', category: 'Transport',
    icon: '🚇', amount: '-23.00', account_id: 'acc-1', tx_date: '2026-05-08',
  },
]

export const DB_WEEKLY_BUDGET = {
  user_id: TEST_UID, week_number: 20, year: 2026,
  budget: '400', spent: '68.50', user_name: 'Test User',
}
