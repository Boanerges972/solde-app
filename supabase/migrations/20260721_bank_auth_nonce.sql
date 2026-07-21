-- Nonce à usage unique liant un consentement au start_auth qui l'a initié.
-- Empêche le rejeu d'un `state` capturé et les states périmés. Consommé
-- (supprimé) au callback ; un second passage ne trouve rien → rejet.
create table if not exists public.bank_auth_nonce (
  nonce      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Accès service_role uniquement (Edge Functions). Aucun accès client.
alter table public.bank_auth_nonce enable row level security;
