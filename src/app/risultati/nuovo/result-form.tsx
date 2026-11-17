"use client";

import { useActionState, useState } from "react";
import { saveResult, type ActionState } from "./actions";

type TournamentOpt = { id: string; label: string };
type LeaderOpt = { card_code: string; name: string };
type MatchRow = {
  result: "win" | "loss" | "draw";
  on_play: "" | "yes" | "no";
  opponent_name: string;
  notes: string;
};

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

export function ResultForm({
  tournaments,
  leaders,
  initialTournament,
  today,
}: {
  tournaments: TournamentOpt[];
  leaders: LeaderOpt[];
  initialTournament: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveResult, {});
  const [tournamentId, setTournamentId] = useState(initialTournament);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const update = (i: number, patch: Partial<MatchRow>) =>
    setMatches((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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

        {!tournamentId && (
          <>
            <label className={label}>
              Nome del torneo
              <input name="standalone_label" maxLength={80} className={field} placeholder="es. Locals da Mario" />
            </label>
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
        <label className={label}>
          Leader (facoltativo)
          <select name="leader_code" className={field} defaultValue="">
            <option value="">— nessuno —</option>
            {leaders.map((l) => (
              <option key={l.card_code} value={l.card_code}>
                {l.card_code} · {l.name}
              </option>
            ))}
          </select>
        </label>
        {leaders.length === 0 && (
          <p className="text-sm">L&apos;elenco dei leader sarà disponibile con il catalogo carte.</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {(["wins", "losses", "draws"] as const).map((k) => (
            <label key={k} className={label}>
              {k === "wins" ? "Vitt." : k === "losses" ? "Sconf." : "Pareg."}
              <input type="number" inputMode="numeric" name={k} min={0} max={99} defaultValue={0} className={field} />
            </label>
          ))}
        </div>
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

      <section className="brutal-card space-y-3 p-4">
        <h2 className="font-black uppercase">Match (facoltativo)</h2>
        {matches.map((m, i) => (
          <div key={i} className="space-y-2 border-[3px] border-ink p-3">
            <p className="text-sm font-bold">Round {i + 1}</p>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label={`Esito round ${i + 1}`}
                value={m.result}
                onChange={(e) => update(i, { result: e.target.value as MatchRow["result"] })}
                className={field}
              >
                <option value="win">Vittoria</option>
                <option value="loss">Sconfitta</option>
                <option value="draw">Pareggio</option>
              </select>
              <select
                aria-label={`Turno round ${i + 1}`}
                value={m.on_play}
                onChange={(e) => update(i, { on_play: e.target.value as MatchRow["on_play"] })}
                className={field}
              >
                <option value="">Turno ?</option>
                <option value="yes">Primo</option>
                <option value="no">Secondo</option>
              </select>
            </div>
            <input
              aria-label={`Avversario round ${i + 1}`}
              value={m.opponent_name}
              maxLength={60}
              onChange={(e) => update(i, { opponent_name: e.target.value })}
              placeholder="Avversario (facoltativo)"
              className={field}
            />
            <input
              aria-label={`Nota round ${i + 1}`}
              value={m.notes}
              maxLength={140}
              autoComplete="off"
              onChange={(e) => update(i, { notes: e.target.value })}
              placeholder="Nota breve (facoltativa, max 140)"
              className={field}
            />
            <button
              type="button"
              onClick={() => setMatches((rows) => rows.filter((_, j) => j !== i))}
              className="text-sm font-bold underline"
            >
              Rimuovi round
            </button>
          </div>
        ))}
        {matches.length < 20 && (
          <button
            type="button"
            className="brutal-btn w-full bg-white"
            onClick={() => setMatches((rows) => [...rows, { result: "win", on_play: "", opponent_name: "", notes: "" }])}
          >
            + Aggiungi round
          </button>
        )}
        <input type="hidden" name="matches" value={JSON.stringify(matches)} />
      </section>

      <section className="brutal-card space-y-2 p-4">
        <label className={label}>
          Decklist (facoltativa)
          <textarea
            name="decklist"
            rows={8}
            maxLength={4000}
            className={`${field} font-mono text-sm`}
            placeholder={"4x OP01-013\n4x OP01-016\n..."}
          />
        </label>
        <p className="text-xs">Una carta per riga: quantità e codice. Il mazzo deve avere 50 carte, leader escluso.</p>
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
