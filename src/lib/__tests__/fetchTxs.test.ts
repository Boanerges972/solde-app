import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../__tests__/mocks/handlers'
import { BASE_URL, TEST_UID } from '../../__tests__/mocks/db'
import { fetchTxsSince } from '../fetchTxs'

const R = `${BASE_URL}/rest/v1`

const row = (id: number, tx_date: string, amount = -10) => ({
  id, tx_date, amount: String(amount), category: 'Courses',
  merchant: 'M' + id, account_id: 'acc-1', icon: '🛒',
})

/** Sert `rows` en pages, et répond au `head:true` du comptage. */
function serveRows(rows: ReturnType<typeof row>[], opts: { count?: number; pageCap?: number } = {}) {
  const cap = opts.pageCap ?? 1000
  const total = opts.count ?? rows.length
  server.use(
    // `select(..., { head: true })` émet un HEAD, pas un GET : le comptage a
    // donc son propre handler. Le total voyage dans Content-Range.
    http.head(`${R}/transactions`, () =>
      new HttpResponse(null, { status: 200, headers: { 'content-range': `0-0/${total}` } })),

    http.get(`${R}/transactions`, ({ request }) => {
      const url = new URL(request.url)
      // Curseur keyset : `or=(tx_date.gt.X,and(tx_date.eq.X,id.gt.Y))`
      const or = url.searchParams.get('or') || ''
      let rest = rows
      const m = or.match(/tx_date\.gt\.([\d-]+).*?id\.gt\.(\d+)/)
      if (m) {
        const [, d, i] = m
        rest = rows.filter(r => r.tx_date > d || (r.tx_date === d && r.id > Number(i)))
      }
      return HttpResponse.json(rest.slice(0, cap))
    }),
  )
}

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('fetchTxsSince', () => {
  it('charge une fenêtre courte et la déclare complète', async () => {
    serveRows([row(1, '2026-07-01'), row(2, '2026-07-02')])
    const { txs, complete } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(complete).toBe(true)
    expect(txs).toHaveLength(2)
  })

  it('mappe les champs, dont l\'icône (le Top 10 du rapport en dépend)', async () => {
    serveRows([row(1, '2026-07-01', -42)])
    const { txs } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(txs[0]).toMatchObject({ tx_date: '2026-07-01', amt: -42, cat: 'Courses', m: 'M1', acc: 'acc-1', ico: '🛒' })
  })

  it('pagine jusqu\'à épuisement (curseur keyset)', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1, '2026-07-01'))
    serveRows(rows, { pageCap: 10 }) // le serveur plafonne à 10 par réponse
    const { txs, complete } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(txs).toHaveLength(25)
    expect(complete).toBe(true)
  })

  it('un plafond serveur INFÉRIEUR à la page ne fait pas conclure « complet » à tort', async () => {
    // Le piège : `page.length < PAGE` semblait prouver la fin. Si PostgREST
    // plafonne à 10 alors que PAGE vaut 1000, la 1re page en renvoie 10 < 1000
    // — s'arrêter là déclarerait complet un historique tronqué.
    const rows = Array.from({ length: 30 }, (_, i) => row(i + 1, '2026-07-01'))
    serveRows(rows, { pageCap: 10 })
    const { txs } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(txs).toHaveLength(30)
  })

  it('déclare INCOMPLET si le nombre lu ne correspond pas au compte serveur', async () => {
    // Cas d'une insertion antidatée concurrente : elle atterrit avant le
    // curseur et serait manquée sans jamais être détectée.
    serveRows([row(1, '2026-07-01')], { count: 5 })
    const { complete } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(complete).toBe(false)
  })

  it('une erreur ne se confond PAS avec « aucune transaction »', async () => {
    // Sinon l'historique vide produirait le report maximal fictif.
    server.use(
      http.head(`${R}/transactions`, () => new HttpResponse(null, { status: 500 })),
      http.get(`${R}/transactions`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )
    const { txs, complete } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(complete).toBe(false)
    expect(txs).toHaveLength(0)
  })

  it('une erreur en cours de pagination rend la fenêtre incomplète', async () => {
    // Le comptage passe, mais une page échoue : on ne doit pas conclure.
    server.use(
      http.head(`${R}/transactions`, () =>
        new HttpResponse(null, { status: 200, headers: { 'content-range': '0-0/10' } })),
      http.get(`${R}/transactions`, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )
    const { complete } = await fetchTxsSince(TEST_UID, '2026-07-01')
    expect(complete).toBe(false)
  })
})
