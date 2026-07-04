import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../__tests__/mocks/handlers'
import { TEST_UID, BASE_URL } from '../../__tests__/mocks/db'
import { useData } from '../useData'
import { db } from '../../lib/supabase'

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

beforeEach(() => {
  localStorage.clear()
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

describe('useData — addDeposit', () => {
  it('inserts transaction with positive amount (not negated)', async () => {
    let insertedAmount: number | null = null
    server.use(
      http.post(`${R}/transactions`, async ({ request }) => {
        const body = await request.json() as any
        insertedAmount = body.amount
        return HttpResponse.json([], { status: 201 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addDeposit({
        merchant: 'Salaire', category: 'Salaire', icon: '💼',
        amount: 500, account_id: 'acc-1',
      })
    })

    expect(insertedAmount).toBe(500)
  })

  it('patches account balance upward (bal + amount)', async () => {
    let patchedBalance: number | null = null
    server.use(
      http.patch(`${R}/accounts`, async ({ request }) => {
        const body = await request.json() as any
        patchedBalance = body.balance
        return HttpResponse.json([], { status: 200 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addDeposit({
        merchant: 'Salaire', category: 'Salaire', icon: '💼',
        amount: 500, account_id: 'acc-1',
      })
    })

    // acc-1 bal=1000 + deposit 500 = 1500
    expect(patchedBalance).toBe(1500)
  })
})

describe('useData — addTx', () => {
  it('patches account balance downward (bal - amount)', async () => {
    let patchedBalance: number | null = null
    server.use(
      http.patch(`${R}/accounts`, async ({ request }) => {
        const body = await request.json() as any
        patchedBalance = body.balance
        return HttpResponse.json([], { status: 200 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTx({
        merchant: 'Carrefour', category: 'Courses',
        amount: 45, account_id: 'acc-1',
      })
    })

    // acc-1 bal=1000 - expense 45 = 955
    expect(patchedBalance).toBe(955)
  })

  it('returns null error on success', async () => {
    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    let err: any = 'not-called'
    await act(async () => {
      err = await result.current.addTx({
        merchant: 'Test', category: 'Autre',
        amount: 10, account_id: 'acc-1',
      })
    })

    expect(err).toBeNull()
  })

  it('inserts transaction with negative amount (negated)', async () => {
    let insertedAmount: number | null = null
    server.use(
      http.post(`${R}/transactions`, async ({ request }) => {
        const body = await request.json() as any
        insertedAmount = body.amount
        return HttpResponse.json([], { status: 201 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTx({
        merchant: 'Carrefour', category: 'Courses',
        amount: 45, account_id: 'acc-1',
      })
    })

    expect(insertedAmount).toBe(-45)
  })
})

describe('useData — deleteTx', () => {
  it('reverses account balance (undoes the original deduction)', async () => {
    let patchedBalance: number | null = null
    server.use(
      http.patch(`${R}/accounts`, async ({ request }) => {
        const body = await request.json() as any
        patchedBalance = body.balance
        return HttpResponse.json([], { status: 200 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      // tx-1: amount mapped to amt=-45.5 on acc-1 (bal=1000)
      // newBal = acc.bal - tx.amt = 1000 - (-45.5) = 1045.5
      await result.current.deleteTx('tx-1')
    })

    expect(patchedBalance).toBe(1045.5)
  })

  it('calls DELETE on the transaction', async () => {
    let deletedId: string | null = null
    server.use(
      http.delete(`${R}/transactions`, ({ request }) => {
        const url = new URL(request.url)
        deletedId = url.searchParams.get('id')?.replace('eq.', '') ?? null
        return HttpResponse.json([], { status: 200 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.deleteTx('tx-1')
    })

    expect(deletedId).toBe('tx-1')
  })
})

describe('useData — addTransfer', () => {
  it('creates one debit and one credit transaction', async () => {
    const postedAmounts: number[] = []
    server.use(
      http.post(`${R}/transactions`, async ({ request }) => {
        const body = await request.json() as any
        postedAmounts.push(body.amount)
        return HttpResponse.json([], { status: 201 })
      }),
    )

    const { result } = renderHook(() => useData(TEST_UID))
    await waitFor(() => expect(result.current.data).not.toBeNull(), { timeout: 5000 })

    await act(async () => {
      await result.current.addTransfer({ fromId: 'acc-1', toId: 'acc-2', amount: 200 })
    })

    expect(postedAmounts).toContain(-200) // debit from acc-1
    expect(postedAmounts).toContain(200)  // credit to acc-2
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
