"use client";

import { useActionState, useRef, useState } from "react";
import { saveResult, type ActionState } from "./actions";
import { LeaderPicker, type LeaderOpt } from "../track/leader-picker";

type TournamentOpt = { id: string; label: string };
type DeckOpt = { id: string; name: string; leader_code: string | null };
type ShopOpt = { id: string; label: string };

// Un round come nel track in diretta: leader avversario, dado, esito, nota oppure BYE.
type MatchRow = {
  key: number; // identità stabile: i selettori dei leader tengono il loro stato interno
  bye: boolean;
  opponent_leader_code: string;
  dice: "" | "won" | "lost";
  result: "" | "win" | "loss";
  notes: string;
};

const MAX_ROUNDS = 30;

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

function Choice({
  legend,
  value,
  options,
  onPick,
}: {
  legend: string;
  value: string;
  options: { value: string; text: string; active: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-bold uppercase">{legend}</legend>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={`flex-1 border-[3px] border-ink px-2 py-3 text-center font-bold ${
              value === o.value ? o.active : "bg-white"
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ResultForm({
  tournaments,
  leaders,
  decks,
  shops,
  initialTournament,
  today,
}: {
  tournaments: TournamentOpt[];
  leaders: LeaderOpt[];
  decks: DeckOpt[];
  shops: ShopOpt[];
  initialTournament: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveResult, {});
  const [tournamentId, setTournamentId] = useState(initialTournament);
  const [deckChoice, setDeckChoice] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const nextKey = useRef(0);
  // Un mazzo salvato decide il leader: il selettore compare solo senza mazzo o con una decklist nuova.
  const savedDeck = decks.find((d) => d.id === deckChoice && d.leader_code) ?? null;

  const update = (key: number, patch: Partial<MatchRow>) =>
    setMatches((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Il record si calcola dai round, come alla chiusura del track (il BYE conta come vinto).
  const wins = matches.filter((m) => m.bye || m.result === "win").length;
  const losses = matches.filter((m) => !m.bye && m.result === "loss").length;

  // Quello che riceve il server: un round incompleto arriva com'è e il server dice quale correggere.
  const payload = matches.map((m) =>
    m.bye
      ? { result: "bye", notes: m.notes }
      : { result: m.result, opponent_leader_code: m.opponent_leader_code, dice: m.dice, notes: m.notes },
  );

  if (leaders.length === 0) {
    return (
      <main className="p-4">
        <div className="brutal-card p-4">
          <p className="font-bold">Catalogo leader non ancora caricato</p>
          <p className="text-sm">Puoi inserire i risultati appena i leader One Piece sono nel database.</p>
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
                <span className="mt-1 block text-xs font-normal normal-case">
                  Nome e logo del locale compaiono nelle immagini.
                </span>
              </label>
            )}
            <label className={label}>
              Data
              <input type="date" name="played_on" max={today} defaultValue={today} className={field} />
            </label>
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
            <span className="mt-1 block text-xs font-normal normal-case">Una carta per riga. 50 carte, più il leader se vuoi includerlo (lo riconosco da lì).</span>
          </label>
        )}
      </section>

      <section className="brutal-card space-y-3 p-4">
        <h2 className="font-black uppercase">Round</h2>
        <p className="text-xs">
          Registrali come nel track in diretta: leader avversario, dado ed esito. Vittorie e sconfitte si calcolano da qui.
        </p>

        {matches.map((m, i) => (
          <div key={m.key} className="space-y-3 border-[3px] border-ink p-3">
            <p className="text-sm font-bold uppercase">Round {i + 1}</p>

            <button
              type="button"
              aria-pressed={m.bye}
              onClick={() => update(m.key, { bye: !m.bye })}
              className={`brutal-btn w-full ${m.bye ? "bg-brand-pink" : "bg-white"}`}
            >
              {m.bye ? "✓ BYE: turno di riposo (conta come vinto)" : "È un BYE (turno di riposo)"}
            </button>

            {/* Nascosto, non smontato, per il BYE: il selettore del leader non perde la scelta se si cambia idea. */}
            <div hidden={m.bye} className="space-y-3">
              <LeaderPicker
                name={`round_opponent_${m.key}`}
                label="Leader avversario"
                leaders={leaders}
                onChange={(code) => update(m.key, { opponent_leader_code: code })}
              />
              <Choice
                legend="Dado"
                value={m.dice}
                onPick={(v) => update(m.key, { dice: v as MatchRow["dice"] })}
                options={[
                  { value: "won", text: "Vinto", active: "bg-brand-green" },
                  { value: "lost", text: "Perso", active: "bg-brand-red" },
                ]}
              />
              <Choice
                legend="Esito"
                value={m.result}
                onPick={(v) => update(m.key, { result: v as MatchRow["result"] })}
                options={[
                  { value: "win", text: "Vinto", active: "bg-brand-green" },
                  { value: "loss", text: "Perso", active: "bg-brand-red" },
                ]}
              />
            </div>

            <input
              aria-label={`Nota round ${i + 1}`}
              value={m.notes}
              maxLength={140}
              autoComplete="off"
              onChange={(e) => update(m.key, { notes: e.target.value })}
              placeholder="Nota breve (facoltativa, max 140)"
              className={field}
            />
            <button
              type="button"
              onClick={() => setMatches((rows) => rows.filter((r) => r.key !== m.key))}
              className="text-sm font-bold underline"
            >
              Rimuovi round
            </button>
          </div>
        ))}

        {matches.length < MAX_ROUNDS && (
          <button
            type="button"
            className="brutal-btn w-full bg-white"
            onClick={() =>
              setMatches((rows) => [
                ...rows,
                { key: nextKey.current++, bye: false, opponent_leader_code: "", dice: "", result: "", notes: "" },
              ])
            }
          >
            + Aggiungi round
          </button>
        )}
        <input type="hidden" name="matches" value={JSON.stringify(payload)} />

        <p className="inline-block border-2 border-ink bg-brand-yellow px-2 py-1 text-sm font-bold">
          Record dai round: {wins}V · {losses}S
        </p>
      </section>

      <section className="brutal-card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Piazzamento
            <input type="number" inputMode="numeric" name="placement" min={1} className={field} />
          </label>
          <label className={label}>
            Giocatori
            <input type="number" inputMode="numeric" name="players_count" min={1} className={field} />
          </label>
        </div>
      </section>

      <label className={label}>
        Note
        <textarea name="notes" rows={3} maxLength={1000} className={field} />
      </label>

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvataggio…" : "Salva risultato"}
      </button>
    </form>
  );
}
