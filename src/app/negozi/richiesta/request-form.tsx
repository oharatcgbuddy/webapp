"use client";

import { useActionState, useState } from "react";
import { submitRequest, type ActionState } from "./actions";

type ShopOpt = { id: string; name: string; city: string | null };

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

export function RequestForm({ shops }: { shops: ShopOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitRequest, {});
  const [mode, setMode] = useState<"existing" | "new">(shops.length > 0 ? "existing" : "new");

  return (
    <form action={action} className="space-y-4 p-4">
      {shops.length > 0 && (
        <fieldset className="flex gap-2">
          <legend className="sr-only">Tipo di richiesta</legend>
          {(
            [
              ["existing", "Negozio esistente"],
              ["new", "Nuovo negozio"],
            ] as const
          ).map(([value, text]) => (
            <label
              key={value}
              className="flex-1 cursor-pointer border-[3px] border-ink bg-white px-2 py-3 text-center font-bold has-checked:bg-brand-yellow"
            >
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </fieldset>
      )}
      {shops.length === 0 && <input type="hidden" name="mode" value="new" />}

      {mode === "existing" ? (
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
      ) : (
        <section className="brutal-card space-y-3 p-4">
          <label className={label}>
            Nome del negozio
            <input name="name" required maxLength={80} className={field} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className={`${label} col-span-2`}>
              Città
              <input name="city" required maxLength={60} className={field} />
            </label>
            <label className={label}>
              Prov.
              <input name="province" required maxLength={2} placeholder="MI" className={`${field} uppercase`} />
            </label>
          </div>
          <label className={label}>
            Indirizzo
            <input name="address" maxLength={120} className={field} />
          </label>
          <label className={label}>
            Telefono
            <input name="phone" type="tel" maxLength={30} className={field} />
          </label>
          <label className={label}>
            Sito web
            <input name="website" maxLength={200} placeholder="www.esempio.it" className={field} />
          </label>
          <label className={label}>
            Descrizione
            <textarea name="description" rows={3} maxLength={1000} className={field} />
          </label>
        </section>
      )}

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Invio…" : "Invia richiesta"}
      </button>
    </form>
  );
}
