-- Synchronisation bancaire (Open Banking / DSP2 via Enable Banking).
-- Liaison entre un compte agrégé et un compte local QDQ.
-- accounts n'a ni IBAN ni référence externe → table dédiée plutôt que colonnes.
create table if not exists public.bank_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null default 'enablebanking',
  aspsp_name      text not null,
  aspsp_country   text not null default 'FR',
  eb_account_uid  text not null,
  iban            text,
  eb_name         text,
  -- Nul tant que l'utilisateur n'a pas relié ce compte agrégé à un compte QDQ.
  account_id      text references public.accounts(id) on delete set null,
  session_id      text,
  consent_expires timestamptz,
  last_sync_at    timestamptz,
  last_tx_date    date,
  created_at      timestamptz default now(),
  unique (user_id, eb_account_uid)
);

alter table public.bank_links enable row level security;

-- Le client ne voit que ses propres liaisons. Les Edge Functions passent par la
-- service_role (hors RLS) ; cette policy protège l'accès direct depuis le front.
create policy bank_links_owner on public.bank_links
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.bank_links to authenticated;
