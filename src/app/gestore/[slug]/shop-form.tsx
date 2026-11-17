"use client";

import { useActionState } from "react";
import { updateShop, type ActionState } from "./actions";
import { LocationPicker } from "./location-picker";

export type ShopValues = {
  name: string;
  city: string;
  province: string;
  address: string;
  phone: string;
  website: string;
  description: string;
  instagram: string;
  facebook: string;
  discord: string;
  lat: string;
  lng: string;
};

const field = "mt-1 block w-full border-[3px] border-ink bg-white px-3 py-2";
const label = "block text-sm font-bold uppercase";

export function ShopForm({ slug, initial }: { slug: string; initial: ShopValues }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateShop.bind(null, slug), {});

  return (
    <form action={action} className="brutal-card space-y-3 p-4">
      <label className={label}>
        Nome
        <input name="name" required maxLength={80} defaultValue={initial.name} className={field} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className={`${label} col-span-2`}>
          Città
          <input name="city" required maxLength={60} defaultValue={initial.city} className={field} />
        </label>
        <label className={label}>
          Prov.
          <input
            name="province"
            required
            maxLength={2}
            defaultValue={initial.province}
            className={`${field} uppercase`}
          />
        </label>
      </div>
      <label className={label}>
        Indirizzo
        <input name="address" maxLength={120} defaultValue={initial.address} className={field} />
      </label>
      <label className={label}>
        Telefono
        <input name="phone" type="tel" maxLength={30} defaultValue={initial.phone} className={field} />
      </label>
      <label className={label}>
        Sito web
        <input name="website" maxLength={200} defaultValue={initial.website} className={field} />
      </label>
      <label className={label}>
        Instagram
        <input name="instagram" maxLength={200} defaultValue={initial.instagram} className={field} />
      </label>
      <label className={label}>
        Facebook
        <input name="facebook" maxLength={200} defaultValue={initial.facebook} className={field} />
      </label>
      <label className={label}>
        Discord
        <input name="discord" maxLength={200} defaultValue={initial.discord} className={field} />
      </label>
      <label className={label}>
        Descrizione
        <textarea name="description" rows={4} maxLength={1000} defaultValue={initial.description} className={field} />
      </label>

      <LocationPicker initialLat={initial.lat} initialLng={initial.lng} />

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          Modifiche salvate.
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvo…" : "Salva pagina negozio"}
      </button>
    </form>
  );
}
