-- Gli ID di BANDAI TCG+ stanno ora in shop_external_ids (migration 20261119163352): si elimina la colonna vecchia.
-- Prima si ricopia quello che nella tabella nuova ancora non c'è, così non va perso niente.
insert into public.shop_external_ids (shop_id, source, external_id)
  select id, 'bandai_tcg_plus', bandai_organizer_id from public.shops where bandai_organizer_id is not null
  on conflict do nothing;

drop index if exists public.shops_bandai_organizer_uniq;
alter table public.shops drop column bandai_organizer_id;
