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
