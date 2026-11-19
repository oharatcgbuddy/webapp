-- Il negozio vede i risultati che i giocatori registrano sui suoi tornei, senza reinserirli a mano.
-- Di default un risultato su un torneo di un negozio è visibile ai gestori di quel negozio; il giocatore può nasconderlo
-- impostando visibility = 'private' (stessa colonna già usata per la privacy del risultato). Un risultato nascosto
-- dall'admin (is_hidden) non si vede.

-- 1. Risultati: oltre a proprietario, admin e profili pubblici, i gestori del negozio che organizza il torneo.
drop policy part_select on public.participations;
create policy part_select on public.participations for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (
      not is_hidden and visibility = 'inherit'
      and (
        exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
        or exists (
          select 1 from public.tournaments t
           where t.id = tournament_id and t.shop_id is not null and (select public.is_shop_member(t.shop_id))
        )
      )
    )
  );

-- 2. Il mazzo usato in quel risultato (serve per l'immagine). Si apre solo per i risultati visibili al negozio,
--    non per i mazzi in generale. Dettagli e round seguono già la visibilità del risultato.
drop policy decks_select on onepiece.decks;
create policy decks_select on onepiece.decks for select to authenticated
  using (
    owner_id = (select auth.uid()) or (select public.is_admin())
    or (visibility = 'public' and exists (select 1 from public.profiles p where p.id = owner_id and p.is_public))
    or exists (
      select 1
        from onepiece.participation_details pd
        join public.participations p on p.id = pd.participation_id
        join public.tournaments t on t.id = p.tournament_id
       where pd.deck_id = decks.id
         and not p.is_hidden and p.visibility = 'inherit'
         and t.shop_id is not null and (select public.is_shop_member(t.shop_id))
    )
  );
-- Le carte del mazzo seguono la visibilità del mazzo (la sotto-query passa dalla sua policy).

-- 3. Nome dei giocatori (alias o nome) per il solo negozio del torneo: i profili non sono leggibili dal negozio.
--    manual_result = il negozio ha già inserito a mano il risultato di quel giocatore (collegato con user_id).
create function public.shop_tournament_players(p_tournament uuid)
returns table (participation_id uuid, player_name text, manual_result boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(pr.alias), ''), nullif(btrim(pr.display_name), ''), 'Giocatore'),
         exists (
           select 1 from onepiece.tournament_results tr
            where tr.tournament_id = p.tournament_id and tr.user_id = p.user_id
         )
    from public.participations p
    join public.tournaments t on t.id = p.tournament_id
    join public.profiles pr on pr.id = p.user_id
   where p.tournament_id = p_tournament
     and t.shop_id is not null
     and ((select public.is_shop_member(t.shop_id)) or (select public.is_admin()))
     and not p.is_hidden and p.visibility = 'inherit' and p.closed_at is not null;
$$;

revoke execute on function public.shop_tournament_players(uuid) from public, anon;
grant execute on function public.shop_tournament_players(uuid) to authenticated;
