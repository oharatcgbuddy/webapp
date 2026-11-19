-- Applicata sul progetto dev il 2026-11-19 (versione 20261119163352).
-- Identificativi di un locale presso servizi esterni (per ora BANDAI TCG+), al posto della colonna unica
-- shops.bandai_organizer_id: così in futuro si possono aggiungere altre fonti senza cambiare la tabella dei locali.
-- Un locale ha al più un ID per fonte, e uno stesso ID esterno appartiene a un solo locale.
-- Su TCG+ l'organizzatore è lo stesso per tutti i giochi Bandai: il gioco lo sceglie lo script di sincronizzazione.
-- Il gestore (o l'admin) scrive l'ID del proprio locale: è il consenso a esporre i suoi eventi di TCG+.
-- La colonna vecchia non si elimina qui: lo fa una migration successiva, a collegamenti verificati.

create table public.shop_external_ids (
  shop_id uuid not null references public.shops(id) on delete cascade,
  source text not null check (source in ('bandai_tcg_plus')),
  external_id text not null check (external_id ~ '^[0-9]{1,12}$'),
  created_at timestamptz not null default now(),
  primary key (shop_id, source)
);
create unique index shop_external_ids_uniq on public.shop_external_ids (source, external_id);

alter table public.shop_external_ids enable row level security;

create policy shop_external_ids_select on public.shop_external_ids for select to authenticated
  using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy shop_external_ids_insert on public.shop_external_ids for insert to authenticated
  with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy shop_external_ids_update on public.shop_external_ids for update to authenticated
  using ((select public.is_shop_member(shop_id)) or (select public.is_admin()))
  with check ((select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy shop_external_ids_delete on public.shop_external_ids for delete to authenticated
  using ((select public.is_shop_member(shop_id)) or (select public.is_admin()));

revoke all on public.shop_external_ids from anon, authenticated;
grant select, delete on public.shop_external_ids to authenticated;
grant insert (shop_id, source, external_id) on public.shop_external_ids to authenticated;
grant update (external_id) on public.shop_external_ids to authenticated;

-- I collegamenti già fatti con la colonna vecchia passano alla tabella nuova.
insert into public.shop_external_ids (shop_id, source, external_id)
  select id, 'bandai_tcg_plus', bandai_organizer_id from public.shops where bandai_organizer_id is not null;
