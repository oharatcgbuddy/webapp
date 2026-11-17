# TCG Buddy — Spec (bozza v0.1)

Nome provvisorio. Web app **mobile-only** (PWA) in italiano per tracciare tornei e risultati di più TCG, partendo da One Piece.

## 1. Decisioni prese

| Tema | Decisione |
|---|---|
| Piattaforma | Web app mobile-first, installabile (PWA). Nativa da valutare più avanti |
| Stack | Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, RLS, Storage), deploy su Vercel |
| Auth | Solo Google login |
| Lingua | Italiano (i18n predisposta, non attiva) |
| Stile | Neo-brutalism: bordi spessi, ombre dure, colori saturi, riferimenti ai giochi. Giovane, di impatto |
| Multi-TCG | Tabelle comuni in `public`, dati specifici per gioco in uno **schema Postgres per TCG** (es. `onepiece`) |
| Privacy | Profili giocatore **privati di default**, pubblici a scelta |
| Negozi | Il gestore richiede la gestione, **un admin approva**. Il negozio crea tornei e ha pagina pubblica |
| Iscrizioni | Nessuna: l'app è solo informativa |
| Catalogo | Leader/set One Piece caricati una tantum da admin (script) |
| Scoperta | Lista per data con filtri, "vicino a me", mappa negozi, negozi preferiti |
| Mappa | OpenStreetMap + MapLibre (nessun costo) |
| Decklist | Fase 1: testo incollabile + validazione. Fase 2: builder visuale |

## 2. Ruoli

- **Giocatore** (default): profilo, registra partecipazioni e risultati (anche in tornei non presenti), segue negozi.
- **Gestore negozio**: gestisce uno o più negozi approvati; crea/modifica tornei; modifica pagina pubblica.
- **Admin**: approva richieste negozio, gestisce catalogo, può moderare/nascondere contenuti.

Ruolo gestore = relazione `shop_members(shop_id, user_id, role)`, non un flag globale. Admin = flag su `profiles`.

## 3. Modello dati

### `public` (comune a tutti i TCG)
- `profiles` (id = auth.users.id, username unico, display_name, avatar_url, is_public bool default false, is_admin bool default false)
- `tcgs` (id, slug, name, active) — es. `onepiece`
- `shops` (id, slug, name, description, address, city, province, lat, lng, phone, website, social jsonb, logo_url, status: pending|approved|rejected, created_by)
- `shop_members` (shop_id, user_id, role: owner|staff)
- `shop_requests` (id, user_id, shop_id nullable o dati nuovo negozio, status, note) — flusso di approvazione
- `shop_favorites` (user_id, shop_id)
- `tournaments` (id, shop_id nullable, tcg_id, title, format_slug, starts_at, entry_fee_cents, max_players, prizes text, notes text, status: scheduled|completed|cancelled, created_by)
- `participations` (id, user_id, tournament_id nullable, tcg_id, played_on date, standalone_label text per tornei fuori app, placement, players_count, wins, losses, draws, visibility override, notes)
  - Un giocatore può registrare un risultato **senza** torneo censito (`tournament_id` null + `standalone_label` / negozio libero).
  - Vincolo unico (user_id, tournament_id) quando valorizzato.

### `onepiece` (schema dedicato)
- `sets` (code, name, released_on)
- `leaders` (card_code, name, colors text[], set_code)
- `cards` (card_code, name, type, colors, cost, power, rarity, set_code, image_url nullable) — popolato da fonte esterna in fase 2
- `participation_details` (participation_id PK/FK, leader_code, deck_id nullable)
- `matches` (id, participation_id, round, opponent_leader_code nullable, opponent_name nullable, result: win|loss|draw, on_play bool nullable, notes)
- `decks` (id, owner_id, name, leader_code, created_at, visibility)
- `deck_cards` (deck_id, card_code, qty)

Regola: tutto ciò che è specifico di un gioco vive nel suo schema e referenzia `public.participations`. Aggiungere un TCG = nuovo schema + nuova riga in `tcgs` + moduli UI dedicati.

> Nota Supabase: gli schemi custom vanno esposti nelle impostazioni API ("Exposed schemas") oppure acceduti via RPC/viste in `public`. Da decidere in fase di scaffold.

## 4. Sicurezza (RLS)

- `profiles`: lettura pubblica solo se `is_public`; scrittura solo proprietario.
- `participations` e dati collegati (`matches`, `decks`): leggibili dal proprietario; dagli altri solo se profilo pubblico e riga non nascosta; scrittura solo proprietario.
- `tournaments`: lettura pubblica (se negozio approved o tournament senza negozio creato da giocatore); scrittura solo membri del negozio.
- `shops`: lettura pubblica se approved; modifica solo membri; approvazione solo admin.
- Azioni admin tramite funzioni/policy basate su `profiles.is_admin`, mai da client con service key.
- Service role key mai esposta al client.

## 5. Schermate (mobile)

Navigazione a tab in basso: **Tornei · Mappa · Miei risultati · Profilo**.

1. **Tornei**: lista per data, filtri (TCG, formato, provincia, data), toggle "vicino a me", cuore per negozi preferiti.
2. **Dettaglio torneo**: ora, costo, formato, posti, premi, note, negozio, bottone "Aggiungi il mio risultato".
3. **Mappa negozi**: pin su OSM, scheda rapida, link a pagina negozio.
4. **Pagina negozio (pubblica)**: info, contatti, prossimi tornei, tornei passati, seguire.
5. **Miei risultati**: storico partecipazioni, statistiche base (win rate per leader, record).
6. **Inserimento risultato One Piece**: torneo (cerca o libero) → leader → record/piazzamento → match opzionali → decklist (testo).
7. **Profilo giocatore**: privato/pubblico, username, pagina pubblica condivisibile.
8. **Area gestore**: richiesta negozio, crea/modifica tornei, modifica pagina negozio.
9. **Area admin**: approva richieste, gestisci catalogo.

## 6. Roadmap

- **Fase 0 — Setup**: repo, Next.js + Tailwind, design system neo-brutalist, Supabase client, Google Auth, PWA manifest, CI.
- **Fase 1 — MVP**: schema `public` + `onepiece`, seed leader/set, lista tornei + filtri, dettaglio, pagina negozio, flusso richiesta/approvazione negozio, inserimento risultati (leader, record, piazzamento, match, decklist testo), profilo privato/pubblico.
- **Fase 2**: geolocalizzazione "vicino a me", mappa, negozi preferiti, catalogo carte + builder decklist, statistiche avanzate.
- **Fase 3**: secondo TCG, notifiche, valutazione app nativa.

## 7. Rischi / questioni aperte

- **Immagini carte**: materiale Bandai; per il lancio pubblico valutare link alla fonte o assenza di immagini.
- **Qualità dati**: tornei creati da giocatori fuori dall'app rischiano duplicati; mitigare con ricerca del torneo prima del "libero".
- **Moderazione**: serve almeno segnalazione/nascondi contenuto da admin.
- **Catalogo**: scegliere la fonte per carte/leader e come tenerla aggiornata a ogni nuovo set.
- **Supabase**: progetto indicato `kmbldqswzlmdapmmzbdl`. Il connettore MCP della sessione non vi ha accesso (vede solo un altro progetto), quindi le migrazioni vanno applicate con la Supabase CLI o collegando l'account giusto.
