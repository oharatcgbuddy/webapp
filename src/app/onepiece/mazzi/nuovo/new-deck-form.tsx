"use client";

import { useActionState } from "react";
import { LeaderPicker, type LeaderOpt } from "@/app/onepiece/risultati/track/leader-picker";
import { createDeck, type ActionState } from "../actions";

export function NewDeckForm({ leaders }: { leaders: LeaderOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createDeck, {});

  return (
    <form action={action} className="space-y-4">
      <section className="brutal-card space-y-3 p-4">
        <label className="block text-sm font-bold uppercase">
          Nome del mazzo
          <input
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            placeholder="es. Zoro aggro"
            className="mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2 normal-case"
          />
        </label>
      </section>

      <section className="brutal-card p-4">
        <LeaderPicker name="leader_code" label="Leader del mazzo" leaders={leaders} />
      </section>

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Creo…" : "Crea e scegli le carte"}
      </button>
    </form>
  );
}
