alter table public.profiles       enable row level security;
alter table public.tcgs           enable row level security;
alter table public.shops          enable row level security;
alter table public.shop_members   enable row level security;
alter table public.shop_requests  enable row level security;
alter table public.shop_favorites enable row level security;
alter table public.tournaments    enable row level security;
alter table public.participations enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.profiles, public.shops, public.shop_members, public.tcgs from authenticated;
revoke update on public.participations from authenticated;
grant update (username, display_name, avatar_url, is_public) on public.profiles to authenticated;
grant update (name, description, address, city, province, lat, lng, phone, website, social, logo_url)
  on public.shops to authenticated;
grant update (tournament_id, tcg_id, played_on, standalone_label, placement, players_count,
              wins, losses, draws, visibility, notes) on public.participations to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or is_public or (select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy tcgs_select on public.tcgs for select to authenticated using (true);

create policy shops_select on public.shops for select to authenticated
  using (status = 'approved' or created_by = (select auth.uid())
         or (select public.is_shop_member(id)) or (select public.is_admin()));
create policy shops_update on public.shops for update to authenticated
  using ((select public.is_shop_member(id))) with check ((select public.is_shop_member(id)));

create policy shop_members_select on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_shop_member(shop_id)) or (select public.is_admin()));

create policy shop_requests_select on public.shop_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy shop_requests_insert on public.shop_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

create policy fav_select on public.shop_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy fav_insert on public.shop_favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy fav_delete on public.shop_favorites for delete to authenticated using (user_id = (select auth.uid()));

create policy tournaments_select on public.tournaments for select to authenticated
  using (shop_id is null
         or exists (select 1 from public.shops s where s.id = shop_id and s.status = 'approved')
         or (select public.is_shop_member(shop_id)) or (select public.is_admin()));
create policy tournaments_insert on public.tournaments for insert to authenticated
  with check ((select public.is_shop_member(shop_id)) and created_by = (select auth.uid()));
create policy tournaments_update on public.tournaments for update to authenticated
  using ((select public.is_shop_member(shop_id))) with check ((select public.is_shop_member(shop_id)));
create policy tournaments_delete on public.tournaments for delete to authenticated
  using ((select public.is_shop_member(shop_id)));

create policy part_select on public.participations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin())
         or (not is_hidden and visibility = 'inherit'
             and exists (select 1 from public.profiles p where p.id = user_id and p.is_public)));
create policy part_insert on public.participations for insert to authenticated
  with check (user_id = (select auth.uid()) and not is_hidden);
create policy part_update on public.participations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy part_delete on public.participations for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.approve_shop_request(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.shop_requests; v_shop uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.shop_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'request not found or already reviewed'; end if;
  v_shop := r.shop_id;
  if v_shop is null then
    insert into public.shops (slug, name, description, address, city, province, lat, lng, phone, website, status, created_by)
    values (
      lower(regexp_replace(r.proposed->>'name', '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 6),
      r.proposed->>'name', r.proposed->>'description', r.proposed->>'address', r.proposed->>'city',
      r.proposed->>'province', (r.proposed->>'lat')::float8, (r.proposed->>'lng')::float8,
      r.proposed->>'phone', r.proposed->>'website', 'approved', r.user_id)
    returning id into v_shop;
  end if;
  insert into public.shop_members (shop_id, user_id, role) values (v_shop, r.user_id, 'owner')
    on conflict do nothing;
  update public.shop_requests set status = 'approved', reviewed_by = auth.uid(), shop_id = v_shop where id = p_request;
  return v_shop;
end $$;

create function public.reject_shop_request(p_request uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.shop_requests set status = 'rejected', note = p_note, reviewed_by = auth.uid()
   where id = p_request and status = 'pending';
end $$;

create function public.admin_set_participation_hidden(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.participations set is_hidden = p_hidden where id = p_id;
end $$;

revoke execute on function public.approve_shop_request(uuid), public.reject_shop_request(uuid, text),
  public.admin_set_participation_hidden(uuid, boolean) from public, anon;
grant execute on function public.approve_shop_request(uuid), public.reject_shop_request(uuid, text),
  public.admin_set_participation_hidden(uuid, boolean) to authenticated;
