import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { T } from '../../../lib/theme'
import { monthLocal, addMonths } from '../../../lib/dates'
import type { Transaction } from '../../../types'
import type { TxWindow } from '../../../lib/fetchTxs'

// fetchTxsSince est le seul point d'entrée des données du rapport : c'est le
// bon seam pour piloter la machine à états loading/ok/error du composant. Le
// réseau réel est déjà couvert par fetchTxs.test.ts.
const fetchTxsSince = vi.fn<(uid: string, since: string) => Promise<TxWindow>>()
vi.mock('../../../lib/fetchTxs', () => ({ fetchTxsSince: (u: string, s: string) => fetchTxsSince(u, s) }))

import { MonthlyReport } from '../MonthlyReport'

/** Promesse qu'on résout à la main : laisse observer l'état `loading`. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

const month = monthLocal(new Date())
const tx = (amt: number, cat = 'Courses'): Transaction => ({
  id: String(Math.random()), tx_date: `${month}-05`, amt, cat, m: 'Test', acc: 'a1', ico: '🛒',
} as Transaction)

const renderReport = () => render(<MonthlyReport t={T.dark} uid="u1" onClose={() => {}} />)

beforeEach(() => { fetchTxsSince.mockReset() })
afterEach(cleanup)

describe('MonthlyReport — états de chargement', () => {
  it('affiche « Chargement » tant que la fenêtre n\'est pas revenue, impression bloquée', async () => {
    const d = deferred<TxWindow>()
    fetchTxsSince.mockReturnValue(d.promise)
    renderReport()

    expect(screen.getByText(/Chargement des deux mois/)).toBeTruthy()
    // Aucun chiffre visible, et l'impression d'un rapport vide est interdite.
    expect(screen.queryByText('Répartition par catégorie')).toBeNull()
    expect(screen.getByRole('button', { name: /Imprimer/ }).hasAttribute('disabled')).toBe(true)

    d.resolve({ txs: [tx(-50)], complete: true })
    await waitFor(() => expect(screen.getByText('Répartition par catégorie')).toBeTruthy())
    expect(screen.getByRole('button', { name: /Imprimer/ }).hasAttribute('disabled')).toBe(false)
  })

  it('charge les deux mois : de prevMonth au mois courant', async () => {
    fetchTxsSince.mockResolvedValue({ txs: [tx(-50)], complete: true })
    renderReport()
    await waitFor(() => expect(screen.getByText('Répartition par catégorie')).toBeTruthy())
    expect(fetchTxsSince).toHaveBeenCalledWith('u1', `${addMonths(month, -1)}-01`)
  })

  it('fenêtre INCOMPLÈTE → alerte, AUCUN chiffre, impression toujours bloquée', async () => {
    // Le cœur du garde-fou : un rapport tronqué qu'on peut imprimer est pire
    // que pas de rapport. `complete:false` ne doit afficher aucun total.
    fetchTxsSince.mockResolvedValue({ txs: [tx(-999)], complete: false })
    renderReport()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/Historique incomplet/)).toBeTruthy()
    expect(screen.queryByText('Répartition par catégorie')).toBeNull()
    expect(screen.queryByText(/999/)).toBeNull() // le montant tronqué ne fuit pas
    expect(screen.getByRole('button', { name: /Imprimer/ }).hasAttribute('disabled')).toBe(true)
  })

  it('« Réessayer » relance le chargement et bascule sur OK', async () => {
    fetchTxsSince.mockResolvedValueOnce({ txs: [], complete: false })
    renderReport()
    await waitFor(() => expect(screen.getByText('Réessayer')).toBeTruthy())

    fetchTxsSince.mockResolvedValueOnce({ txs: [tx(-50)], complete: true })
    fireEvent.click(screen.getByText('Réessayer'))

    await waitFor(() => expect(screen.getByText('Répartition par catégorie')).toBeTruthy())
    expect(fetchTxsSince).toHaveBeenCalledTimes(2)
  })
})
