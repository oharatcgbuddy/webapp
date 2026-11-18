"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "./actions";
import { AddressSearch } from "./address-search";
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

// Lo stesso form serve per modificare un negozio (gestore o admin) e per crearne uno (admin):
// cambia solo l'azione che salva.
export function ShopForm({
  action: saveAction,
  initial,
  submitLabel = "Salva pagina negozio",
  savedMessage = "Modifiche salvate.",
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial: ShopValues;
  submitLabel?: string;
  savedMessage?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAction, {});
  const [address, setAddress] = useState(initial.address);
  const [city, setCity] = useState(initial.city);
  const [province, setProvince] = useState(initial.province);
  const [target, setTarget] = useState<{ lat: number; lng: number; n: number } | null>(null);

  return (
    <form action={action} className="brutal-card space-y-3 p-4">
      <label className={label}>
        Nome
        <input name="name" required maxLength={80} defaultValue={initial.name} className={field} />
      </label>
      <div className={label}>
        Indirizzo
        <AddressSearch
          value={address}
          onChange={setAddress}
          className={field}
          onPick={(s) => {
            if (s.address) setAddress(s.address);
            if (s.city) setCity(s.city);
            if (s.province) setProvince(s.province);
            setTarget({ lat: s.lat, lng: s.lng, n: Date.now() });
          }}
        />
        <span className="mt-1 block text-xs font-medium normal-case">
          Scrivi e scegli un suggerimento (OpenStreetMap): compila città, provincia e posizione sulla mappa.
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className={`${label} col-span-2`}>
          Città
          <input name="city" required maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} className={field} />
        </label>
        <label className={label}>
          Prov.
          <input
            name="province"
            required
            maxLength={2}
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className={`${field} uppercase`}
          />
        </label>
      </div>
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

      <LocationPicker initialLat={initial.lat} initialLng={initial.lng} target={target} />

      {state.error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="border-[3px] border-ink bg-brand-green p-3 font-bold">
          {savedMessage}
        </p>
      )}

      <button type="submit" disabled={pending} className="brutal-btn w-full bg-brand-green disabled:opacity-60">
        {pending ? "Salvo…" : submitLabel}
      </button>
    </form>
  );
}
