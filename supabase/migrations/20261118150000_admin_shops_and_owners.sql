-- Applicata a mano dal SQL Editor sul progetto dev il 2026-11-17.
-- Strumenti admin per negozi e tornei:
--  1) l'admin può modificare qualunque negozio e creare/modificare/eliminare i tornei di qualunque negozio
--     (oltre ai membri del negozio, come prima);
--  2) l'admin crea un negozio direttamente (già approvato), con posizione e contatti;
--  3) l'admin assegna un proprietario con l'email Google: se l'utente esiste diventa subito gestore,
--     altrimenti l'invito resta in attesa e scatta al suo primo accesso (claim_shop_invites).
-- Le scritture passano da funzioni con controllo admin: nessun permesso di scrittura nuovo agli utenti.

-- 1. Regole: negozi e tornei modificabili anche dall'admin (le policy esistenti vengono sostituite).
drop policy shops_update on public.shops;
create policy shops_update on public.shops for update to authenticated
  using ((select is_shop_member(shops.id)) or (select is_admin()))
  with check ((select is_shop_member(shops.id)) or (select is_admin()));

drop policy tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select is_shop_member(tournaments.shop_id))
      or (shop_id is not null and (select is_admin()))
      or (shop_id is null and external_id is not null)
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
    or (shop_id is null and created_by = (select auth.uid()) and external_id is not null)
  );

drop policy tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments for delete to authenticated
  using (
    (select is_shop_member(tournaments.shop_id))
    or (select is_admin())
    or (shop_id is null and created_by = (select auth.uid()))
  );

-- 2. Inviti in attesa: un proprietario per email, assegnato prima che l'utente abbia fatto l'accesso.
create table public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, email)
);
create index on public.shop_invites (email);
create index on public.shop_invites (invited_by);

alter table public.shop_invites enable row level security;
revoke all on public.shop_invites from anon, authenticated;
grant select on public.shop_invites to authenticated;
create policy shop_invites_select on public.shop_invites for select to authenticated
  using ((select is_admin()));

-- 3. L'admin crea un negozio già approvato. Restituisce lo slug.
create function public.admin_create_shop(
  p_name text, p_city text, p_province text, p_address text, p_phone text, p_website text,
  p_description text, p_social jsonb, p_lat double precision, p_lng double precision
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if p_name is null or p_name !~ '[A-Za-z0-9]' or char_length(p_name) > 80 then
    raise exception 'Nome non valido';
  end if;
  if p_city is null or btrim(p_city) = '' or char_length(p_city) > 60 then
    raise exception 'Città non valida';
  end if;
  if p_province is null or p_province !~ '^[A-Z]{2}$' then
    raise exception 'Provincia non valida';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'Posizione non valida';
  end if;
  if p_social is not null and (
    jsonb_typeof(p_social) <> 'object'
    or exists (
      select 1 from jsonb_each_text(p_social) e
      where e.key not in ('instagram', 'facebook', 'discord') or char_length(e.value) > 200
    )
  ) then
    raise exception 'Social non validi';
  end if;

  v_slug := trim(both '-' from lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')))
            || '-' || substr(gen_random_uuid()::text, 1, 6);

  insert into public.shops (slug, name, description, address, city, province, lat, lng, phone, website, social, status, created_by)
  values (
    v_slug, btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_address), ''), btrim(p_city),
    p_province, p_lat, p_lng, nullif(btrim(p_phone), ''), nullif(btrim(p_website), ''),
    coalesce(p_social, '{}'::jsonb), 'approved', (select auth.uid())
  );
  return v_slug;
end;
$$;

-- 4. L'admin assegna un proprietario: 'added' se l'utente esiste già, 'invited' se si aspetta il suo primo accesso.
create function public.admin_add_shop_owner(p_shop uuid, p_email text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email non valida';
  end if;
  if not exists (select 1 from public.shops where id = p_shop) then
    raise exception 'Negozio non trovato';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is not null then
    insert into public.shop_members (shop_id, user_id, role) values (p_shop, v_user, 'owner')
      on conflict do nothing;
    delete from public.shop_invites where shop_id = p_shop and email = v_email;
    return 'added';
  end if;

  insert into public.shop_invites (shop_id, email, invited_by) values (p_shop, v_email, (select auth.uid()))
    on conflict do nothing;
  return 'invited';
end;
$$;

-- 5. Togliere un gestore o annullare un invito.
create function public.admin_remove_shop_member(p_shop uuid, p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  delete from public.shop_members where shop_id = p_shop and user_id = p_user;
end;
$$;

create function public.admin_cancel_shop_invite(p_invite uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  delete from public.shop_invites where id = p_invite;
end;
$$;

-- 6. Chiamata dall'app al login: attiva gli inviti in attesa per l'email dell'utente che ha appena fatto l'accesso.
create function public.claim_shop_invites() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  n integer;
begin
  if v_uid is null then
    return 0;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then
    return 0;
  end if;

  with mine as (
    delete from public.shop_invites where email = v_email returning shop_id
  ), added as (
    insert into public.shop_members (shop_id, user_id, role)
    select shop_id, v_uid, 'owner' from mine
    on conflict do nothing
    returning 1
  )
  select count(*) into n from added;
  return n;
end;
$$;

revoke execute on function public.admin_create_shop(text, text, text, text, text, text, text, jsonb, double precision, double precision) from public, anon;
revoke execute on function public.admin_add_shop_owner(uuid, text) from public, anon;
revoke execute on function public.admin_remove_shop_member(uuid, uuid) from public, anon;
revoke execute on function public.admin_cancel_shop_invite(uuid) from public, anon;
revoke execute on function public.claim_shop_invites() from public, anon;
grant execute on function public.admin_create_shop(text, text, text, text, text, text, text, jsonb, double precision, double precision) to authenticated;
grant execute on function public.admin_add_shop_owner(uuid, text) to authenticated;
grant execute on function public.admin_remove_shop_member(uuid, uuid) to authenticated;
grant execute on function public.admin_cancel_shop_invite(uuid) to authenticated;
grant execute on function public.claim_shop_invites() to authenticated;
