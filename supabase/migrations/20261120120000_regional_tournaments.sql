-- Tornei non legati a un negozio (per ora i Regionals), caricati solo dall'admin.
--  - `kind`: 'shop' (tornei dei negozi e della comunità, come prima) oppure 'regional'.
--  - `venue`: luogo scritto a mano (es. "Fiera di Rimini, Rimini"), perché un Regional non ha un negozio.
--  - Un torneo 'regional' non ha mai un negozio.
-- Solo l'admin può creare o modificare un torneo 'regional': le altre regole di scrittura chiedono kind = 'shop',
-- così nessun giocatore può spacciare per Regional un torneo segnalato da link.

alter table public.tournaments
  add column kind text not null default 'shop' check (kind in ('shop', 'regional')),
  add column venue text check (char_length(venue) between 1 and 120),
  add constraint tournaments_kind_shop check (kind = 'shop' or shop_id is null);

create index tournaments_kind_starts on public.tournaments (kind, starts_at) where kind <> 'shop';

drop policy tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select is_shop_member(tournaments.shop_id))
      or (shop_id is not null and (select is_admin()))
      or (shop_id is null and external_id is not null and kind = 'shop')
      or (shop_id is null and kind = 'regional' and (select is_admin()))
    )
  );

drop policy tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments for update to authenticated
  using (
    (select is_shop_member(tournaments.shop_id))
    or (select is_admin())
    or (shop_id is null and created_by = (select auth.uid()))
  )
  with check (
    (select is_shop_member(tournaments.shop_id))
    or (select is_admin())
    or (shop_id is null and created_by = (select auth.uid()) and external_id is not null and kind = 'shop')
  );

-- Il freno ai tornei da link (10 ogni 24 ore) riguarda solo quelli della comunità, non i Regionals dell'admin.
create or replace function public.limit_community_tournaments() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shop_id is null and new.kind = 'shop' and (
    select count(*) from public.tournaments t
    where t.created_by = new.created_by
      and t.shop_id is null
      and t.kind = 'shop'
      and t.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'Hai creato troppi tornei da link nelle ultime 24 ore';
  end if;
  return new;
end;
$$;
