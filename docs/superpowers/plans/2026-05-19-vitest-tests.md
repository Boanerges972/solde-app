# Vitest Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 26-test Vitest suite covering currency utilities, calcARD business logic, and useData hook mutations with MSW intercepting Supabase REST calls.

**Architecture:** Vitest with jsdom environment; MSW v2 `setupServer` intercepts Supabase REST at the fetch level; `db.channel` mocked via `vi.spyOn` to avoid WebSocket issues; currency module-state reset after each test that changes it; date pinned to 2026-05-19 for deterministic `calcARD` tests.

**Tech Stack:** Vitest, MSW v2, @testing-library/react, jsdom, @vitejs/plugin-react

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `vitest.config.ts` | Vitest config (jsdom, setupFiles, globals) |
| Create | `.env.test` | Supabase URL/key for test environment |
| Modify | `package.json` | Add `test` and `test:run` scripts |
| Create | `src/__tests__/setup.ts` | MSW server lifecycle (beforeAll / afterEach / afterAll) |
| Create | `src/__tests__/mocks/db.ts` | DB-format fixture data |
| Create | `src/__tests__/mocks/handlers.ts` | MSW http handlers + `setupServer` export |
| Create | `src/lib/__tests__/currency.test.ts` | 9 tests for fmt, fmtS, setCurrency |
| Create | `src/components/__tests__/calcARD.test.ts` | 7 tests for calcARD status logic |
| Create | `src/hooks/__tests__/useData.test.ts` | 10 tests for load, addTx, addDeposit, deleteTx, addTransfer |

---

### Task 1: Install dependencies + configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `.env.test`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest jsdom @testing-library/react msw
```

Expected: 4 packages added to `devDependencies`, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 3: Create `.env.test`**

```
VITE_SUPABASE_URL=http://test.supabase.co
VITE_SUPABASE_KEY=test-anon-key
```

- [ ] **Step 4: Add test scripts to `package.json`**

The `"scripts"` block must become:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:run": "vitest run"
}
```

- [ ] **Step 5: Verify Vitest starts**

```bash
npm run test:run 2>&1 | head -20
```

Expected: `No test files found` or zero failures. Vitest starts and exits cleanly (exit 0 or exit 1 with "no files" warning — both acceptable).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts .env.test package.json package-lock.json
git commit -m "test: install Vitest + MSW, add vitest.config.ts"
```

---

### Task 2: MSW setup — fixtures, handlers, server lifecycle

**Files:**
- Create: `src/__tests__/mocks/db.ts`
- Create: `src/__tests__/mocks/handlers.ts`
- Create: `src/__tests__/setup.ts`

- [ ] **Step 1: Create `src/__tests__/mocks/db.ts`**

These are DB-format objects (as returned by Supabase REST, before `useData` mapping).

```ts
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
```

- [ ] **Step 2: Create `src/__tests__/mocks/handlers.ts`**

```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { BASE_URL, DB_ACCOUNTS, DB_TRANSACTIONS, DB_WEEKLY_BUDGET } from './db'

const R = `${BASE_URL}/rest/v1`

export const handlers = [
  http.get(`${R}/accounts`, () => HttpResponse.json(DB_ACCOUNTS)),
  http.get(`${R}/transactions`, () => HttpResponse.json(DB_TRANSACTIONS)),
  http.get(`${R}/weekly_budgets`, () => HttpResponse.json([DB_WEEKLY_BUDGET])),
  http.get(`${R}/next_debits`, () => HttpResponse.json([])),
  http.post(`${R}/transactions`, () => HttpResponse.json([], { status: 201 })),
  http.post(`${R}/weekly_budgets`, () => HttpResponse.json([], { status: 201 })),
  http.patch(`${R}/accounts`, () => HttpResponse.json([], { status: 200 })),
  http.patch(`${R}/weekly_budgets`, () => HttpResponse.json([], { status: 200 })),
  http.delete(`${R}/transactions`, () => HttpResponse.json([], { status: 200 })),
]

export const server = setupServer(...handlers)
```

- [ ] **Step 3: Create `src/__tests__/setup.ts`**

```ts
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/handlers'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors). If `Cannot find module 'msw/node'`, run `npm install -D msw` again.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/
git commit -m "test: add MSW server, fixtures, and setup"
```

---

### Task 3: Currency utility tests

**Files:**
- Create: `src/lib/__tests__/currency.test.ts`

- [ ] **Step 1: Create `src/lib/__tests__/currency.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { fmt, fmtS, setCurrency } from '../../lib/currency'

