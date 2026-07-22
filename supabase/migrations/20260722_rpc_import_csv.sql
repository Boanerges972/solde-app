-- Import CSV avec solde AUTORITAIRE optionnel. Comme rpc_import_batch (dédup par
-- multiplicité), mais si p_bank_balance est fourni (colonne « Solde » du relevé),
-- il POSE le solde = cette valeur au lieu de l'accumuler par delta. Le relevé
-- fait foi. Snapshot absent (null) → delta comme avant.
create or replace function public.rpc_import_csv(
    p_operation_id uuid,
    p_account_id   text,
    p_txs          jsonb,
    p_bank_balance numeric  -- null = solde par delta (comportement historique)
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

    if exists (
        select 1 from jsonb_array_elements(p_txs) e
         where (e->>'tx_date') is null
            or not public.qdq_valid_money((e->>'amount')::numeric)
            or (e->>'amount')::numeric = 0
    ) then
        raise exception 'imported row invalid (amount/tx_date)' using errcode = '22023';
    end if;

    -- Dédup par multiplicité (identique à rpc_import_batch).
    with src as (
        select e->>'merchant' as merchant,
               e->>'category' as category,
               coalesce(e->>'icon', '💳') as icon,
               (e->>'amount')::numeric as amount,
               (e->>'tx_date')::date as tx_date,
               row_number() over (
                   partition by (e->>'tx_date')::date, (e->>'amount')::numeric, e->>'merchant'
                   order by ord
               ) as rn
          from jsonb_array_elements(p_txs) with ordinality as t(e, ord)
    ), ins as (
        insert into public.transactions(merchant, category, icon, amount, account_id, tx_date, user_id)
        select s.merchant, s.category, s.icon, s.amount, p_account_id, s.tx_date, v_user_id
          from src s
         where s.rn > (
             select count(*) from public.transactions t
              where t.account_id = p_account_id
                and t.tx_date = s.tx_date
                and t.amount = s.amount
                and t.merchant is not distinct from s.merchant
         )
        returning amount
    )
    select count(*), coalesce(sum(amount), 0) into v_count, v_delta from ins;

    v_skipped := jsonb_array_length(p_txs) - v_count;

    -- Solde : le relevé fait foi s'il fournit un solde de clôture ; sinon delta.
    if p_bank_balance is not null then
        if not public.qdq_valid_money(p_bank_balance) then
            raise exception 'invalid bank balance' using errcode = '22023';
        end if;
        update public.accounts
           set balance = p_bank_balance,
               free    = p_bank_balance - coalesce(reserved, 0)
         where id = p_account_id;
    else
        update public.accounts
           set balance = coalesce(balance, 0) + v_delta,
               free    = coalesce(balance, 0) + v_delta - coalesce(reserved, 0)
         where id = p_account_id;
    end if;

    return jsonb_build_object('success', true, 'replayed', false, 'operation_id', p_operation_id,
                              'imported', v_count, 'skipped', v_skipped,
                              'balance_set', p_bank_balance is not null);
end;
$$;

revoke all on function public.rpc_import_csv(uuid,text,jsonb,numeric) from public, anon;
grant execute on function public.rpc_import_csv(uuid,text,jsonb,numeric) to authenticated;
