# Vitest Tests — QDQ PWA Design Spec

**Date:** 2026-05-19  
**Status:** Approved

## Goal

Add a comprehensive test suite covering critical business logic and data flows in the QDQ PWA using Vitest + MSW.

## Architecture

### Stack
- **Vitest** (already installed) — test runner
- **MSW 2.x** (`msw` + `@mswjs/server`) — intercept Supabase REST/fetch calls
- **@testing-library/react** — `renderHook` for hooks
- **jsdom** — browser environment simulation

### File Structure

```
src/
  __tests__/
    setup.ts                  ← vitest global setup: MSW server start/reset/stop
    mocks/
      handlers.ts             ← MSW handlers for Supabase REST endpoints
      db.ts                   ← shared fixture data (accounts, transactions)
  lib/__tests__/
    currency.test.ts          ← pure function tests: fmt, fmtS, setCurrency
  components/__tests__/
    calcARD.test.ts           ← calcARD business logic (rejection alert)
  hooks/__tests__/
    useData.test.ts           ← hook integration: addTx, addDeposit, deleteTx
```

### vitest.config.ts changes
- `environment: 'jsdom'`
- `setupFiles: ['src/__tests__/setup.ts']`

## Test Coverage (~25 tests)

### 1. `currency.test.ts` — 8 tests
Tests for `fmt`, `fmtS`, `setCurrency` in `src/lib/currency.ts`.

| Test | Description |
|------|-------------|
| `fmt(0)` | Returns `0,00 €` |
| `fmt(1234.5)` | Returns `1 234,50 €` |
| `fmt(-50)` | Returns `50,00 €` (fmt strips sign) |
| `fmtS(100)` | Returns `100,00 €` |
| `fmtS(-100)` | Returns `−100,00 €` (prefixes minus) |
| `setCurrency USD` | `fmt(10)` returns `$10.00` |
| `setCurrency XOF` | `fmt(1000)` returns `1 000 FCFA` |
| `setCurrency revert EUR` | Reverts correctly |

### 2. `calcARD.test.ts` — 7 tests
Tests for `calcARD` exported from `src/components/RejectionAlert.tsx`.

| Test | Description |
|------|-------------|
| No recurrings | All accounts status `ok` |
| Committed < balance | Status `ok` |
| Committed > balance but < balance+overdraft | Status `warning` |
| Committed > balance+overdraft | Status `danger` |
| Zero balance, no overdraft, has recurring | Status `danger` |
| Multiple accounts, mixed statuses | Each computed independently |
| `days` param scales recurring amounts | 14 days = half of monthly |

### 3. `useData.test.ts` — 10 tests
Integration tests via `renderHook` + MSW handlers mocking Supabase REST.

| Test | Description |
|------|-------------|
| `addTx` inserts transaction | POST to transactions endpoint |
| `addTx` deducts from account balance | PATCH accounts with bal - n |
| `addTx` updates weekly_budget spent | PATCH/upsert weekly_budgets |
| `addDeposit` inserts positive transaction | amount = +n (not negated) |
| `addDeposit` adds to account balance | PATCH accounts with bal + n |
| `deleteTx` deletes transaction | DELETE transactions |
| `deleteTx` reverses account balance | PATCH accounts with bal - tx.amt |
| `addTransfer` creates two transactions | Two POSTs, both "Virement interne" |
| `addTransfer` updates both account balances | Two PATCHes |
| Error response from Supabase | Returns error object, no crash |

## MSW Handler Strategy

Supabase REST uses PostgREST format: `GET/POST/PATCH/DELETE /rest/v1/{table}?...`

Handlers intercept:
- `GET /rest/v1/accounts` → return fixture accounts
- `GET /rest/v1/transactions` → return fixture transactions
- `GET /rest/v1/weekly_budgets` → return fixture budget
- `GET /rest/v1/next_debits` → return []
- `POST /rest/v1/transactions` → record call, return 201
- `PATCH /rest/v1/accounts` → record call, return 200
- `PATCH /rest/v1/weekly_budgets` / upsert → return 200

Fixtures (`mocks/db.ts`) define: 2 accounts (one positive, one negative balance), 5 transactions, 1 weekly budget.

## Key Constraints

- Tests must not hit real Supabase — all network calls intercepted by MSW
- `localStorage` mocked per test (reset in `beforeEach`)
- `setCurrency` state is module-level — reset to EUR after each test that changes it
- No snapshots — assert specific values only
- Each test file runs independently (no shared state)

## Dependencies to Install

```bash
npm install -D msw @testing-library/react @testing-library/user-event jsdom
```

`msw` may already be installed — check `package.json` first.
