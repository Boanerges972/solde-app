import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../__tests__/mocks/handlers'
import { TEST_UID, BASE_URL } from '../../__tests__/mocks/db'
import { useData } from '../useData'
import { db } from '../../lib/supabase'
import { loadQueue, removeFromQueue } from '../../lib/idb'

const R = `${BASE_URL}/rest/v1`

// Mock Notification API (not available in jsdom)
const mockNotification = {
  permission: 'default' as NotificationPermission,
}
Object.defineProperty(globalThis, 'Notification', {
  value: Object.assign(
    function Notification() {},
    { permission: mockNotification.permission },
  ),
  writable: true,
  configurable: true,
})

beforeEach(async () => {
  localStorage.clear()
  // La file offline (IndexedDB) survit entre tests — on la vide.
  for (const e of await loadQueue()) await removeFromQueue(e.id!)
  // Mock channel to return a full mock object so removeChannel works without errors
  const mockChannel: any = {
    on: function () { return this },
    subscribe: function () { return this },
    unsubscribe: vi.fn().mockResolvedValue('ok'),
    teardown: vi.fn().mockResolvedValue('ok'),
    topic: 'mock-channel',
    bindings: {},
    params: {},
    socket: { channels: [] },
  }
  vi.spyOn(db as any, 'channel').mockReturnValue(mockChannel)
  vi.spyOn(db as any, 'removeChannel').mockResolvedValue('ok' as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useData — load', () => {
  it('loads accounts and transactions', async () => {
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    expect(result.current.data?.accounts).toHaveLength(2)
    expect(result.current.data?.accounts[0].name).toBe('Compte Principal')
    expect(result.current.data?.txs).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  it('stays null when uid is null', async () => {
    const { result } = renderHook(() => useData(null))
    // When uid is null, the hook's useEffect returns early without calling load(),
    // so loading stays true but data remains null — just verify data is null
    await act(async () => {
      // Let effects settle
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    expect(result.current.data).toBeNull()
  })
})

/** Intercepte une RPC et capture son corps. Renvoie un getter du dernier appel. */
function captureRpc(fn: string, response: unknown = { success: true }) {
  const calls: any[] = []
  server.use(
    http.post(`${R}/rpc/${fn}`, async ({ request }) => {
      calls.push(await request.json())
      return HttpResponse.json(response, { status: 200 })
    }),
  )
  return calls
}

describe('useData — addDeposit', () => {
  it('appelle rpc_add_tx avec un montant POSITIF (entrée, non nié)', async () => {
    const calls = captureRpc('rpc_add_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addDeposit({
        merchant: 'Salaire', category: 'Salaire', icon: '💼',
        amount: 500, account_id: 'acc-1',
      })
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].p_amount).toBe(500)
    expect(calls[0].p_account_id).toBe('acc-1')
  })
})

describe('useData — addTx', () => {
  it('appelle rpc_add_tx avec un montant NÉGATIF (dépense)', async () => {
    const calls = captureRpc('rpc_add_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTx({
        merchant: 'Carrefour', category: 'Courses',
        amount: 45, account_id: 'acc-1',
      })
    })

    expect(calls[0].p_amount).toBe(-45)
    expect(calls[0].p_merchant).toBe('Carrefour')
  })

  it('transmet un operation_id (idempotence) et le budget', async () => {
    const calls = captureRpc('rpc_add_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTx({ merchant: 'X', category: 'Autre', amount: 10, account_id: 'acc-1' })
    })

    expect(calls[0].p_operation_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(typeof calls[0].p_budget).toBe('number')
  })

  it('propage group_id / paid_by (dépense de groupe)', async () => {
    const calls = captureRpc('rpc_add_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTx({
        merchant: 'Resto', category: 'Restaurant', amount: 60, account_id: 'acc-1',
        group_id: 'grp-1', paid_by: 'user-2',
      })
    })

    expect(calls[0].p_group_id).toBe('grp-1')
    expect(calls[0].p_paid_by).toBe('user-2')
  })

  it('retourne null en cas de succès', async () => {
    captureRpc('rpc_add_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let err: any = 'not-called'
    await act(async () => {
      err = await result.current.addTx({ merchant: 'Test', category: 'Autre', amount: 10, account_id: 'acc-1' })
    })

    expect(err).toBeNull()
  })

  it('erreur MÉTIER (la base a répondu) → remontée, pas de mise en file', async () => {
    server.use(
      http.post(`${R}/rpc/rpc_add_tx`, () =>
        HttpResponse.json({ message: 'amount invalid', code: '22023' }, { status: 400 })),
    )
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let res: any
    await act(async () => {
      res = await result.current.addTx({ merchant: 'X', category: 'Autre', amount: 10, account_id: 'acc-1' })
    })

    // Message TRADUIT, jamais le brut PostgreSQL.
    expect(res?.message).toMatch(/montant invalide/i)
    expect(res?.message).not.toContain('amount invalid')
    expect(await loadQueue()).toHaveLength(0) // rien mis en file
  })

  it('réponse RÉSEAU perdue → mise en file avec le MÊME operation_id (pas de double débit)', async () => {
    const sent: any[] = []
    server.use(
      http.post(`${R}/rpc/rpc_add_tx`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.error() // réponse jamais reçue — a peut-être commité
      }),
    )
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let res: any
    await act(async () => {
      res = await result.current.addTx({ merchant: 'Carrefour', category: 'Courses', amount: 45, account_id: 'acc-1' })
    })

    // Pas d'erreur remontée : l'opération est prise en charge par la file.
    expect(res).toBeNull()
    const queue = await loadQueue()
    expect(queue).toHaveLength(1)
    // L'id envoyé à la RPC est CELUI persisté → le replay sera idempotent.
    expect(queue[0].op?.operation_id).toBe(sent[0].p_operation_id)
    // Montant SIGNÉ dans l'outbox (négatif = dépense).
    expect(queue[0].op).toMatchObject({ kind: 'add_tx', amount: -45 })
  })
})

describe('useData — deleteTx', () => {
  it('appelle rpc_delete_tx avec l\'id numérique', async () => {
    const calls = captureRpc('rpc_delete_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.deleteTx('123')
    })

    expect(calls[0].p_transaction_id).toBe(123)
  })

  it('refuse une tx encore en file offline (id « pending-N ») sans appeler la RPC', async () => {
    const calls = captureRpc('rpc_delete_tx')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let res: any
    await act(async () => {
      res = await result.current.deleteTx('pending-3')
    })

    expect(calls).toHaveLength(0)
    expect(res?.message).toMatch(/synchronis/i)
  })
})

describe('useData — addTransfer', () => {
  it('appelle rpc_transfer (une seule opération atomique, pas 2 inserts)', async () => {
    const calls = captureRpc('rpc_transfer')
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTransfer({ fromId: 'acc-1', toId: 'acc-2', amount: 200 })
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].p_from_account_id).toBe('acc-1')
    expect(calls[0].p_to_account_id).toBe('acc-2')
    expect(calls[0].p_amount).toBe(200)
  })

  it('returns error for same-account transfer', async () => {
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let res: any
    await act(async () => {
      res = await result.current.addTransfer({ fromId: 'acc-1', toId: 'acc-1', amount: 100 })
    })

    expect(res.error).toBe('Données invalides')
  })
})
