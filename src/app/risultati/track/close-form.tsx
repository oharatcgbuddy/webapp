"use client";

import { useActionState } from "react";
import { closeTrack, cancelTrack, type ActionState } from "./actions";

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";

export function CloseForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(closeTrack, {});

  return (
    <section className="brutal-card space-y-3 p-4">
      <h2 className="text-xl font-black uppercase">Chiudi torneo</h2>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-bold uppercase">
            Piazzamento
            <input type="number" inputMode="numeric" name="placement" min={1} className={field} />
          </label>
          <label className="block text-sm font-bold uppercase">
            Giocatori
            <input type="number" inputMode="numeric" name="players_count" min={1} className={field} />
          </label>
        </div>
        {state.error && (
          <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
          {pending ? "Chiudo…" : "Chiudi e salva"}
        </button>
      </form>

      <form
        action={cancelTrack}
        onSubmit={(e) => {
          if (!window.confirm("Annullare il track? I round registrati verranno eliminati.")) e.preventDefault();
        }}
      >
        <button type="submit" className="w-full text-sm font-bold underline">
          Annulla track
        </button>
      </form>
    </section>
  );
}
