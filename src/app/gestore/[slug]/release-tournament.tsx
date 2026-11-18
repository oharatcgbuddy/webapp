"use client";

import { releaseTournament } from "./actions";

// Solo per gli admin: annulla un riscatto (il torneo torna alla comunità, senza locale).
export function ReleaseTournament({ slug, id }: { slug: string; id: string }) {
  return (
    <form
      action={releaseTournament.bind(null, slug, id)}
      onSubmit={(e) => {
        if (!window.confirm("Restituire il torneo alla comunità? Tornerà senza locale e con il titolo di prima.")) e.preventDefault();
      }}
      className="space-y-1"
    >
      <button type="submit" className="brutal-btn w-full bg-brand-blue">
        Admin · Restituisci alla comunità
      </button>
      <p className="text-xs">Questo torneo è stato riscattato da un locale.</p>
    </form>
  );
}
