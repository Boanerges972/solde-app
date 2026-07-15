-- ============================================================================
-- QDQ — RPC financières transactionnelles (idempotentes, atomiques) — v3
-- ============================================================================
-- v3 = v2 + 2e passe adversariale Claude/Codex :
--   [MAJEUR]   rpc_delete_transfer VALIDE les invariants avant mutation :
--              exactement 2 jambes, 2 comptes distincts, montants valides,
--              somme = 0 (conservation). Refuse 1 jambe / 3+ / non-opposées.
--   [MAJEUR]   semaine/année CALCULÉES SERVEUR depuis tx_date (qdq_week, réplique
--              la formule app floor(jours/7)+1) — plus AUCUN param client.
--   [MAJEUR]   backfill week/year des tx héritées (pré-migration) depuis tx_date.
--
-- v2 = v1 + 1re passe adversariale :
--   [BLOQUANT] rpc_delete_tx refuse une jambe de virement ; rpc_delete_transfer
--              dédiée annule les 2 lignes + 2 soldes atomiquement.
--   [BLOQUANT] garde anti-NaN / échelle (montants money = 2 décimales) partout.
--   [MAJEUR]   week_number/year stockés sur la transaction (serveur-autoritaire).
--   [MAJEUR]   group_id/paid_by retirés de rpc_add_tx (chemin perso ; évite un
--              bypass RLS via SECURITY DEFINER sur la feature groupe).
--   [MAJEUR]   ordre de verrous uniforme : financial_ops réservé EN PREMIER.
--   [MAJEUR]   rpc_set_reserved : modifier reserved recalcule free atomiquement.
--   [MINEUR]   plafond taille du batch import ; validation par ligne.
--
-- Différé (assumé, non bloquant pour 1 user solo) : hash du payload dans
-- financial_ops. operation_id frais + persisté IDB au retry = même payload par
-- construction, divergence impossible.
--
-- Convention montant : négatif = dépense (→ weekly_budgets.spent), positif =
-- entrée. balance TOUJOURS en DELTA, jamais SUM(tx) → préserve le solde initial.
--
-- MIGRATION ADDITIVE. Section 7 (destructif, REVOKE UPDATE + RLS) à part.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 1 — DDL additif + idempotence + helper
-- ─────────────────────────────────────────────────────────────────────────
begin;

alter table public.transactions
    add column if not exists operation_id uuid,
    add column if not exists transfer_id  uuid,
    add column if not exists week_number  integer,
    add column if not exists year         integer;

create unique index if not exists transactions_operation_id_uidx
    on public.transactions (operation_id) where operation_id is not null;

create index if not exists transactions_transfer_id_idx
    on public.transactions (transfer_id) where transfer_id is not null;

create table if not exists public.financial_ops (
    operation_id uuid        primary key,
    user_id      uuid        not null,
    kind         text        not null
                 check (kind in ('add_tx','delete_tx','transfer','delete_transfer','import','set_reserved')),
    created_at   timestamptz not null default now()
);
alter table public.financial_ops enable row level security;
revoke all on table public.financial_ops from anon, authenticated;

-- Montant money valide : non NULL, non NaN/±Inf, exactement 2 décimales.
create or replace function public.qdq_valid_money(p numeric)
returns boolean
language sql
immutable
as $$
    select p is not null
       and p <> 'NaN'::numeric
       and p <>  'Infinity'::numeric
       and p <> '-Infinity'::numeric
       and p = round(p, 2)
$$;

-- Numéro de semaine RÉPLIQUANT la formule app (useData.ts:18) :
--   ceil((now_ms - jan1local_ms)/604800000) ≡ floor(jours_depuis_1erJanv/7)+1.
-- Volontairement PAS ISO — l'app lit weekly_budgets avec cette formule ;
-- extract(week) réintroduirait le mismatch. Serveur-autoritaire.
create or replace function public.qdq_week(d date)
returns integer
language sql
immutable
as $$
    select floor((d - make_date(extract(year from d)::int, 1, 1)) / 7.0)::int + 1
