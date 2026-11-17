-- Applicata sul progetto dev il 2026-11-17 (versione 20261117144221).
-- Difesa in profondità sulle note dei round: anche chi scrivesse direttamente sull'API (saltando
-- l'app) non può salvare note lunghe, con caratteri di controllo o con caratteri invisibili/bidi.
-- Il filtro delle parolacce resta nell'app (src/lib/note-text.ts): nel database non è mantenibile.
-- Nessuna riga esistente ha note (verificato), quindi il vincolo si applica senza rischi.

alter table onepiece.matches
  add constraint matches_notes_check
  check (
    notes is null
    or (
      char_length(notes) between 1 and 140
      and notes !~ '[[:cntrl:]]'
      and notes !~ '[​-‏‪-‮⁠-⁤⁦-⁩﻿]'
    )
  );
