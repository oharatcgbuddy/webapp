"use client";

import { useActionState } from "react";
import { addOwner, type ActionState } from "../actions";

export function OwnerForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addOwner.bind(null, slug), {});

  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-bold uppercase">
        Aggiungi un gestore
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          placeholder="email Google del gestore"
          className="mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2 normal-case"
        />
      </label>
      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Aggiungo…" : "Aggiungi gestore"}
      </button>
    </form>
  );
}
