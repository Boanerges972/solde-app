-- Rafraîchit le solde d'un compte pour le compte du CRON (pas de session
-- utilisateur → pas de auth.uid()). Prend l'user_id EXPLICITE, réservé au
-- service_role. La banque fait foi : on POSE le solde, free recalculé.
create or replace function public.rpc_refresh_balance_svc(
    p_user_id    uuid,
    p_account_id text,
    p_balance    numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_owner uuid;
begin
    if p_user_id is null or p_account_id is null or p_balance is null then
        raise exception 'missing argument' using errcode = '22004';
    end if;
    if not public.qdq_valid_money(p_balance) then
        raise exception 'invalid balance' using errcode = '22023';
    end if;
    select user_id into v_owner from public.accounts where id = p_account_id for update;
    if not found or v_owner <> p_user_id then
        raise exception 'account not found or forbidden' using errcode = '42501';
    end if;
    update public.accounts
       set balance = p_balance,
           free    = p_balance - coalesce(reserved, 0)
     where id = p_account_id;
end;
$$;

-- Réservé au service_role (le cron). Jamais exposé aux clients authentifiés.
revoke all on function public.rpc_refresh_balance_svc(uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.rpc_refresh_balance_svc(uuid,text,numeric) to service_role;
