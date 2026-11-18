-- Riscatto automatico dei tornei della comunità da parte dei locali.
-- Un torneo "della comunità" nasce quando un giocatore incolla il link di un evento Bandai (senza locale).
-- Il gestore di un locale approvato che inserisce lo stesso link può riscattarlo: il torneo diventa del locale
-- e i risultati già registrati dai giocatori restano collegati. Ogni riscatto è registrato e un admin può annullarlo.

create table public.tournament_claims (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  claimed_by uuid references public.profiles(id) on delete set null,
  previous_created_by uuid references public.profiles(id) on delete set null,
  previous_title text,
  claimed_at timestamptz not null default now(),
  released_at timestamptz
);
create index tournament_claims_tournament_idx on public.tournament_claims (tournament_id);

alter table public.tournament_claims enable row level security;
create policy tournament_claims_select on public.tournament_claims for select to authenticated
  using ((select public.is_admin()) or (select public.is_shop_member(shop_id)));
-- Nessuna scrittura diretta: il registro si scrive solo con le funzioni qui sotto.
revoke all on public.tournament_claims from anon, authenticated;
grant select on public.tournament_claims to authenticated;

create function public.claim_community_tournament(
  p_shop uuid,
  p_external_id text,
  p_title text,
  p_starts_at timestamptz,
  p_format_slug text,
  p_entry_fee_cents integer,
  p_max_players integer,
  p_prizes text,
  p_notes text,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tournaments%rowtype;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not ((select public.is_shop_member(p_shop)) or (select public.is_admin())) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shops where id = p_shop and status = 'approved') then
    raise exception 'Il locale non è approvato';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then
    raise exception 'Titolo non valido';
  end if;

  select * into v_t from public.tournaments
   where external_source = 'bandai_tcg_plus' and external_id = p_external_id
   for update;
  if not found then
    raise exception 'Torneo non trovato';
  end if;
  if v_t.shop_id is not null then
    raise exception 'Il torneo è già di un locale' using errcode = '23505';
  end if;

  insert into public.tournament_claims (tournament_id, shop_id, claimed_by, previous_created_by, previous_title)
  values (v_t.id, p_shop, v_uid, v_t.created_by, v_t.title);

  update public.tournaments
     set shop_id = p_shop,
         title = btrim(p_title),
         starts_at = p_starts_at,
         format_slug = p_format_slug,
         entry_fee_cents = p_entry_fee_cents,
         max_players = p_max_players,
         prizes = p_prizes,
         notes = p_notes,
         status = p_status
   where id = v_t.id;

  return v_t.id;
end;
$$;

-- Solo un admin può restituire un torneo riscattato alla comunità (titolo di prima, senza locale, concluso).
create function public.release_claimed_tournament(p_tournament uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  select previous_title into v_prev from public.tournament_claims
   where tournament_id = p_tournament and released_at is null
   order by claimed_at desc limit 1;
  if not found then
    raise exception 'Nessun riscatto da annullare';
  end if;

  update public.tournaments
     set shop_id = null, status = 'completed', title = coalesce(v_prev, title)
   where id = p_tournament and external_id is not null;
  update public.tournament_claims set released_at = now() where tournament_id = p_tournament and released_at is null;
end;
$$;

revoke execute on function public.claim_community_tournament(uuid, text, text, timestamptz, text, integer, integer, text, text, text) from public, anon;
revoke execute on function public.release_claimed_tournament(uuid) from public, anon;
grant execute on function public.claim_community_tournament(uuid, text, text, timestamptz, text, integer, integer, text, text, text) to authenticated;
grant execute on function public.release_claimed_tournament(uuid) to authenticated;
