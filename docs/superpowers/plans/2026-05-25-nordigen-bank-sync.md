# Nordigen / GoCardless Bank Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect French bank accounts to QDQ via GoCardless Bank Account Data (ex-Nordigen) so transactions sync automatically without manual import.

**Architecture:** Supabase Edge Functions proxy all GoCardless API calls — credentials never reach the browser. A `bank_connections` table tracks each user's bank link + linked QDQ account. The app detects OAuth callbacks via URL query params, triggers the callback function, then auto-syncs. Frontend provides a bank picker modal and per-account sync status in Comptes.

**Tech Stack:** GoCardless Bank Account Data API (`bankaccountdata.gocardless.com/api/v2`), Supabase Edge Functions (Deno), React 18 + TypeScript, Supabase CLI

---

## Pre-flight: Create GoCardless Account

Before any coding:
1. Go to `https://gocardless.com/bank-account-data/`
2. Sign up → verify email → Developer Portal → **User Secrets** → Create secret
3. Save `secret_id` and `secret_key` — used in Task 2

API docs: `https://developer.gocardless.com/bank-account-data/`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `supabase/functions/_shared/nordigen.ts` | Token auth + typed GET/POST wrappers for GoCardless API |
| `supabase/functions/nordigen-institutions/index.ts` | List French banks |
| `supabase/functions/nordigen-init/index.ts` | Create requisition → return bank auth URL |
| `supabase/functions/nordigen-callback/index.ts` | After bank auth: fetch account IDs, activate connection |
| `supabase/functions/nordigen-sync/index.ts` | Fetch booked transactions, upsert to DB |
| `src/lib/nordigen.ts` | Client: call edge functions (typed fetch wrappers) |
| `src/hooks/useNordigen.ts` | React hook: connections state, sync, callback handling |
| `src/screens/modals/BankConnect.tsx` | Bank picker modal: search → select → link QDQ account → redirect |

### Modified files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `BankConnection` interface |
| `src/App.tsx` | Detect `?ref=` callback on load, wire BankConnect modal, useNordigen hook |
| `src/screens/Comptes.tsx` | "Connecter une banque" button + sync status badge per account |

---

## Task 1: DB Schema

**Files:** SQL run in Supabase dashboard SQL Editor

- [ ] **Step 1: Run migration**

Open Supabase Dashboard → SQL Editor → New query → paste and run:

```sql
-- Bank connections
CREATE TABLE IF NOT EXISTS bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  institution_id text NOT NULL,
  institution_name text NOT NULL,
  institution_logo text,
  requisition_id text UNIQUE NOT NULL,
  nordigen_account_ids text[] NOT NULL DEFAULT '{}',
  qdq_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  -- status: pending | active | expired | error
  last_synced_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own bank connections"
  ON bank_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Track imported transaction IDs to avoid duplicates
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nordigen_id text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_nordigen_id_idx
  ON transactions(nordigen_id)
  WHERE nordigen_id IS NOT NULL;
```

- [ ] **Step 2: Verify**

Table Editor → confirm `bank_connections` exists with all columns. Check `transactions` has `nordigen_id` column.

- [ ] **Step 3: Commit placeholder**

```bash
mkdir -p supabase/functions/_shared
echo "-- migration applied in Supabase dashboard (2026-05-25)" > supabase/schema.sql
git add supabase/schema.sql
git commit -m "chore: Nordigen schema (applied to Supabase dashboard)"
```

---

## Task 2: Supabase CLI + Shared Client

**Files:**
- Create: `supabase/functions/_shared/nordigen.ts`

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -g supabase
supabase --version
# Expected: supabase 1.x.x or higher
```

- [ ] **Step 2: Link project**

```bash
# Project ref = Supabase Dashboard → Settings → General → Reference ID
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

- [ ] **Step 3: Set secrets**

```bash
supabase secrets set NORDIGEN_SECRET_ID=your_secret_id_here
supabase secrets set NORDIGEN_SECRET_KEY=your_secret_key_here
```

- [ ] **Step 4: Create shared client**

Create `supabase/functions/_shared/nordigen.ts`:

