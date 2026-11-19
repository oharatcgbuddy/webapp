-- Applicata sul progetto dev il 2026-11-19 (versione 20261119161337).
-- Collega un locale al suo "organizzatore" su BANDAI TCG+ (organizer_id), così lo script di sincronizzazione
-- (scripts/sync-bandai-events.mjs) sa di quali locali scaricare gli eventi.
-- Nessun permesso di scrittura agli utenti: la colonna la imposta solo lo script con la chiave di servizio
-- (o l'admin dall'SQL Editor). I proprietari dei locali non la possono cambiare (le grant sono per colonna).

alter table public.shops
  add column bandai_organizer_id text check (bandai_organizer_id ~ '^[0-9]{1,12}$');

create unique index shops_bandai_organizer_uniq
  on public.shops (bandai_organizer_id)
  where bandai_organizer_id is not null;
