"use client";

import { deleteRegional } from "./actions";

export function DeleteRegional({ id }: { id: string }) {
  return (
    <form
      action={deleteRegional.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm("Eliminare il torneo? I risultati già registrati dai giocatori restano, ma senza il collegamento al torneo.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="brutal-btn w-full bg-brand-red">
        Elimina torneo
      </button>
    </form>
  );
}
