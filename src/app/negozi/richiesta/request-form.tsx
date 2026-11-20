"use client";

import { useActionState } from "react";
import { submitRequest, type ActionState } from "./actions";

type ShopOpt = { id: string; name: string; city: string | null };

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

// Un negozio che non è in lista non si crea più da qui: si scrive a noi, che lo aggiungiamo (anche solo dall'ID di BANDAI TCG+).
const CONTACT_EMAIL = "ohara.tcgbuddy@gmail.com";
const CONTACT_SUBJECT = "Aggiunta negozio";
const CONTACT_BODY = `Ciao,
vorrei aggiungere il mio negozio a Ohara TCG Buddy.

Nome del negozio:
Città e provincia:
Link o ID organizzatore su BANDAI TCG+ (se ce l'hai):
Sito o pagina social:

Grazie!`;
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}&body=${encodeURIComponent(CONTACT_BODY)}`;

export function RequestForm({ shops }: { shops: ShopOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitRequest, {});

  return (
    <div className="space-y-4 p-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="mode" value="existing" />
        <section className="brutal-card space-y-3 p-4">
          <label className={label}>
            Negozio
            <select name="shop_id" required className={field} defaultValue="">
              <option value="">— scegli —</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` · ${s.city}` : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs">Un admin verificherà che tu sia il gestore prima di darti accesso.</p>
        </section>

        {state.error && (
          <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
          {pending ? "Invio…" : "Invia richiesta"}
        </button>
      </form>

      <a href={CONTACT_HREF} className="brutal-btn w-full bg-brand-yellow">
        Non è in lista? Contattaci
      </a>
    </div>
  );
}
