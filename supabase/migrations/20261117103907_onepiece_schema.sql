create schema onepiece;
grant usage on schema onepiece to authenticated, service_role;

create table onepiece.sets (
  code text primary key, name text not null, released_on date
);
create table onepiece.leaders (
  card_code text primary key, name text not null,
  colors text[] not null default '{}', set_code text references onepiece.sets(code)
);
create table onepiece.cards (
  card_code text primary key, name text not null, type text, colors text[] not null default '{}',
  cost smallint, power integer, rarity text,
  set_code text references onepiece.sets(code), image_url text
);
create table onepiece.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  leader_code text references onepiece.leaders(card_code),
  decklist_text text,
  visibility text not null default 'private' check (visibility in ('private','public')),
  created_at timestamptz not null default now()
);
create table onepiece.deck_cards (
  deck_id uuid not null references onepiece.decks(id) on delete cascade,
  card_code text not null,
  qty smallint not null check (qty > 0),
  primary key (deck_id, card_code)
);
create table onepiece.participation_details (
  participation_id uuid primary key references public.participations(id) on delete cascade,
  leader_code text references onepiece.leaders(card_code),
  deck_id uuid references onepiece.decks(id) on delete set null
);
create table onepiece.matches (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.participations(id) on delete cascade,
  round smallint,
  opponent_leader_code text references onepiece.leaders(card_code),
  opponent_name text,
  result text not null check (result in ('win','loss','draw')),
  on_play boolean,
  notes text
);

create index on onepiece.leaders (set_code);
create index on onepiece.cards (set_code);
create index on onepiece.decks (owner_id);
create index on onepiece.decks (leader_code);
create index on onepiece.participation_details (leader_code);
create index on onepiece.participation_details (deck_id);
create index on onepiece.matches (participation_id);
create index on onepiece.matches (opponent_leader_code);

alter table onepiece.sets enable row level security;
alter table onepiece.leaders enable row level security;
alter table onepiece.cards enable row level security;
alter table onepiece.decks enable row level security;
alter table onepiece.deck_cards enable row level security;
alter table onepiece.participation_details enable row level security;
alter table onepiece.matches enable row level security;

grant select on all tables in schema onepiece to authenticated;
grant insert, update, delete on onepiece.decks, onepiece.deck_cards,
  onepiece.participation_details, onepiece.matches to authenticated;
grant all on all tables in schema onepiece to service_role;

create policy sets_select    on onepiece.sets    for select to authenticated using (true);
create policy leaders_select on onepiece.leaders for select to authenticated using (true);
create policy cards_select   on onepiece.cards   for select to authenticated using (true);

create policy decks_select on onepiece.decks for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin())
         or (visibility = 'public' and exists (select 1 from public.profiles p where p.id = owner_id and p.is_public)));
create policy decks_insert on onepiece.decks for insert to authenticated with check (owner_id = (select auth.uid()));
create policy decks_update on onepiece.decks for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy decks_delete on onepiece.decks for delete to authenticated using (owner_id = (select auth.uid()));

create policy dc_select on onepiece.deck_cards for select to authenticated
  using (exists (select 1 from onepiece.decks d where d.id = deck_id));
create policy dc_write on onepiece.deck_cards for all to authenticated
  using (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())))
  with check (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())));

create policy pd_select on onepiece.participation_details for select to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id));
create policy pd_write on onepiece.participation_details for all to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));

create policy matches_select on onepiece.matches for select to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id));
create policy matches_write on onepiece.matches for all to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
