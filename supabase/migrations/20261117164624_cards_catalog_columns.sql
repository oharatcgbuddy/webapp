-- Applicata sul progetto dev il 2026-11-17 (versione 20261117164624).
-- Catalogo carte per il deckbuilding.
--  - image_path: percorso dell'immagine nel bucket card-images, senza estensione (stesso schema dei leader,
--    es. "onepiece/cards/OP05-060").
--  - effect_text, life, counter, attribute, traits: dati di gioco che oggi la tabella non ha e che servono
--    per cercare e filtrare le carte (testo dell'effetto, vita dei leader, counter, attributo, tratti).
-- Le righe delle carte e i set mancanti le crea lo script di importazione con la chiave di servizio:
-- nessun permesso di scrittura nuovo agli utenti.

alter table onepiece.cards
  add column image_path text check (image_path ~ '^[A-Za-z0-9_./-]{1,100}$'),
  add column effect_text text check (char_length(effect_text) <= 2000),
  add column life smallint check (life between 0 and 20),
  add column counter smallint check (counter between 0 and 5000),
  add column attribute text check (char_length(attribute) <= 40),
  add column traits text[] not null default '{}';
