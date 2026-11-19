"use client";

import { useActionState, useState } from "react";
import { startTrack, type ActionState } from "./actions";
import { LeaderPicker, type LeaderOpt } from "./leader-picker";

type TournamentOpt = { id: string; label: string };
type DeckOpt = { id: string; name: string; leader_code: string | null };
type ShopOpt = { id: string; label: string };

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

export function StartForm({
  tournaments,
  leaders,
  decks,
  shops,
}: {
  tournaments: TournamentOpt[];
  leaders: LeaderOpt[];
  decks: DeckOpt[];
  shops: ShopOpt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startTrack, {});
  const [tournamentId, setTournamentId] = useState("");
  const [deckChoice, setDeckChoice] = useState("");
  // Un mazzo salvato decide il leader: il selettore compare solo senza mazzo o con una decklist nuova.
  const savedDeck = decks.find((d) => d.id === deckChoice && d.leader_code) ?? null;

  if (leaders.length === 0) {
    return (
      <main className="p-4">
        <div className="brutal-card p-4">
          <p className="font-bold">Catalogo leader non ancora caricato</p>
          <p className="text-sm">Il track parte appena i leader One Piece sono nel database.</p>
        </div>
      </main>
    );
  }

  return (
    <form action={action} className="space-y-4 p-4">
      <section className="brutal-card space-y-3 p-4">
        <label className={label}>
          Torneo
          <select
            name="tournament_id"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            className={field}
          >
            <option value="">Torneo libero (non in elenco)</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {tournamentId && (
          <p className="text-xs">
            Il negozio che organizza il torneo vedrà il tuo risultato e potrà creare l&apos;immagine. Puoi nasconderlo dal dettaglio del
            risultato.
          </p>
        )}
        {tournaments.length === 0 && (
          <p className="text-xs">Nessun torneo in corso oggi: puoi usare un torneo libero.</p>
        )}
        {!tournamentId && (
          <>
            <label className={label}>
              Nome del torneo
              <input name="standalone_label" maxLength={80} required className={field} placeholder="es. Locals da Mario" />
            </label>
            {shops.length > 0 && (
              <label className={label}>
                Locale (facoltativo)
                <select name="shop_id" defaultValue="" className={field}>
                  <option value="">Nessun locale</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal normal-case">Nome e logo del locale compaiono nelle immagini.</span>
              </label>
            )}
            <label className={label}>
              Link evento BANDAI TCG+ (facoltativo)
              <input
                name="bandai_url"
                type="url"
                inputMode="url"
                maxLength={2000}
                className={field}
                placeholder="https://www.bandai-tcg-plus.com/event/…"
              />
              <span className="mt-1 block text-xs font-normal normal-case">
                Se un altro giocatore o il negozio l&apos;ha già inserito, ti collego allo stesso torneo.
              </span>
            </label>
          </>
        )}
      </section>

      <section className="brutal-card space-y-3 p-4">
        {savedDeck ? (
          <p className="border-[3px] border-ink bg-brand-yellow p-3 text-sm font-bold">
            Leader del mazzo: {savedDeck.leader_code} · {leaders.find((l) => l.card_code === savedDeck.leader_code)?.name ?? ""}
          </p>
        ) : (
          <LeaderPicker
            name="leader_code"
            label={deckChoice === "new" ? "Il tuo leader (se non è nella lista)" : "Il tuo leader"}
            leaders={leaders}
            required={deckChoice !== "new"}
          />
        )}

        <label className={label}>
          Decklist
          <select
            name="deck_choice"
            value={deckChoice}
            onChange={(e) => setDeckChoice(e.target.value)}
            className={field}
          >
            <option value="">Nessuna</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.leader_code ? ` · ${d.leader_code}` : ""}
              </option>
            ))}
            <option value="new">Incolla una nuova decklist…</option>
          </select>
        </label>
        {deckChoice === "new" && (
          <label className={label}>
            Lista carte
            <textarea
              name="decklist"
              rows={8}
              maxLength={4000}
              className={`${field} font-mono text-sm`}
              placeholder={"4x OP01-013\n4x OP01-016\n..."}
            />
            <span className="mt-1 block text-xs font-normal normal-case">
              Una carta per riga. 50 carte, più il leader se vuoi includerlo (lo riconosco da lì).
            </span>
          </label>
        )}
      </section>

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Avvio…" : "▶ Avvia track"}
      </button>
    </form>
  );
}
