-- Dédup EXACTE par identifiant bancaire stable (Enable Banking transaction_id
-- ∥ entry_reference). La dédup par multiplicité (date,montant,marchand) de
-- rpc_import_batch se trompe si la banque corrige un libellé/une date entre deux
-- tirages → recompte. L'import agrégé passe par rpc_import_ext.
alter table public.transactions add column if not exists external_id text;

-- Unicité par COMPTE (pas par utilisateur) : un même external_id peut
-- légitimement exister sur deux comptes du même user (les deux jambes d'un
-- virement interne partagent parfois entry_reference). Partiel : n'indexe que
-- l'agrégation ; l'import CSV (external_id NULL) cohabite sans conflit.
create unique index if not exists transactions_account_external_uq
  on public.transactions (account_id, external_id)
  where external_id is not null;

create or replace function public.rpc_import_ext(
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

    -- Idempotence plein-batch (rejeu réseau du MÊME operation_id).
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

    -- Cette voie EXIGE un external_id par ligne : c'est la clé de dédup.
    if exists (
        select 1 from jsonb_array_elements(p_txs) e
         where (e->>'external_id') is null or (e->>'external_id') = ''
            or (e->>'tx_date') is null
            or not public.qdq_valid_money((e->>'amount')::numeric)
            or (e->>'amount')::numeric = 0
    ) then
        raise exception 'imported row invalid (external_id/amount/tx_date)' using errcode = '22023';
    end if;

    -- Dédup EXACTE par (compte, external_id). `distinct on` neutralise les
    -- doublons intra-batch ; versions divergentes d'un même id → on garde la
    -- plus RÉCENTE (tie-break déterministe) ; `on conflict do nothing`
    -- neutralise ce qui existe déjà. Delta = insertion réelle uniquement.
    with src as (
        select distinct on (e->>'external_id')
               e->>'external_id' as external_id,
               e->>'merchant' as merchant,
               e->>'category' as category,
               coalesce(e->>'icon', '💳') as icon,
               (e->>'amount')::numeric as amount,
               (e->>'tx_date')::date as tx_date
          from jsonb_array_elements(p_txs) e
         order by e->>'external_id', (e->>'tx_date')::date desc
    ), ins as (
        insert into public.transactions(merchant, category, icon, amount, account_id, tx_date, user_id, external_id)
        select s.merchant, s.category, s.icon, s.amount, p_account_id, s.tx_date, v_user_id, s.external_id
          from src s
        on conflict (account_id, external_id) where external_id is not null do nothing
        returning amount
    )
    select count(*), coalesce(sum(amount), 0) into v_count, v_delta from ins;

    v_skipped := jsonb_array_length(p_txs) - v_count;

    update public.accounts
       set balance = coalesce(balance, 0) + v_delta,
           free    = coalesce(balance, 0) + v_delta - coalesce(reserved, 0)
     where id = p_account_id;

    return jsonb_build_object('success', true, 'replayed', false, 'operation_id', p_operation_id,
                              'imported', v_count, 'skipped', v_skipped, 'balance_delta', v_delta);
end;
$$;

revoke all on function public.rpc_import_ext(uuid,text,jsonb) from public, anon;
grant execute on function public.rpc_import_ext(uuid,text,jsonb) to authenticated;