```typescript
const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export interface Institution {
  id: string
  name: string
  bic: string
  logo: string
  countries: string[]
}

export interface NordigenTransaction {
  transactionId: string
  bookingDate: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  creditorName?: string
  debtorName?: string
  remittanceInformationUnstructured?: string
  additionalInformation?: string
}

export async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret_id: Deno.env.get('NORDIGEN_SECRET_ID'),
      secret_key: Deno.env.get('NORDIGEN_SECRET_KEY'),
    }),
  })
  if (!res.ok) throw new Error(`GoCardless auth failed: ${res.status}`)
  const data = await res.json()
  return data.access as string
}

export async function nordigenGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function nordigenPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`POST ${path} failed: ${res.status} ${err}`)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/nordigen.ts
git commit -m "feat: GoCardless shared client (Edge Function utility)"
```

---

## Task 3: Edge Function — nordigen-institutions

**Files:**
- Create: `supabase/functions/nordigen-institutions/index.ts`

- [ ] **Step 1: Create function**

```typescript
// supabase/functions/nordigen-institutions/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getToken, nordigenGet, type Institution } from '../_shared/nordigen.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const token = await getToken()
    const institutions = await nordigenGet<Institution[]>('/institutions/?country=fr', token)
    return new Response(JSON.stringify(institutions), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy nordigen-institutions --no-verify-jwt
```

- [ ] **Step 3: Test**

```bash
curl https://YOUR_PROJECT_REF.supabase.co/functions/v1/nordigen-institutions
# Expected: JSON array — [{id, name, bic, logo, countries}, ...]
# Should see BNP_PARIBAS_BNPAFRPP, CREDIT_AGRICOLE, etc.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/nordigen-institutions/
git commit -m "feat: nordigen-institutions edge function"
```

---

## Task 4: Edge Function — nordigen-init

Creates requisition, returns bank auth URL. Stores pending connection in DB.

**Files:**
- Create: `supabase/functions/nordigen-init/index.ts`

- [ ] **Step 1: Create function**

```typescript
// supabase/functions/nordigen-init/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getToken, nordigenPost } from '../_shared/nordigen.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const REDIRECT_URI = 'https://solde-app.vercel.app/'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt!)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const { institution_id, institution_name, institution_logo, qdq_account_id } = await req.json()

    const token = await getToken()
    const requisition = await nordigenPost<{ id: string; link: string }>('/requisitions/', token, {
      redirect: REDIRECT_URI,
      institution_id,
      reference: `${user.id}_${Date.now()}`,
      user_language: 'FR',
    })

    await supabase.from('bank_connections').insert({
      user_id: user.id,
      institution_id,
      institution_name,
      institution_logo: institution_logo || null,
      requisition_id: requisition.id,
      qdq_account_id: qdq_account_id || null,
      status: 'pending',
      expires_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
    })

    return new Response(
      JSON.stringify({ link: requisition.link, requisition_id: requisition.id }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy nordigen-init
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/nordigen-init/
git commit -m "feat: nordigen-init edge function (create requisition)"
```

---

## Task 5: Edge Function — nordigen-callback

After bank auth, fetches account IDs from the requisition and activates the connection.

**Files:**
- Create: `supabase/functions/nordigen-callback/index.ts`

- [ ] **Step 1: Create function**

```typescript
// supabase/functions/nordigen-callback/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getToken, nordigenGet } from '../_shared/nordigen.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt!)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const { requisition_id } = await req.json()

    const { data: conn, error: connErr } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('requisition_id', requisition_id)
      .eq('user_id', user.id)
      .single()

    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), { status: 404, headers: CORS })
    }

    const token = await getToken()
    const reqData = await nordigenGet<{ id: string; accounts: string[]; status: string }>(
      `/requisitions/${requisition_id}/`,
      token
    )

    if (!reqData.accounts || reqData.accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No accounts — user may not have completed bank auth' }),
        { status: 400, headers: CORS }
      )
    }

    await supabase.from('bank_connections').update({
      nordigen_account_ids: reqData.accounts,
      status: 'active',
    }).eq('id', conn.id)

    return new Response(
      JSON.stringify({ success: true, account_count: reqData.accounts.length }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy nordigen-callback
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/nordigen-callback/
git commit -m "feat: nordigen-callback edge function (activate connection)"
```

---

## Task 6: Edge Function — nordigen-sync

