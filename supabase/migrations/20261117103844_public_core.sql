-- Utilità
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Profili
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  is_public boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crea il profilo al primo login Google
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.tcgs (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  active boolean not null default true
);
insert into public.tcgs (slug, name) values ('onepiece', 'One Piece');

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  address text,
  city text,
  province text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  phone text,
  website text,
  social jsonb not null default '{}',
  logo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  primary key (shop_id, user_id)
);

create table public.shop_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  proposed jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (shop_id is not null or proposed is not null)
);

create table public.shop_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  primary key (user_id, shop_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  tcg_id smallint not null references public.tcgs(id),
  title text not null,
  format_slug text,
  starts_at timestamptz not null,
  entry_fee_cents integer check (entry_fee_cents >= 0),
  max_players integer check (max_players > 0),
  prizes text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  tcg_id smallint not null references public.tcgs(id),
  played_on date not null,
  standalone_label text,
  placement integer check (placement >= 1),
  players_count integer check (players_count > 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  visibility text not null default 'inherit' check (visibility in ('inherit','private')),
  is_hidden boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tournament_id),
  check (tournament_id is not null or standalone_label is not null)
);

-- Indici sulle FK
create index on public.shop_members (user_id);
create index on public.shop_requests (user_id);
create index on public.shop_requests (shop_id);
create index on public.shop_favorites (shop_id);
create index on public.tournaments (shop_id);
create index on public.tournaments (tcg_id, starts_at);
create index on public.participations (user_id, played_on desc);
create index on public.participations (tournament_id);
create index on public.participations (tcg_id);

create trigger trg_profiles_upd before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_shops_upd before update on public.shops for each row execute function public.set_updated_at();
create trigger trg_tournaments_upd before update on public.tournaments for each row execute function public.set_updated_at();
create trigger trg_participations_upd before update on public.participations for each row execute function public.set_updated_at();

-- Helper per le policy
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;
create function public.is_shop_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members where shop_id = p_shop and user_id = auth.uid())
$$;
revoke execute on function public.is_admin(), public.is_shop_member(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_shop_member(uuid) to authenticated;
