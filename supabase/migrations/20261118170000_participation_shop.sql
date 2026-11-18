-- Locale scelto a mano per i tornei liberi (senza un torneo creato da un locale): serve per nome e logo nelle immagini.
-- Con un torneo di un locale resta valido il locale del torneo; questo campo è facoltativo.

alter table public.participations add column shop_id uuid references public.shops(id) on delete set null;
create index participations_shop_id_idx on public.participations (shop_id) where shop_id is not null;

-- L'inserimento è già permesso su tutte le colonne; l'aggiornamento è limitato per colonna.
grant update (shop_id) on public.participations to authenticated;
