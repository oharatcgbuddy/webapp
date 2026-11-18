-- Risultati dei tornei inseriti dal negozio (con mazzo e scontri) + bucket dei loghi dei negozi
-- + Alias del giocatore (nome mostrato nelle immagini che crea lui).

alter table public.profiles
  add column alias text check (alias is null or char_length(alias) between 2 and 24);
grant update (alias) on public.profiles to authenticated;

create table onepiece.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 40),
  user_id uuid references auth.users(id) on delete set null,
  leader_code text not null references onepiece.leaders(card_code),
  -- [{"code":"OP11-041","qty":4}, ...]
  decklist jsonb not null default '[]'::jsonb check (jsonb_typeof(decklist) = 'array' and jsonb_array_length(decklist) <= 60),
  placement smallint check (placement between 1 and 1024),
  wins smallint not null default 0 check (wins between 0 and 30),
  losses smallint not null default 0 check (losses between 0 and 30),
  draws smallint not null default 0 check (draws between 0 and 30),
  -- [{"round":1,"opponent_code":"OP01-001","opponent_name":"...","dice_won":true,"result":"win"}, ...]
  matchups jsonb not null default '[]'::jsonb check (jsonb_typeof(matchups) = 'array' and jsonb_array_length(matchups) <= 16),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index tournament_results_tournament_idx on onepiece.tournament_results (tournament_id);

alter table onepiece.tournament_results enable row level security;

-- Visibile a chi può vedere il torneo (la RLS di public.tournaments si applica alla sotto-query).
create policy tournament_results_select on onepiece.tournament_results
  for select to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id));

-- Scrivono solo i gestori del negozio che organizza il torneo e gli admin.
create policy tournament_results_insert on onepiece.tournament_results
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.shop_id is not null
        and ((select public.is_shop_member(t.shop_id)) or (select public.is_admin()))
    )
  );

create policy tournament_results_update on onepiece.tournament_results
  for update to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id
    and t.shop_id is not null
    and ((select public.is_shop_member(t.shop_id)) or (select public.is_admin()))))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id
    and t.shop_id is not null
    and ((select public.is_shop_member(t.shop_id)) or (select public.is_admin()))));

create policy tournament_results_delete on onepiece.tournament_results
  for delete to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id
    and t.shop_id is not null
    and ((select public.is_shop_member(t.shop_id)) or (select public.is_admin()))));

grant select, insert, update, delete on onepiece.tournament_results to authenticated;

-- Loghi dei negozi: bucket pubblico (lo legge il servizio immagini), max 512 KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-logos', 'shop-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp']);

-- Percorso: <shop_id>/<nome>. Carica, sostituisce ed elimina solo chi gestisce quel negozio (o un admin).
create policy shop_logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shop-logos'
    and ((select public.is_shop_member(((storage.foldername(name))[1])::uuid)) or (select public.is_admin()))
  );

create policy shop_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'shop-logos'
    and ((select public.is_shop_member(((storage.foldername(name))[1])::uuid)) or (select public.is_admin()))
  );

create policy shop_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'shop-logos'
    and ((select public.is_shop_member(((storage.foldername(name))[1])::uuid)) or (select public.is_admin()))
  );