Fetches booked transactions for all active connections, upserts to DB.

**Files:**
- Create: `supabase/functions/nordigen-sync/index.ts`

- [ ] **Step 1: Create function**

```typescript
// supabase/functions/nordigen-sync/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getToken, nordigenGet, type NordigenTransaction } from '../_shared/nordigen.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function mapTx(tx: NordigenTransaction, qdqAccountId: string, userId: string) {
  const amount = parseFloat(tx.transactionAmount.amount)
  const merchant = amount < 0
    ? (tx.creditorName || tx.remittanceInformationUnstructured || tx.additionalInformation || 'Inconnu')
    : (tx.debtorName || tx.remittanceInformationUnstructured || 'Virement entrant')
  return {
    user_id: userId,
    account_id: qdqAccountId,
    merchant: merchant.slice(0, 100),
    amount,
    tx_date: tx.bookingDate || tx.valueDate || new Date().toISOString().slice(0, 10),
    category: amount < 0 ? 'Divers' : 'Revenu',
    icon: amount < 0 ? '💳' : '💰',
    nordigen_id: tx.transactionId,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt!)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const { data: connections } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ synced: 0 }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const token = await getToken()
    let totalSynced = 0

    for (const conn of connections) {
      if (!conn.qdq_account_id) continue

      const dateFrom = conn.last_synced_at
        ? conn.last_synced_at.slice(0, 10)
        : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)

      for (const nordigenAccountId of conn.nordigen_account_ids) {
        const txData = await nordigenGet<{
          transactions: { booked: NordigenTransaction[]; pending: NordigenTransaction[] }
        }>(`/accounts/${nordigenAccountId}/transactions/?date_from=${dateFrom}`, token)

        const booked = txData.transactions?.booked || []
        if (booked.length === 0) continue

        const rows = booked.map(tx => mapTx(tx, conn.qdq_account_id, user.id))

        const { error: upsertErr } = await supabase
          .from('transactions')
          .upsert(rows, { onConflict: 'nordigen_id', ignoreDuplicates: true })

        if (!upsertErr) totalSynced += rows.length
      }

      await supabase.from('bank_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', conn.id)
    }

    return new Response(
      JSON.stringify({ synced: totalSynced }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy nordigen-sync
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/nordigen-sync/
git commit -m "feat: nordigen-sync edge function (fetch + upsert transactions)"
```

---

## Task 7: Types + Client lib

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/nordigen.ts`

- [ ] **Step 1: Add BankConnection type**

At the end of `src/types/index.ts`, add:

```typescript
export interface BankConnection {
  id: string
  user_id: string
  institution_id: string
  institution_name: string
  institution_logo?: string
  requisition_id: string
  nordigen_account_ids: string[]
  qdq_account_id?: string | null
  status: 'pending' | 'active' | 'expired' | 'error'
  last_synced_at?: string | null
  expires_at?: string | null
  created_at: string
}
```

- [ ] **Step 2: Create `src/lib/nordigen.ts`**

```typescript
import { db } from './supabase'

const FN = (name: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await db.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

export async function fetchInstitutions(): Promise<
  { id: string; name: string; logo: string }[]
> {
  const res = await fetch(FN('nordigen-institutions'))
  if (!res.ok) throw new Error('Failed to load banks')
  return res.json()
}

export async function initConnection(params: {
  institution_id: string
  institution_name: string
  institution_logo?: string
  qdq_account_id?: string
}): Promise<{ link: string; requisition_id: string }> {
  const headers = await authHeader()
  const res = await fetch(FN('nordigen-init'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Failed to init bank connection')
  return res.json()
}

export async function processCallback(
  requisition_id: string
): Promise<{ success: boolean; account_count: number }> {
  const headers = await authHeader()
  const res = await fetch(FN('nordigen-callback'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requisition_id }),
  })
  if (!res.ok) throw new Error('Failed to process callback')
  return res.json()
}

export async function syncTransactions(): Promise<{ synced: number }> {
  const headers = await authHeader()
  const res = await fetch(FN('nordigen-sync'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error('Sync failed')
  return res.json()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/lib/nordigen.ts
git commit -m "feat: BankConnection type + GoCardless client lib"
```

---

## Task 8: useNordigen hook

**Files:**
- Create: `src/hooks/useNordigen.ts`

- [ ] **Step 1: Create hook**

```typescript
// src/hooks/useNordigen.ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import { syncTransactions, processCallback } from '../lib/nordigen'
import type { BankConnection } from '../types'

export function useNordigen(uid: string | null) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!uid) return
    const { data } = await db
      .from('bank_connections')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setConnections((data as BankConnection[]) || [])
  }, [uid])

  useEffect(() => { load() }, [load])

  const sync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await syncTransactions()
      setLastSynced(new Date())
      await load()
    } finally {
      setSyncing(false)
    }
  }, [syncing, load])

  const handleCallback = useCallback(async (requisitionId: string) => {
    await processCallback(requisitionId)
    await load()
    await sync()
  }, [load, sync])

  return { connections, syncing, lastSynced, sync, handleCallback, reload: load }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useNordigen.ts
