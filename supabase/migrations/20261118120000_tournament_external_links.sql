-- Applicata a mano dal SQL Editor sul progetto dev il 2026-11-17.
-- Collega i tornei a un evento esterno (per ora BANDAI TCG+) tramite il suo ID numerico,
-- così più giocatori che incollano lo stesso link finiscono sullo stesso torneo.
-- Nessuna richiesta verso servizi esterni: dal link si estrae solo l'ID.
-- I giocatori possono creare tornei "da link" (shop_id null = non verificato, comunitario);
-- finché nessun negozio li reclama, li modifica solo chi li ha creati.

-- 1. Colonne e unicità: un solo torneo per evento esterno.
alter table public.tournaments
  add column external_source text check (external_source in ('bandai_tcg_plus')),
  add column external_id text check (external_id ~ '^[0-9]{1,18}$'),
  add constraint tournaments_external_pair check ((external_source is null) = (external_id is null));

create unique index tournaments_external_uniq
  on public.tournaments (external_source, external_id)
  where external_id is not null;

grant insert (external_source, external_id) on public.tournaments to authenticated;
grant update (external_source, external_id) on public.tournaments to authenticated;

-- 2. Regole di scrittura sui tornei: negozio (come prima) oppure creatore di un torneo
--    comunitario. Sostituiscono le tre regole esistenti, per non creare policy duplicate.
drop policy tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select is_shop_member(tournaments.shop_id))
      or (shop_id is null and external_id is not null)
    )
  );

drop policy tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments for update to authenticated
  using (
    (select is_shop_member(tournaments.shop_id))
    or (shop_id is null and created_by = (select auth.uid()))
  )
  with check (
    (select is_shop_member(tournaments.shop_id))
    or (shop_id is null and created_by = (select auth.uid()) and external_id is not null)
  );

drop policy tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments for delete to authenticated
  using (
    (select is_shop_member(tournaments.shop_id))
    or (shop_id is null and created_by = (select auth.uid()))
  );

-- 3. Freno agli abusi: al massimo 10 tornei comunitari per utente nelle ultime 24 ore.
create function public.limit_community_tournaments() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shop_id is null and (
    select count(*) from public.tournaments t
    where t.created_by = new.created_by
      and t.shop_id is null
      and t.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Hai creato troppi tornei da link nelle ultime 24 ore';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_community_tournaments() from public, anon, authenticated;

create trigger trg_tournaments_limit_community
  before insert on public.tournaments
  for each row execute function public.limit_community_tournaments();
