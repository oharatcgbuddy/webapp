-- Applicata sul progetto dev il 2026-11-17 (versione 20261117144931).
-- 1) Leader "in meta": l'amministratore decide l'elenco e l'ordine; nel selettore compaiono in cima.
-- 2) Immagini dei leader (e poi delle carte): file WebP già ridimensionati in un bucket pubblico di
--    Supabase Storage. Nel database si salva solo il percorso (senza estensione): si può spostare
--    su un altro hosting senza toccare l'app.

-- 1. Colonne sui leader
alter table onepiece.leaders
  add column image_path text check (image_path ~ '^[A-Za-z0-9_./-]{1,100}$'),
  add column meta_position smallint check (meta_position between 1 and 100);

-- 2. Solo l'amministratore imposta l'elenco meta, in un colpo solo e in modo atomico.
--    L'ordine dell'array è la posizione (1, 2, 3…). Un array vuoto svuota l'elenco.
create function public.admin_set_meta_leaders(p_codes text[]) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := coalesce(array_length(p_codes, 1), 0);
begin
  if not (select public.is_admin()) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  if n > 40 then
    raise exception 'Al massimo 40 leader in meta';
  end if;
  if (select count(distinct c) from unnest(p_codes) as c) <> n then
    raise exception 'Codici duplicati';
  end if;

  update onepiece.leaders set meta_position = null where meta_position is not null;
  update onepiece.leaders l
     set meta_position = u.pos
    from unnest(p_codes) with ordinality as u(code, pos)
   where l.card_code = u.code;

  -- Se un codice non esiste, tutto viene annullato.
  if (select count(*) from onepiece.leaders where meta_position is not null) <> n then
    raise exception 'Leader sconosciuto nell''elenco';
  end if;
end;
$$;

revoke execute on function public.admin_set_meta_leaders(text[]) from public, anon;
grant execute on function public.admin_set_meta_leaders(text[]) to authenticated;

-- 3. Bucket pubblico per le immagini: solo WebP, massimo 512 KB per file.
--    La lettura è pubblica (via URL); la scrittura resta riservata alla chiave di servizio
--    (nessuna policy di scrittura per gli utenti).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 524288, array['image/webp'])
on conflict (id) do nothing;