$$;

-- Backfill des tx héritées (pré-migration) : week/year depuis tx_date, pour que
-- leur suppression restaure correctement weekly_budgets.spent.
update public.transactions
   set week_number = public.qdq_week(tx_date),
       year        = extract(year from tx_date)::int
 where week_number is null or year is null;

commit;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 2 — rpc_add_tx (dépense OU entrée ; chemin perso, sans groupe)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_add_tx(
    p_operation_id uuid,
    p_account_id   text,
    p_merchant     text,
    p_category     text,
    p_icon         text,
    p_amount       numeric,
    p_tx_date      date,
    p_budget       numeric default 400
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id     uuid := auth.uid();
    v_owner_id    uuid;
    v_existing    public.financial_ops%rowtype;
    v_inserted    boolean;
    v_tx_id       integer;
    v_week        integer;
    v_year        integer;
    v_spent_delta numeric := greatest(-p_amount, 0);
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null then
        raise exception 'operation_id is required' using errcode = '22004';
    end if;
    if not public.qdq_valid_money(p_amount) or p_amount = 0 then
        raise exception 'amount invalid (NaN/Inf/echelle/zero)' using errcode = '22023';
    end if;
    if p_tx_date is null then
        raise exception 'tx_date is required' using errcode = '22004';
    end if;
    -- Semaine/année calculées SERVEUR depuis tx_date (pas de contrôle client).
    v_week := public.qdq_week(p_tx_date);
    v_year := extract(year from p_tx_date)::int;

    -- Idempotence RÉSERVÉE EN PREMIER (ordre de verrous uniforme, anti-deadlock).
    insert into public.financial_ops(operation_id, user_id, kind)
    values (p_operation_id, v_user_id, 'add_tx')
    on conflict (operation_id) do nothing
    returning true into v_inserted;

    if not coalesce(v_inserted, false) then
        select * into v_existing from public.financial_ops where operation_id = p_operation_id;
        if v_existing.user_id <> v_user_id or v_existing.kind <> 'add_tx' then
            raise exception 'operation_id already used' using errcode = '23505';
        end if;
        return jsonb_build_object('success', true, 'replayed', true, 'operation_id', p_operation_id);
    end if;

    select a.user_id into v_owner_id from public.accounts a
     where a.id = p_account_id for update;
    if not found or v_owner_id <> v_user_id then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    insert into public.transactions(
        merchant, category, icon, amount, account_id, tx_date,
        user_id, operation_id, week_number, year)
    values (
        p_merchant, p_category, coalesce(p_icon, '💳'), p_amount, p_account_id,
        p_tx_date, v_user_id, p_operation_id, v_week, v_year)
    returning id into v_tx_id;

    update public.accounts
       set balance = coalesce(balance, 0) + p_amount,
           free    = coalesce(balance, 0) + p_amount - coalesce(reserved, 0)
     where id = p_account_id;

    if v_spent_delta > 0 then
        insert into public.weekly_budgets(user_id, week_number, year, budget, spent)
        values (v_user_id, v_week, v_year, coalesce(p_budget, 400), v_spent_delta)
        on conflict (user_id, week_number, year)
        do update set spent = coalesce(public.weekly_budgets.spent, 0) + excluded.spent;
    end if;

    return jsonb_build_object('success', true, 'replayed', false,
                              'operation_id', p_operation_id, 'transaction_id', v_tx_id);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 3 — rpc_delete_tx (refuse les virements ; semaine lue sur la tx)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_delete_tx(
    p_operation_id   uuid,
    p_transaction_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id     uuid := auth.uid();
    v_existing    public.financial_ops%rowtype;
    v_inserted    boolean;
    v_tx          public.transactions%rowtype;
    v_owner_id    uuid;
    v_spent_delta numeric;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null then
        raise exception 'operation_id is required' using errcode = '22004';
    end if;

    insert into public.financial_ops(operation_id, user_id, kind)
    values (p_operation_id, v_user_id, 'delete_tx')
    on conflict (operation_id) do nothing
    returning true into v_inserted;

    if not coalesce(v_inserted, false) then
        select * into v_existing from public.financial_ops where operation_id = p_operation_id;
        if v_existing.user_id <> v_user_id or v_existing.kind <> 'delete_tx' then
            raise exception 'operation_id already used' using errcode = '23505';
        end if;
        return jsonb_build_object('success', true, 'replayed', true, 'operation_id', p_operation_id);
    end if;

    select t.* into v_tx from public.transactions t
     where t.id = p_transaction_id for update;
    if not found or v_tx.user_id <> v_user_id then
        raise exception 'Transaction not found or forbidden' using errcode = '42501';
    end if;

    -- Une jambe de virement ne se supprime pas seule → rpc_delete_transfer.
    if v_tx.transfer_id is not null then
        raise exception 'Use rpc_delete_transfer for internal transfers' using errcode = '22023';
    end if;
    if not public.qdq_valid_money(v_tx.amount) then
        raise exception 'Stored amount invalid — refuse to alter balance' using errcode = '22023';
    end if;

    select a.user_id into v_owner_id from public.accounts a
     where a.id = v_tx.account_id for update;
    if not found or v_owner_id <> v_user_id then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    delete from public.transactions where id = v_tx.id;

    update public.accounts
       set balance = coalesce(balance, 0) - v_tx.amount,
           free    = coalesce(balance, 0) - v_tx.amount - coalesce(reserved, 0)
     where id = v_tx.account_id;

    -- Semaine/année LUES sur la tx (serveur-autoritaire). NULL si tx héritée
    -- d'avant migration → budget non restauré (semaine passée, acceptable).
    v_spent_delta := greatest(-v_tx.amount, 0);
    if v_spent_delta > 0 and v_tx.week_number is not null and v_tx.year is not null then
        update public.weekly_budgets
           set spent = greatest(coalesce(spent, 0) - v_spent_delta, 0)
         where user_id = v_user_id
           and week_number = v_tx.week_number
           and year = v_tx.year;
    end if;

    return jsonb_build_object('success', true, 'replayed', false,
                              'operation_id', p_operation_id, 'deleted_transaction_id', v_tx.id);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4 — rpc_transfer (2 lignes liées par transfer_id)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_transfer(
    p_operation_id    uuid,
    p_from_account_id text,
    p_to_account_id   text,
    p_amount          numeric,
    p_tx_date         date,
    p_note            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id     uuid := auth.uid();
    v_existing    public.financial_ops%rowtype;
    v_inserted    boolean;
    v_owned       integer;
    v_from_name   text;
    v_to_name     text;
    v_transfer_id uuid := gen_random_uuid();
    v_out_id      integer;
    v_in_id       integer;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null then
        raise exception 'operation_id is required' using errcode = '22004';
    end if;
    if p_from_account_id = p_to_account_id then
        raise exception 'Transfer accounts must be different' using errcode = '22023';
    end if;
    if not public.qdq_valid_money(p_amount) or p_amount <= 0 then
        raise exception 'Transfer amount invalid' using errcode = '22023';
    end if;
    if p_tx_date is null then
        raise exception 'tx_date is required' using errcode = '22004';
    end if;

    -- financial_ops en premier (uniforme).
    insert into public.financial_ops(operation_id, user_id, kind)
    values (p_operation_id, v_user_id, 'transfer')
    on conflict (operation_id) do nothing
    returning true into v_inserted;

    if not coalesce(v_inserted, false) then
        select * into v_existing from public.financial_ops where operation_id = p_operation_id;
        if v_existing.user_id <> v_user_id or v_existing.kind <> 'transfer' then
            raise exception 'operation_id already used' using errcode = '23505';
        end if;
        return jsonb_build_object('success', true, 'replayed', true, 'operation_id', p_operation_id);
    end if;

    -- Verrou des 2 comptes en ordre stable (anti-deadlock).
    perform 1 from public.accounts a
     where a.id in (p_from_account_id, p_to_account_id)
     order by a.id for update;

    select count(*),
           max(name) filter (where id = p_from_account_id),
           max(name) filter (where id = p_to_account_id)
      into v_owned, v_from_name, v_to_name
      from public.accounts
     where id in (p_from_account_id, p_to_account_id) and user_id = v_user_id;
    if v_owned <> 2 then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    insert into public.transactions(merchant, category, icon, amount, account_id, tx_date, user_id, transfer_id)
    values (coalesce(p_note, 'Virement vers ' || v_to_name), 'Virement interne', '🔄',
            -p_amount, p_from_account_id, p_tx_date, v_user_id, v_transfer_id)
    returning id into v_out_id;

    insert into public.transactions(merchant, category, icon, amount, account_id, tx_date, user_id, transfer_id)
    values (coalesce(p_note, 'Virement depuis ' || v_from_name), 'Virement interne', '🔄',
            p_amount, p_to_account_id, p_tx_date, v_user_id, v_transfer_id)
    returning id into v_in_id;

    update public.accounts
       set balance = coalesce(balance, 0) - p_amount,
           free    = coalesce(balance, 0) - p_amount - coalesce(reserved, 0)
     where id = p_from_account_id;
    update public.accounts
       set balance = coalesce(balance, 0) + p_amount,
           free    = coalesce(balance, 0) + p_amount - coalesce(reserved, 0)
     where id = p_to_account_id;

    return jsonb_build_object('success', true, 'replayed', false, 'operation_id', p_operation_id,
                              'transfer_id', v_transfer_id, 'out_transaction_id', v_out_id, 'in_transaction_id', v_in_id);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 4b — rpc_delete_transfer (annule les 2 jambes + 2 soldes)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_delete_transfer(
    p_operation_id uuid,
    p_transfer_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id  uuid := auth.uid();
    v_existing public.financial_ops%rowtype;
    v_inserted boolean;
    v_leg      public.transactions%rowtype;
    v_n        integer := 0;
    v_distinct integer := 0;
    v_sum      numeric;
    v_all_valid boolean;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null or p_transfer_id is null then
        raise exception 'operation_id and transfer_id required' using errcode = '22004';
    end if;

    insert into public.financial_ops(operation_id, user_id, kind)
    values (p_operation_id, v_user_id, 'delete_transfer')
    on conflict (operation_id) do nothing
    returning true into v_inserted;

    if not coalesce(v_inserted, false) then
        select * into v_existing from public.financial_ops where operation_id = p_operation_id;
        if v_existing.user_id <> v_user_id or v_existing.kind <> 'delete_transfer' then
            raise exception 'operation_id already used' using errcode = '23505';
        end if;
        return jsonb_build_object('success', true, 'replayed', true, 'operation_id', p_operation_id);
    end if;

    -- 1) Verrou de TOUTES les jambes (pose les row locks).
    perform 1 from public.transactions t
     where t.transfer_id = p_transfer_id and t.user_id = v_user_id
     for update;

    -- 2) VALIDER les invariants AVANT toute mutation : exactement 2 jambes,
    --    2 comptes distincts, montants valides, somme nulle (conservation).
    select count(*), count(distinct account_id), sum(amount), bool_and(public.qdq_valid_money(amount))
      into v_n, v_distinct, v_sum, v_all_valid
      from public.transactions
     where transfer_id = p_transfer_id and user_id = v_user_id;

    if v_n = 0 then
        raise exception 'Transfer not found' using errcode = 'P0002';
    end if;
    if v_n <> 2 or v_distinct <> 2 then
        raise exception 'Invalid transfer structure (legs=%, accounts=%)', v_n, v_distinct using errcode = '22023';
    end if;
    if not coalesce(v_all_valid, false) or coalesce(v_sum, 1) <> 0 then
        raise exception 'Transfer legs not conservative (sum=%)', v_sum using errcode = '22023';
    end if;

    -- 3) Verrou des 2 comptes en ordre stable (anti-deadlock, cohérent transfer).
    perform 1 from public.accounts a
     where a.id in (select account_id from public.transactions
                     where transfer_id = p_transfer_id and user_id = v_user_id)
       and a.user_id = v_user_id
     order by a.id for update;

    -- 4) Annuler chaque jambe.
    for v_leg in
        select t.* from public.transactions t
         where t.transfer_id = p_transfer_id and t.user_id = v_user_id
         order by t.account_id, t.id
    loop
        update public.accounts
           set balance = coalesce(balance, 0) - v_leg.amount,
               free    = coalesce(balance, 0) - v_leg.amount - coalesce(reserved, 0)
         where id = v_leg.account_id;
        delete from public.transactions where id = v_leg.id;
    end loop;

    return jsonb_build_object('success', true, 'replayed', false,
                              'operation_id', p_operation_id, 'legs_deleted', v_n);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 5 — rpc_import_batch (N insert + 1 delta ; plafonné ; validé)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_import_batch(
    p_operation_id uuid,
    p_account_id   text,
    p_txs          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id  uuid := auth.uid();
    v_owner_id uuid;
    v_existing public.financial_ops%rowtype;
    v_inserted boolean;
    v_delta    numeric := 0;
    v_count    integer := 0;
    v_skipped  integer := 0;
    v_amt      numeric;
    v_row      jsonb;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null then
        raise exception 'operation_id is required' using errcode = '22004';
    end if;
    if p_txs is null or jsonb_typeof(p_txs) <> 'array' or jsonb_array_length(p_txs) = 0 then
        raise exception 'p_txs must be a non-empty json array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_txs) > 2000 then
        raise exception 'batch too large (max 2000)' using errcode = '54000';
    end if;

    insert into public.financial_ops(operation_id, user_id, kind)
    values (p_operation_id, v_user_id, 'import')
    on conflict (operation_id) do nothing
    returning true into v_inserted;

    if not coalesce(v_inserted, false) then
        select * into v_existing from public.financial_ops where operation_id = p_operation_id;
        if v_existing.user_id <> v_user_id or v_existing.kind <> 'import' then
            raise exception 'operation_id already used' using errcode = '23505';
        end if;
        return jsonb_build_object('success', true, 'replayed', true, 'operation_id', p_operation_id);
    end if;

    select a.user_id into v_owner_id from public.accounts a
     where a.id = p_account_id for update;
    if not found or v_owner_id <> v_user_id then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    for v_row in select * from jsonb_array_elements(p_txs)
    loop
        v_amt := (v_row->>'amount')::numeric;
        if not public.qdq_valid_money(v_amt) or v_amt = 0 then
            raise exception 'imported amount invalid at row %', v_count using errcode = '22023';
        end if;
        if (v_row->>'tx_date') is null then
            raise exception 'imported tx_date missing at row %', v_count using errcode = '22004';
        end if;
        -- DÉDUP : saute si une tx identique existe déjà sur ce compte
        -- (même date + montant + libellé). Évite les doublons au ré-import.
        -- Tradeoff assumé : 2 tx réellement identiques le même jour → 1 gardée.
        if exists (
            select 1 from public.transactions t
             where t.account_id = p_account_id
               and t.tx_date = (v_row->>'tx_date')::date
               and t.amount = v_amt
               and t.merchant is not distinct from (v_row->>'merchant')
        ) then
            v_skipped := v_skipped + 1;
            continue;
        end if;
        insert into public.transactions(merchant, category, icon, amount, account_id, tx_date, user_id)
        values (v_row->>'merchant', v_row->>'category', coalesce(v_row->>'icon', '💳'),
                v_amt, p_account_id, (v_row->>'tx_date')::date, v_user_id);
        v_delta := v_delta + v_amt;
        v_count := v_count + 1;
    end loop;

    update public.accounts
       set balance = coalesce(balance, 0) + v_delta,
           free    = coalesce(balance, 0) + v_delta - coalesce(reserved, 0)
     where id = p_account_id;

    return jsonb_build_object('success', true, 'replayed', false, 'operation_id', p_operation_id,
                              'imported', v_count, 'skipped', v_skipped, 'balance_delta', v_delta);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 5b — rpc_set_reserved (modifier reserved recalcule free)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.rpc_set_reserved(
    p_account_id text,
    p_reserved   numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_user_id  uuid := auth.uid();
    v_owner_id uuid;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if not public.qdq_valid_money(p_reserved) or p_reserved < 0 then
        raise exception 'reserved invalid' using errcode = '22023';
    end if;

    select a.user_id into v_owner_id from public.accounts a
     where a.id = p_account_id for update;
    if not found or v_owner_id <> v_user_id then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    update public.accounts
       set reserved = p_reserved,
           free     = coalesce(balance, 0) - p_reserved
     where id = p_account_id;

    return jsonb_build_object('success', true, 'account_id', p_account_id, 'reserved', p_reserved);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Droits d'exécution (additif)
-- ─────────────────────────────────────────────────────────────────────────
revoke all on function public.rpc_add_tx(uuid,text,text,text,text,numeric,date,numeric) from public, anon;
revoke all on function public.rpc_delete_tx(uuid,integer) from public, anon;
revoke all on function public.rpc_transfer(uuid,text,text,numeric,date,text) from public, anon;
revoke all on function public.rpc_delete_transfer(uuid,uuid) from public, anon;
revoke all on function public.rpc_import_batch(uuid,text,jsonb) from public, anon;
revoke all on function public.rpc_set_reserved(text,numeric) from public, anon;

grant execute on function public.rpc_add_tx(uuid,text,text,text,text,numeric,date,numeric) to authenticated;
grant execute on function public.rpc_delete_tx(uuid,integer) to authenticated;
grant execute on function public.rpc_transfer(uuid,text,text,numeric,date,text) to authenticated;
grant execute on function public.rpc_delete_transfer(uuid,uuid) to authenticated;
grant execute on function public.rpc_import_batch(uuid,text,jsonb) to authenticated;
grant execute on function public.rpc_set_reserved(text,numeric) to authenticated;


-- ============================================================================
-- SECTION 7 — DESTRUCTIF : verrouillage des soldes. NE PAS jouer avec la
-- migration initiale. PRÉREQUIS avant de l'activer (sinon casse la prod) :
--   1. Client 100 % basculé : useData (add/delete/transfer/deposit),
--      useOfflineSync (replay), ImportUniversal → RPC.
--   2. EditAccount.tsx:35 NE DOIT PLUS envoyer balance/free/reserved sur un
--      update nu → migrer vers rpc_set_reserved + update limité (name,short,
--      type,color). Sinon toute édition de compte est refusée en bloc.
--   3. Création de compte = INSERT (import "create&import") : garder une policy
--      INSERT owner sur accounts.
-- Après activation, le rollback par feature flag ne suffit plus.
-- ============================================================================
-- alter table public.accounts enable row level security;
--
-- drop policy if exists accounts_owner_select on public.accounts;
-- create policy accounts_owner_select on public.accounts
--   for select to authenticated using (user_id = auth.uid());
--
-- drop policy if exists accounts_owner_insert on public.accounts;
-- create policy accounts_owner_insert on public.accounts
--   for insert to authenticated with check (user_id = auth.uid());
--
-- drop policy if exists accounts_owner_update on public.accounts;
-- create policy accounts_owner_update on public.accounts
--   for update to authenticated
--   using (user_id = auth.uid()) with check (user_id = auth.uid());
--
-- revoke update on table public.accounts from anon, authenticated;
-- grant update (name, short_name, type, color) on public.accounts to authenticated;
-- -- balance/free/reserved : modifiables UNIQUEMENT via RPC.
-- ============================================================================
