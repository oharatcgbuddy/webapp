"use client";

import { deleteTournament } from "./actions";

export function DeleteTournament({ slug, id }: { slug: string; id: string }) {
  return (
    <form
      action={deleteTournament.bind(null, slug, id)}
      onSubmit={(e) => {
        if (!window.confirm("Eliminare il torneo? Se ha risultati collegati, annullalo invece.")) e.preventDefault();
      }}
    >
      <button type="submit" className="brutal-btn w-full bg-brand-red">
        Elimina torneo
      </button>
    </form>
  );
}
