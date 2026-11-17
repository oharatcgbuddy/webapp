-- DA APPLICARE (non ancora presente sul database): sostituisce le policy "for all" con
-- insert/update/delete separate, per eliminare l'avviso "multiple permissive policies".

drop policy dc_write on onepiece.deck_cards;
create policy dc_insert on onepiece.deck_cards for insert to authenticated
  with check (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())));
create policy dc_update on onepiece.deck_cards for update to authenticated
  using (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())))
  with check (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())));
create policy dc_delete on onepiece.deck_cards for delete to authenticated
  using (exists (select 1 from onepiece.decks d where d.id = deck_id and d.owner_id = (select auth.uid())));

drop policy pd_write on onepiece.participation_details;
create policy pd_insert on onepiece.participation_details for insert to authenticated
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
create policy pd_update on onepiece.participation_details for update to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
create policy pd_delete on onepiece.participation_details for delete to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));

drop policy matches_write on onepiece.matches;
create policy matches_insert on onepiece.matches for insert to authenticated
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
create policy matches_update on onepiece.matches for update to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
create policy matches_delete on onepiece.matches for delete to authenticated
  using (exists (select 1 from public.participations p where p.id = participation_id and p.user_id = (select auth.uid())));
