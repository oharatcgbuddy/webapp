"use client";

import { useActionState, useState } from "react";
import { LeaderPicker, type LeaderOpt } from "@/app/onepiece/risultati/track/leader-picker";
import { createResult, type ResultState } from "./actions";

const field = "block w-full border-[3px] border-ink bg-white px-3 py-2";
const MAX_ROUNDS = 16;

function Fields({ leaders, pending, state }: { leaders: LeaderOpt[]; pending: boolean; state: ResultState }) {
  const [rows, setRows] = useState(0);
  const [outcomes, setOutcomes] = useState<string[]>([]);

  return (
    <>
      <section className="brutal-card space-y-3 p-4">
        <label className="block text-sm font-bold uppercase">
          Nome del giocatore
          <input name="player_name" required maxLength={40} autoComplete="off" className={`${field} mt-1 normal-case`} />
        </label>
        <LeaderPicker name="leader_code" label="Leader" leaders={leaders} />
        <label className="block text-sm font-bold uppercase">
          Mazzo (facoltativo)
          <textarea
            name="decklist"
            rows={5}
            placeholder={"4xOP01-013\n4xOP01-016\n1xEB05-021"}
            className={`${field} mt-1 font-mono text-xs normal-case`}
          />
        </label>
      </section>

      <section className="brutal-card space-y-3 p-4">
        <h3 className="font-black uppercase">Risultato</h3>
        <label className="block text-sm font-bold uppercase">
          Piazzamento (1 = vincitore)
          <input name="placement" type="number" inputMode="numeric" min={1} max={1024} className={`${field} mt-1`} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["wins", "losses"] as const).map((k) => (
            <label key={k} className="block text-xs font-bold uppercase">
              {k === "wins" ? "Vinte" : "Perse"}
              <input name={k} type="number" inputMode="numeric" min={0} max={30} className={`${field} mt-1`} />
            </label>
          ))}
        </div>
        <p className="text-xs">Se aggiungi gli scontri, il record si calcola da lì (il BYE conta come vinto).</p>
      </section>

      <section className="brutal-card space-y-3 p-4">
        <h3 className="font-black uppercase">Scontri (facoltativi)</h3>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2 border-[3px] border-ink p-2">
            <p className="text-xs font-bold uppercase">Round {i + 1}</p>
            <select name="m_result" aria-label={`Round ${i + 1}: esito`} required className={field}
              value={outcomes[i] ?? ""}
              onChange={(e) => setOutcomes((o) => { const n = [...o]; n[i] = e.target.value; return n; })}>
              <option value="">Esito…</option>
              <option value="win">Vinto</option>
              <option value="loss">Perso</option>
              <option value="bye">BYE (vinto, senza avversario)</option>
            </select>
            {/* Sempre presenti (anche per il BYE) così le righe inviate restano allineate: si nascondono soltanto. */}
            <div className={outcomes[i] === "bye" ? "hidden" : "space-y-2"}>
                <select name="m_leader" aria-label={`Round ${i + 1}: leader avversario`} className={field} defaultValue="">
                  <option value="">Leader avversario (non indicato)</option>
                  {leaders.map((l) => (
                    <option key={l.card_code} value={l.card_code}>
                      {l.card_code} · {l.name}
                    </option>
                  ))}
                </select>
                <select name="m_dice" aria-label={`Round ${i + 1}: dado`} className={field} defaultValue="">
                  <option value="">Dado non indicato</option>
                  <option value="won">Dado vinto</option>
                  <option value="lost">Dado perso</option>
                </select>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRows((n) => Math.min(MAX_ROUNDS, n + 1))}
            disabled={rows >= MAX_ROUNDS}
            className="brutal-btn bg-white disabled:opacity-50"
          >
            + Round
          </button>
          <button
            type="button"
            onClick={() => { setRows((n) => Math.max(0, n - 1)); setOutcomes((o) => o.slice(0, -1)); }}
            disabled={rows === 0}
            className="brutal-btn bg-white disabled:opacity-50"
          >
            − Ultimo
          </button>
        </div>
      </section>

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvo…" : "Salva risultato"}
      </button>
    </>
  );
}

export function ResultForm({ slug, tournamentId, leaders }: { slug: string; tournamentId: string; leaders: LeaderOpt[] }) {
  const [state, action, pending] = useActionState<ResultState, FormData>(createResult.bind(null, slug, tournamentId), {});
  const [version, setVersion] = useState(0);

  // Dopo un salvataggio riuscito il modulo riparte vuoto (la chiave cambia e i campi si ricreano).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setVersion((v) => v + 1);
  }

  return (
    <form action={action} className="space-y-4">
      {state.ok && !state.error && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          Risultato salvato. Lo trovi nell&apos;elenco qui sopra.
        </p>
      )}
      <Fields key={version} leaders={leaders} pending={pending} state={state} />
    </form>
  );
}
