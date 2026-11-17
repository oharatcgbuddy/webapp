-- DATI DI PROVA per lo sviluppo. Non usare in produzione.
-- Negozi con slug "demo-*" e tornei con note che iniziano per "[demo]".
-- Le coordinate sono i centri città, non indirizzi reali.
--
-- PULIZIA (nell'ordine):
--   delete from public.participations where tournament_id in (select id from public.tournaments where notes like '[demo]%');
--   delete from public.tournaments where notes like '[demo]%';
--   delete from public.shops where slug like 'demo-%';

insert into public.shops (slug, name, description, address, city, province, lat, lng, phone, website, social, status) values
  ('demo-milano',  'Demo Card Corner Milano',  'Negozio di prova: tornei One Piece ogni settimana.', 'Via Esempio 1',   'Milano',  'MI', 45.4642,  9.1900, '+39 02 0000001',  'https://example.com/milano',  '{"instagram":"https://instagram.com/example"}', 'approved'),
  ('demo-roma',    'Demo Games Roma',          'Negozio di prova nel centro di Roma.',               'Via Esempio 2',   'Roma',    'RM', 41.9028, 12.4964, '+39 06 0000002',  'https://example.com/roma',    '{}',                                           'approved'),
  ('demo-torino',  'Demo Fumetti Torino',      'Fumetteria di prova con area gioco.',                'Corso Esempio 3', 'Torino',  'TO', 45.0703,  7.6869, null,              null,                          '{"discord":"https://discord.gg/example"}',     'approved'),
  ('demo-napoli',  'Demo Tavolo Napoli',       'Negozio di prova.',                                  'Via Esempio 4',   'Napoli',  'NA', 40.8518, 14.2681, '+39 081 0000004', 'https://example.com/napoli',  '{}',                                           'approved'),
  ('demo-bologna', 'Demo Carte Bologna',       'Negozio di prova vicino alla stazione.',             'Via Esempio 5',   'Bologna', 'BO', 44.4949, 11.3426, null,              'https://example.com/bologna', '{}',                                           'approved')
on conflict (slug) do nothing;

insert into public.tournaments (shop_id, tcg_id, title, format_slug, starts_at, entry_fee_cents, max_players, prizes, notes, status)
select s.id, (select id from public.tcgs where slug = 'onepiece'),
       t.title, t.format_slug, t.starts_at, t.fee, t.max_players, t.prizes, '[demo] ' || t.note, t.status
from (values
  -- In corso adesso (iniziato un'ora fa): serve per provare il track live
  ('demo-milano',  'Locals One Piece (in corso)',   'standard', now() - interval '1 hour',                                  500,  16,   'Buoni acquisto',                'in corso',  'scheduled'),
  -- Prossimi
  ('demo-milano',  'Weekly One Piece',              'standard', date_trunc('day', now()) + interval '2 days 20 hours',      500,  16,   'Buoni acquisto per i primi 3',  'prossimo',  'scheduled'),
  ('demo-milano',  'Draft Night',                   'draft',    date_trunc('day', now()) + interval '9 days 20 hours',      1500, 8,    'Buste premio',                  'prossimo',  'scheduled'),
  ('demo-roma',    'Torneo del sabato',             'standard', date_trunc('day', now()) + interval '4 days 15 hours',      800,  32,   'Playmat esclusivo',             'prossimo',  'scheduled'),
  ('demo-roma',    'Casual Sunday',                 'casual',   date_trunc('day', now()) + interval '6 days 16 hours',      0,    null, null,                            'prossimo',  'scheduled'),
  ('demo-torino',  'One Piece Cup',                 'standard', date_trunc('day', now()) + interval '5 days 18 hours',      1000, 24,   'Buste e buoni',                 'prossimo',  'scheduled'),
  ('demo-napoli',  'Sealed Weekend',                'sealed',   date_trunc('day', now()) + interval '12 days 10 hours',     2500, 16,   'Montepremi in buste',           'prossimo',  'scheduled'),
  ('demo-bologna', 'Standard del giovedì',          'standard', date_trunc('day', now()) + interval '3 days 21 hours',      500,  12,   null,                            'prossimo',  'scheduled'),
  -- Passati e annullato
  ('demo-milano',  'Locals della scorsa settimana', 'standard', date_trunc('day', now()) - interval '6 days' + interval '20 hours',  500, 16, 'Buoni acquisto',   'passato',   'completed'),
  ('demo-roma',    'Torneo di apertura',            'standard', date_trunc('day', now()) - interval '13 days' + interval '15 hours', 800, 32, 'Playmat',         'passato',   'completed'),
  ('demo-torino',  'Draft annullato',               'draft',    date_trunc('day', now()) + interval '1 day 18 hours',       1500, 8,    null,                            'annullato', 'cancelled')
) as t(shop_slug, title, format_slug, starts_at, fee, max_players, prizes, note, status)
join public.shops s on s.slug = t.shop_slug
where not exists (select 1 from public.tournaments where notes like '[demo]%');
