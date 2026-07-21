import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { T } from '../../../lib/theme'
import { monthLocal } from '../../../lib/dates'
import type { CategoryBudget } from '../../../lib/budgets'
import type { Transaction } from '../../../types'
import type { TxWindow } from '../../../lib/fetchTxs'

const fetchTxsSince = vi.fn<(uid: string, since: string) => Promise<TxWindow>>()
vi.mock('../../../lib/fetchTxs', () => ({ fetchTxsSince: (u: string, s: string) => fetchTxsSince(u, s) }))

import { BudgetsScreen } from '../BudgetsScreen'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const month = monthLocal(new Date())
const budgets: CategoryBudget[] = [{ id: 'b1', category: 'Courses', amount: 300, rollover: false }]
const tx = (amt: number, cat = 'Courses'): Transaction => ({
  id: String(Math.random()), tx_date: `${month}-05`, amt, cat, m: 'M', acc: 'a1', ico: '🛒',
} as Transaction)

const renderScreen = () => render(
  <BudgetsScreen t={T.dark} uid="u1" budgets={budgets}
    onSave={vi.fn().mockResolvedValue(undefined)} onDelete={vi.fn().mockResolvedValue(undefined)} onClose={() => {}} />,
)

beforeEach(() => { fetchTxsSince.mockReset() })
afterEach(cleanup)

describe('BudgetsScreen — états de chargement', () => {
  it('affiche « Chargement » tant que la fenêtre n\'est pas revenue', async () => {
    const d = deferred<TxWindow>()
    fetchTxsSince.mockReturnValue(d.promise)
    renderScreen()

    expect(screen.getByText(/Chargement de l'historique/)).toBeTruthy()
    // Le budget ne s'affiche pas encore : pas de chiffre avant fenêtre complète.
    expect(screen.queryByText('300,00 €')).toBeNull()

    d.resolve({ txs: [tx(-50)], complete: true })
    await waitFor(() => expect(screen.getByText('Courses')).toBeTruthy())
  })

  it('fenêtre INCOMPLÈTE → alerte, AUCUN budget affiché', async () => {
    // Les 50 tx de l'accueil ne sont PAS un repli : un mois sous-compté
    // ferait croire à un budget valide. Sur `complete:false`, rien ne s'affiche.
    fetchTxsSince.mockResolvedValue({ txs: [tx(-50)], complete: false })
    renderScreen()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/Historique incomplet/)).toBeTruthy()
    expect(screen.queryByText('Courses')).toBeNull()
  })

  it('« Réessayer » relance le chargement et bascule sur OK', async () => {
    fetchTxsSince.mockResolvedValueOnce({ txs: [], complete: false })
    renderScreen()
    await waitFor(() => expect(screen.getByText('Réessayer')).toBeTruthy())

    fetchTxsSince.mockResolvedValueOnce({ txs: [tx(-50)], complete: true })
    fireEvent.click(screen.getByText('Réessayer'))

    await waitFor(() => expect(screen.getByText('Courses')).toBeTruthy())
    expect(fetchTxsSince).toHaveBeenCalledTimes(2)
  })
})
