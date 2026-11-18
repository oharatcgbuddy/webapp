"use client";

import { useActionState } from "react";
import { saveAlias, type AliasState } from "./alias-actions";

export function AliasForm({ alias }: { alias: string | null }) {
  const [state, action, pending] = useActionState<AliasState, FormData>(saveAlias, {});

  return (
    <form action={action} className="brutal-card space-y-3 p-4">
      <label className="block text-sm font-bold uppercase">
        Il tuo alias
        <input
          name="alias"
          defaultValue={alias ?? ""}
          maxLength={24}
          autoComplete="off"
          placeholder="es. Pirata89"
          className="mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2 normal-case"
        />
      </label>
      <p className="text-sm">Compare nelle immagini del mazzo e dei risultati che crei tu. Lascia vuoto per non usarlo.</p>
      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          Alias salvato.
        </p>
      )}
      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-yellow disabled:opacity-60">
        {pending ? "Salvo…" : "Salva alias"}
      </button>
    </form>
  );
}
