"use client";

import { useActionState } from "react";
import { createTournament, updateTournament, type ActionState } from "./actions";

export type TournamentValues = {
  title: string;
  tcg_id: string;
  format_slug: string;
  starts_at: string; // "YYYY-MM-DDTHH:mm" in ora italiana
  entry_fee: string; // euro
  max_players: string;
  prizes: string;
  notes: string;
  status: "scheduled" | "completed" | "cancelled";
};

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

const FORMATS = ["standard", "casual", "sealed", "draft", "proxy"];

export function TournamentForm({
  slug,
  tournamentId,
  tcgs,
  initial,
}: {
  slug: string;
  tournamentId?: string;
  tcgs: { id: number; name: string }[];
  initial: TournamentValues;
}) {
  const bound = tournamentId ? updateTournament.bind(null, slug, tournamentId) : createTournament.bind(null, slug);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});

  return (
    <form action={action} className="brutal-card space-y-3 p-4">
      <label className={label}>
        Titolo
        <input name="title" required maxLength={80} defaultValue={initial.title} className={field} />
      </label>
      <label className={label}>
        Gioco
        <select name="tcg_id" required defaultValue={initial.tcg_id} className={field}>
          {tcgs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Formato
        <input name="format_slug" list="formats" maxLength={30} defaultValue={initial.format_slug} className={field} />
        <datalist id="formats">
          {FORMATS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <label className={label}>
        Data e ora (ora italiana)
        <input name="starts_at" type="datetime-local" required defaultValue={initial.starts_at} className={field} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Costo (€)
          <input name="entry_fee" inputMode="decimal" maxLength={10} defaultValue={initial.entry_fee} placeholder="0 = gratis" className={field} />
        </label>
        <label className={label}>
          Posti
          <input name="max_players" type="number" inputMode="numeric" min={1} defaultValue={initial.max_players} className={field} />
        </label>
      </div>
      <label className={label}>
        Premi
        <textarea name="prizes" rows={3} maxLength={500} defaultValue={initial.prizes} className={field} />
      </label>
      <label className={label}>
        Note
        <textarea name="notes" rows={3} maxLength={1000} defaultValue={initial.notes} className={field} />
      </label>
      {tournamentId && (
        <label className={label}>
          Stato
          <select name="status" defaultValue={initial.status} className={field}>
            <option value="scheduled">In programma</option>
            <option value="completed">Concluso</option>
            <option value="cancelled">Annullato</option>
          </select>
        </label>
      )}

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvo…" : tournamentId ? "Salva torneo" : "Crea torneo"}
      </button>
    </form>
  );
}
