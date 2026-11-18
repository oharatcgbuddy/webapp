"use client";

import { useActionState, useState } from "react";
import { addRound, type ActionState } from "./actions";
import { LeaderPicker, type LeaderOpt } from "./leader-picker";

function Segment({
  name,
  value,
  text,
  active,
}: {
  name: string;
  value: string;
  text: string;
  active: string;
}) {
  return (
    <label
      className={`flex-1 cursor-pointer border-[3px] border-ink bg-white px-2 py-3 text-center font-bold ${active}`}
    >
      <input type="radio" name={name} value={value} required className="sr-only" />
      {text}
    </label>
  );
}

// Il `key` assegnato dal chiamante (numero del round) azzera il form a ogni round salvato.
export function RoundForm({ round, leaders }: { round: number; leaders: LeaderOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRound, {});
  const [bye, setBye] = useState(false);

  return (
    <form action={action} className="brutal-card space-y-4 p-4">
      <h2 className="text-xl font-black uppercase">Round {round}</h2>

      <button
        type="button"
        aria-pressed={bye}
        onClick={() => setBye((b) => !b)}
        className={`brutal-btn w-full ${bye ? "bg-brand-pink" : "bg-white"}`}
      >
        {bye ? "✓ BYE: turno di riposo (conta come vinto)" : "È un BYE (turno di riposo)"}
      </button>

      {bye ? (
        <input type="hidden" name="result" value="bye" />
      ) : (
        <>
          <LeaderPicker name="opponent_leader" label="Leader avversario" leaders={leaders} />

          <fieldset className="space-y-1">
            <legend className="text-sm font-bold uppercase">Dado</legend>
            <div className="flex gap-2">
              <Segment name="dice" value="won" text="Vinto" active="has-checked:bg-brand-green" />
              <Segment name="dice" value="lost" text="Perso" active="has-checked:bg-brand-red" />
            </div>
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-sm font-bold uppercase">Esito</legend>
            <div className="flex gap-2">
              <Segment name="result" value="win" text="Vinto" active="has-checked:bg-brand-green" />
              <Segment name="result" value="loss" text="Perso" active="has-checked:bg-brand-red" />
            </div>
          </fieldset>
        </>
      )}

      <label className="block text-sm font-bold uppercase">
        Nota (facoltativa)
        <input
          name="notes"
          maxLength={140}
          autoComplete="off"
          placeholder="es. molti blocker, ho vinto al terzo turno"
          className="mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2 normal-case"
        />
        <span className="mt-1 block text-xs font-normal normal-case">Breve testo, massimo 140 caratteri.</span>
      </label>

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full disabled:opacity-60">
        {pending ? "Salvo…" : `Salva round ${round}`}
      </button>
    </form>
  );
}
