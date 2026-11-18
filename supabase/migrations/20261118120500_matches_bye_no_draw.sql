-- One Piece non ha pareggi. Si aggiunge l'esito "bye" (turno di riposo: conta come vinto, senza avversario né dado).
-- Il leader avversario e il dado di matches sono già facoltativi, quindi un round BYE li lascia vuoti.

alter table onepiece.matches drop constraint matches_result_check;
alter table onepiece.matches add constraint matches_result_check check (result in ('win', 'loss', 'bye'));

-- I risultati inseriti dal negozio non hanno pareggi (public.participations.draws resta: la tabella è condivisa con gli altri giochi).
alter table onepiece.tournament_results drop column draws;
