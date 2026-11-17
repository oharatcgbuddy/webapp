"use client";

import { deleteResult } from "./actions";

export function DeleteButton({ id }: { id: string }) {
  return (
    <form
      action={deleteResult.bind(null, id)}
      onSubmit={(e) => {
        if (!window.confirm("Eliminare questo risultato? L'operazione non si può annullare.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="brutal-btn w-full bg-brand-red">
        Elimina risultato
      </button>
    </form>
  );
}