git commit -m "feat: useNordigen hook"
```

---

## Task 9: BankConnect modal

**Files:**
- Create: `src/screens/modals/BankConnect.tsx`

- [ ] **Step 1: Create modal**

```tsx
// src/screens/modals/BankConnect.tsx
import { useState, useEffect } from 'react'
import { sp } from '../../lib/theme'
import { fetchInstitutions, initConnection } from '../../lib/nordigen'
import type { Theme, Account } from '../../types'

interface Institution { id: string; name: string; logo: string }

interface Props {
  t: Theme
  accounts: Account[]
  onClose: () => void
}

export const BankConnect = ({ t, accounts, onClose }: Props) => {
  const [step, setStep] = useState<'search' | 'account' | 'loading'>('search')
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Institution | null>(null)
  const [qdqAccountId, setQdqAccountId] = useState<string>(accounts[0]?.id || '')
  const [error, setError] = useState<string | null>(null)
  const [loadingBanks, setLoadingBanks] = useState(true)

  useEffect(() => {
    fetchInstitutions()
      .then(setInstitutions)
      .catch(() => setError('Impossible de charger les banques'))
      .finally(() => setLoadingBanks(false))
  }, [])

  const filtered = institutions
    .filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 20)

  const connect = async () => {
    if (!selected) return
    setStep('loading')
    try {
      const { link, requisition_id } = await initConnection({
        institution_id: selected.id,
        institution_name: selected.name,
        institution_logo: selected.logo,
        qdq_account_id: qdqAccountId || undefined,
      })
      sessionStorage.setItem('qdq-nordigen-req', requisition_id)
      window.location.href = link
    } catch {
      setError('Erreur de connexion. Réessaie.')
      setStep('account')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxHeight: '85vh', background: t.bg, borderRadius: '20px 20px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {step === 'account' && (
            <button onClick={() => setStep('search')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: t.tx }}>‹</button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, ...sp('s', 700), color: t.tx }}>
              {step === 'search' ? 'Choisir une banque' : `Lier ${selected?.name}`}
            </div>
            <div style={{ fontSize: 12, ...sp('o'), color: t.sub }}>Connexion sécurisée Open Banking</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: t.muted }}>✕</button>
        </div>

        {error && (
          <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: t.rD, borderRadius: 10, fontSize: 13, color: t.rose, ...sp('o') }}>
            {error}
          </div>
        )}

        {/* Search step */}
        {step === 'search' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="BNP, Boursorama, Crédit Agricole…"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid ' + t.bo, background: t.el, color: t.tx, fontSize: 14, ...sp('o'), boxSizing: 'border-box', marginBottom: 12 }}
            />
            {loadingBanks ? (
              <div style={{ textAlign: 'center', padding: 32, color: t.sub, fontSize: 13 }}>Chargement…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: t.sub, fontSize: 13 }}>Aucune banque trouvée</div>
            ) : filtered.map(inst => (
              <button key={inst.id} onClick={() => { setSelected(inst); setStep('account') }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: t.card, borderRadius: 12, border: '1px solid ' + t.bo, cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
                {inst.logo
                  ? <img src={inst.logo} alt={inst.name} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain', background: '#fff' }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 8, background: t.el, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏦</div>
                }
                <span style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>{inst.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Account link step */}
        {step === 'account' && selected && (
          <div style={{ flex: 1, padding: '0 20px 20px', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, ...sp('o'), color: t.sub, marginBottom: 12 }}>
              Choisir le compte QDQ à alimenter avec les transactions de <strong>{selected.name}</strong>
            </div>
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => setQdqAccountId(acc.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: qdqAccountId === acc.id ? t.mD : t.card, borderRadius: 12, border: `1.5px solid ${qdqAccountId === acc.id ? '#0A3D91' : t.bo}`, cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: acc.col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {(acc.short || acc.name.slice(0, 2)).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx }}>{acc.name}</div>
                  <div style={{ fontSize: 11, ...sp('o'), color: t.sub }}>{acc.type}</div>
                </div>
              </button>
            ))}
            <button onClick={connect}
              style={{ width: '100%', padding: '14px', background: '#0A3D91', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 14, ...sp('o', 700), color: '#fff', marginTop: 8 }}>
              Connecter {selected.name}
            </button>
          </div>
        )}

        {/* Loading step */}
        {step === 'loading' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
            <div style={{ width: 36, height: 36, border: '3px solid #0A3D9133', borderTop: '3px solid #0A3D91', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            <div style={{ fontSize: 14, ...sp('o'), color: t.sub }}>Redirection vers ta banque…</div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/modals/BankConnect.tsx
git commit -m "feat: BankConnect modal (bank search + account linking)"
```

---

## Task 10: App.tsx — callback detection + BankConnect wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

At top of `src/App.tsx`, add:
```tsx
import { BankConnect } from './screens/modals/BankConnect'
import { useNordigen } from './hooks/useNordigen'
```

- [ ] **Step 2: Add state + hook**

After existing `useState` declarations:
```tsx
const [showBankConnect, setShowBankConnect] = useState(false)
```

After the `useGroup` hook call:
```tsx
const { connections, syncing, lastSynced, sync, handleCallback, reload: reloadNordigen } = useNordigen(session ? session.user.id : null)
```

- [ ] **Step 3: Add callback detection useEffect**

After existing `useEffect` blocks, before `useData`:
```tsx
// Detect GoCardless OAuth callback (redirects back to app with ?ref= param)
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const requisitionId = sessionStorage.getItem('qdq-nordigen-req')
  const hasCallback = params.has('ref') || params.has('requisition_id')

  if (requisitionId && hasCallback && session) {
    sessionStorage.removeItem('qdq-nordigen-req')
    window.history.replaceState({}, '', '/')
    handleCallback(requisitionId).then(() => reloadData()).catch(console.error)
  }
}, [session]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Update Comptes render in renderMain()**

Replace:
```tsx
if (tab === 'comptes') return <Comptes D={data} t={t} onEdit={(a: unknown) => setEditAccount(a)} onNew={() => setEditAccount('new')} onImport={(bank: string) => { if (bank === 'pick') { setShowBankPicker(true); } else { setImportBank(bank); setShowImport(true); } }} onDeposit={(a) => setDepositAccount(a)} />;
```
With:
```tsx
if (tab === 'comptes') return <Comptes D={data} t={t} onEdit={(a: unknown) => setEditAccount(a)} onNew={() => setEditAccount('new')} onImport={(bank: string) => { if (bank === 'pick') { setShowBankPicker(true); } else { setImportBank(bank); setShowImport(true); } }} onDeposit={(a) => setDepositAccount(a)} onBankConnect={() => setShowBankConnect(true)} connections={connections} syncing={syncing} onSync={sync} />;
```

- [ ] **Step 5: Add BankConnect modal in JSX**

Before the closing `</div>` of the return, add:
```tsx
{showBankConnect && data && <BankConnect t={t} accounts={data.accounts} onClose={() => setShowBankConnect(false)} />}
```

- [ ] **Step 6: Suppress unused var warnings**

After `void reloadRec;` add:
```tsx
void reloadNordigen
void lastSynced
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: Nordigen callback detection + BankConnect wiring"
```

---

## Task 11: Comptes.tsx — sync button + status badge

**Files:**
- Modify: `src/screens/Comptes.tsx`

- [ ] **Step 1: Update Props interface**

In `src/screens/Comptes.tsx`, update interface Props:
```tsx
interface Props {
  D: AppData
  t: Theme
  onEdit: (a: Account) => void
  onNew: () => void
  onImport: (bank: string) => void
  onDeposit: (a: Account) => void
  onBankConnect: () => void
  connections: import('../types').BankConnection[]
  syncing: boolean
  onSync: () => void
}
```

Update the function signature:
```tsx
export const Comptes = ({ D, t, onEdit, onNew, onImport, onDeposit, onBankConnect, connections, syncing, onSync }: Props) => {
```

- [ ] **Step 2: Add sync buttons in header**

After the patrimoine total card (before the first section header), add:
```tsx
<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
  <button onClick={onBankConnect}
    style={{ flex: 1, padding: '10px 14px', borderRadius: 12, background: '#0A3D91', border: 'none', cursor: 'pointer', fontSize: 13, ...sp('o', 600), color: '#fff' }}>
    🏦 Connecter une banque
  </button>
  {connections.length > 0 && (
    <button onClick={onSync} disabled={syncing}
      style={{ padding: '10px 14px', borderRadius: 12, background: t.el, border: '1px solid ' + t.bo, cursor: syncing ? 'default' : 'pointer', fontSize: 13, ...sp('o', 600), color: t.tx, opacity: syncing ? 0.6 : 1 }}>
      {syncing ? '⟳' : '↻'} Sync
    </button>
  )}
</div>
```

- [ ] **Step 3: Add sync status badge per account**

Inside each account card render, after the account name `<div>`, add:
```tsx
{(() => {
  const conn = connections.find(c => c.qdq_account_id === a.id)
  if (!conn) return null
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: t.mD, marginTop: 2 }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: '#1DBE72' }} />
      <span style={{ fontSize: 10, ...sp('o', 600), color: '#1DBE72' }}>
        {conn.last_synced_at
          ? `Sync ${new Date(conn.last_synced_at).toLocaleDateString('fr-FR')}`
          : 'Connecté'}
      </span>
    </div>
  )
})()}
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -10
# Expected: ✓ built in X.XXs  (no TS errors)
```

- [ ] **Step 5: Commit + push**

```bash
git add src/screens/Comptes.tsx
git commit -m "feat: Comptes — bank connect button + sync status badge"
git push
```

---

## Task 12: Deploy Edge Functions + End-to-End Test

- [ ] **Step 1: Deploy all Edge Functions**

```bash
supabase functions deploy nordigen-institutions --no-verify-jwt
supabase functions deploy nordigen-init
supabase functions deploy nordigen-callback
supabase functions deploy nordigen-sync
```

- [ ] **Step 2: Wait for Vercel build**

After `git push` from Task 11, Vercel builds automatically. Wait ~2 min. Check `https://solde-app.vercel.app/`.

- [ ] **Step 3: End-to-end test**

1. Open `https://solde-app.vercel.app/` → login
2. Go to **Comptes** → tap **🏦 Connecter une banque**
3. Search your bank → select → choose a QDQ account → tap **Connecter**
4. Complete auth on bank website
5. GoCardless redirects back to `https://solde-app.vercel.app/?ref=xxx`
6. App detects `?ref=`, calls nordigen-callback, auto-syncs
7. Transactions appear in app within 30s

- [ ] **Step 4: Verify no duplicates**

Tap **↻ Sync** 3 times → transaction count stays the same each time.

---

## Self-Review

### Spec coverage
- ✅ List French banks — Task 3
- ✅ Create requisition + redirect — Task 4
- ✅ Process OAuth callback + store accounts — Task 5
- ✅ Fetch + upsert transactions — Task 6
- ✅ No duplicates — `nordigen_id` unique index + `ignoreDuplicates: true`
- ✅ Credentials never in frontend — all API calls via Edge Functions
- ✅ Bank picker modal — Task 9
- ✅ Per-account sync status — Task 11
- ✅ Manual sync button — Task 11
- ✅ Auto-sync after callback — `handleCallback` calls `sync()` — Task 8

### Type consistency
- `BankConnection` defined Task 7 → used Tasks 8, 10, 11 ✅
- `initConnection()` defined Task 7 → called Task 9 ✅
- `handleCallback(requisitionId)` defined Task 8 → called Task 10 ✅
- `connections`, `syncing`, `onSync`, `onBankConnect` Props defined Task 11 → passed Task 10 ✅
