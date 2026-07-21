-- Chemin synchro bancaire ATOMIQUE. Remplace rpc_import_ext (qui accumulait un
-- delta, incompatible avec « la banque fait foi »). Ici : insertion/dédup des
-- transactions SANS jamais toucher le solde par delta, PUIS pose du solde =
-- snapshot banque, le tout dans UNE transaction. Si aucun snapshot (null), le
-- solde n'est pas touché : jamais de double-compte silencieux.
--
-- Politique de compte : un compte relié à une banque est AUTORITAIRE côté solde
-- (le solde reflète le dernier snapshot bancaire). Les écritures manuelles /CSV
-- sur un tel compte apparaissent dans le fil mais n'ont pas vocation à piloter
-- son solde ; le prochain snapshot les recouvre. Ne pas mélanger les deux
-- modèles sur un même compte.
drop function if exists public.rpc_import_ext(uuid, text, jsonb);

create or replace function public.rpc_sync_account(
    p_operation_id uuid,
    p_account_id   text,
    p_txs          jsonb,
    p_bank_balance numeric  -- null = pas de snapshot → solde inchangé
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
    v_count    integer := 0;
    v_skipped  integer := 0;
    v_n        integer;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_operation_id is null then
        raise exception 'operation_id is required' using errcode = '22004';
    end if;
    if p_txs is null or jsonb_typeof(p_txs) <> 'array' then
        raise exception 'p_txs must be a json array' using errcode = '22023';
    end if;
    v_n := jsonb_array_length(p_txs);
    if v_n > 2000 then
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

    -- Verrou du compte : sérialise l'ensemble import + pose du solde.
    select a.user_id into v_owner_id from public.accounts a
     where a.id = p_account_id for update;
    if not found or v_owner_id <> v_user_id then
        raise exception 'Account not found or forbidden' using errcode = '42501';
    end if;

    if v_n > 0 then
        if exists (
            select 1 from jsonb_array_elements(p_txs) e
             where (e->>'external_id') is null or (e->>'external_id') = ''
                or (e->>'tx_date') is null
                or not public.qdq_valid_money((e->>'amount')::numeric)
                or (e->>'amount')::numeric = 0
        ) then
            raise exception 'imported row invalid (external_id/amount/tx_date)' using errcode = '22023';
        end if;

        -- Dédup exacte par (compte, external_id). AUCUN effet sur le solde :
        -- le solde vient exclusivement du snapshot banque ci-dessous.
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
            returning 1
        )
        select count(*) into v_count from ins;
        v_skipped := v_n - v_count;
    end if;

    -- La banque fait foi : pose du solde = snapshot, atomiquement avec l'import.
    -- Snapshot absent → on ne touche PAS au solde (pas de delta, pas de faux).
    if p_bank_balance is not null then
        if not public.qdq_valid_money(p_bank_balance) then
            raise exception 'invalid bank balance' using errcode = '22023';
        end if;
        update public.accounts
           set balance = p_bank_balance,
               free    = p_bank_balance - coalesce(reserved, 0)
         where id = p_account_id;
    end if;

    return jsonb_build_object('success', true, 'replayed', false, 'operation_id', p_operation_id,
                              'imported', v_count, 'skipped', v_skipped,
                              'balance_set', p_bank_balance is not null);
end;
$$;

revoke all on function public.rpc_sync_account(uuid,text,jsonb,numeric) from public, anon;
grant execute on function public.rpc_sync_account(uuid,text,jsonb,numeric) to authenticated;