// Reset module-level CURRENCY state to EUR after each test that changes it
afterEach(() => {
  setCurrency({ sym: '€', pos: 'after', dec: ',' })
})

describe('fmt — EUR (default)', () => {
  it('formats zero', () => {
    expect(fmt(0)).toBe('0,00 €')
  })

  it('formats integer', () => {
    expect(fmt(100)).toBe('100,00 €')
  })

  it('formats amount with thousands separator', () => {
    expect(fmt(1234.5)).toBe('1 234,50 €')
  })

  it('returns absolute value — sign is stripped', () => {
    expect(fmt(-50)).toBe('50,00 €')
  })

  it('respects decimal places param', () => {
    expect(fmt(9.99, 0)).toBe('10 €')
  })
})

describe('fmtS — signed formatting', () => {
  it('positive amount: no prefix', () => {
    expect(fmtS(100)).toBe('100,00 €')
  })

  it('negative amount: prefixes minus sign (−)', () => {
    expect(fmtS(-100)).toBe('−100,00 €')
  })
})

describe('setCurrency', () => {
  it('USD — symbol before, dot decimal', () => {
    setCurrency({ code: 'USD', sym: '$', pos: 'before', dec: '.' })
    expect(fmt(10)).toBe('$10.00')
  })

  it('XOF — symbol after, space thousands, comma decimal', () => {
    setCurrency({ code: 'XOF', sym: 'FCFA', pos: 'after', dec: ',' })
    expect(fmt(1000)).toBe('1 000,00 FCFA')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run -- src/lib/__tests__/currency.test.ts --reporter=verbose
```

Expected:
```
✓ src/lib/__tests__/currency.test.ts (9)
  ✓ fmt — EUR (default) > formats zero
  ✓ fmt — EUR (default) > formats integer
  ✓ fmt — EUR (default) > formats amount with thousands separator
  ✓ fmt — EUR (default) > returns absolute value — sign is stripped
  ✓ fmt — EUR (default) > respects decimal places param
  ✓ fmtS — signed formatting > positive amount: no prefix
  ✓ fmtS — signed formatting > negative amount: prefixes minus sign
  ✓ setCurrency > USD — symbol before, dot decimal
  ✓ setCurrency > XOF — symbol after, space thousands, comma decimal
Test Files  1 passed (1)
Tests  9 passed (9)
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/currency.test.ts
git commit -m "test: add currency utility tests (9 tests)"
```

---

### Task 4: calcARD business logic tests

**Files:**
- Create: `src/components/__tests__/calcARD.test.ts`

- [ ] **Step 1: Create `src/components/__tests__/calcARD.test.ts`**

Pinned date: 2026-05-19. With this date:
- `date_label='25'` → May 25 → `daysUntil=6` → included in `days=14` and `days=31`
- `date_label='5'` → June 5 → `daysUntil=17` → excluded from `days=14`, included in `days=31`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { vi } from 'vitest'
import { calcARD } from '../../components/RejectionAlert'
import type { Account, Recurring } from '../../types'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-19T12:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

const makeAccount = (id: string, bal: number, overdraft = 0): Account => ({
  id,
  name: `Compte ${id}`,
  short: 'X',
  bal,
  col: '#10E8C0',
  type: 'Courant',
  isPro: false,
  overdraft,
  debits: [],
})

const makeRecurring = (account_id: string, amount: number, date_label: string): Recurring => ({
  id: `rec-${account_id}-${amount}`,
  user_id: 'u1',
  account_id,
  name: 'Prélèvement',
  amount,
  date_label,
})

describe('calcARD', () => {
  it('no recurrings → status ok, committed 0', () => {
    const result = calcARD([makeAccount('a1', 500)], [])
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].committed).toBe(0)
  })

  it('committed < balance → status ok', () => {
    const result = calcARD(
      [makeAccount('a1', 500)],
      [makeRecurring('a1', 100, '25')], // daysUntil=6, within 31 days
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].ard).toBe(400) // 500 - 100
  })

  it('committed > balance → status danger', () => {
    const result = calcARD(
      [makeAccount('a1', 50)],
      [makeRecurring('a1', 200, '25')], // 200 > 50
    )
    expect(result['a1'].status).toBe('danger')
    expect(result['a1'].ard).toBe(-150) // 50 - 200
  })

  it('overdraft covers committed → status ok', () => {
    // bal=50, overdraft=200, committed=100 → ard=50+200-100=150 → ok
    const result = calcARD(
      [makeAccount('a1', 50, 200)],
      [makeRecurring('a1', 100, '25')],
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].ard).toBe(150)
  })

  it('overdraft not enough → status danger', () => {
    // bal=50, overdraft=30, committed=200 → ard=50+30-200=-120 → danger
    const result = calcARD(
      [makeAccount('a1', 50, 30)],
      [makeRecurring('a1', 200, '25')],
    )
    expect(result['a1'].status).toBe('danger')
    expect(result['a1'].ard).toBe(-120)
  })

  it('recurring outside days window → not committed', () => {
    // date_label='5' → June 5 → daysUntil=17; days=14 → excluded
    const result = calcARD(
      [makeAccount('a1', 500)],
      [makeRecurring('a1', 400, '5')],
      14,
    )
    expect(result['a1'].committed).toBe(0)
    expect(result['a1'].status).toBe('ok')
  })

  it('multiple accounts computed independently', () => {
    const result = calcARD(
      [makeAccount('a1', 1000), makeAccount('a2', 50)],
      [
        makeRecurring('a1', 100, '25'), // a1: ard=900, ok
        makeRecurring('a2', 200, '25'), // a2: ard=-150, danger
      ],
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a2'].status).toBe('danger')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm run test:run -- src/components/__tests__/calcARD.test.ts --reporter=verbose
```

Expected:
```
✓ src/components/__tests__/calcARD.test.ts (7)
  ✓ calcARD > no recurrings → status ok, committed 0
  ✓ calcARD > committed < balance → status ok
  ✓ calcARD > committed > balance → status danger
  ✓ calcARD > overdraft covers committed → status ok
  ✓ calcARD > overdraft not enough → status danger
  ✓ calcARD > recurring outside days window → not committed
  ✓ calcARD > multiple accounts computed independently
Test Files  1 passed (1)
Tests  7 passed (7)
```

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/calcARD.test.ts
git commit -m "test: add calcARD business logic tests (7 tests)"
```

---

### Task 5: useData hook integration tests

**Files:**
- Create: `src/hooks/__tests__/useData.test.ts`

These tests use `renderHook` + MSW. `db.channel` is mocked via `vi.spyOn` to prevent WebSocket connections; all REST calls are intercepted by MSW.

**Key expected values:**
- `acc-1` balance = 1000 (from `DB_ACCOUNTS`)
- `tx-1` amount = -45.50 (mapped to `tx.amt` in `useData`)
- `deleteTx('tx-1')`: `newBal = acc.bal - tx.amt = 1000 - (-45.5) = 1045.5`
- `addDeposit({ amount: 500 })`: `newBal = 1000 + 500 = 1500`
- `addTx({ amount: 45 })`: `newBal = 1000 - 45 = 955`

- [ ] **Step 1: Create `src/hooks/__tests__/useData.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../__tests__/mocks/handlers'
import { TEST_UID, BASE_URL } from '../../__tests__/mocks/db'
import { useData } from '../useData'
import { db } from '../../lib/supabase'

const R = `${BASE_URL}/rest/v1`

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(db, 'channel').mockReturnValue({
    on: function () { return this as any },
    subscribe: vi.fn().mockReturnValue(null),
  } as any)
  vi.spyOn(db, 'removeChannel').mockResolvedValue('ok' as any)
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
    await waitFor(() => expect(result.current.loading).toBe(false))
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
```

- [ ] **Step 2: Run all tests**

```bash
npm run test:run -- --reporter=verbose
```

Expected:
```
✓ src/lib/__tests__/currency.test.ts (9)
✓ src/components/__tests__/calcARD.test.ts (7)
✓ src/hooks/__tests__/useData.test.ts (10)
Test Files  3 passed (3)
Tests  26 passed (26)
```

**If tests fail:**
- Timeout errors → check `.env.test` has `VITE_SUPABASE_URL=http://test.supabase.co`
- "No handler for GET /rest/v1/..." → check `src/__tests__/setup.ts` is referenced in `vitest.config.ts` `setupFiles`
- `db.channel is not a function` → MSW setup file not loaded; verify `setupFiles` path
- TypeScript errors on `db.channel` spy → add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` if needed

- [ ] **Step 3: Push to GitHub**

```bash
git add src/hooks/__tests__/useData.test.ts
git commit -m "test: add useData hook integration tests (10 tests)"
git push origin master:main
```
