"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShopLogo } from "@/components/shop-logo";
import { distanceKm, formatKm, type LatLng } from "@/lib/geo";

export type TournamentItem = {
  id: string;
  title: string;
  starts_at: string;
  entry_fee_cents: number | null;
  max_players: number | null;
  format_slug: string | null;
  shops: {
    name: string;
    city: string | null;
    province: string | null;
    lat: number | null;
    lng: number | null;
    logo_url: string | null;
  } | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function euro(cents: number | null) {
  if (cents == null) return null;
  return cents === 0
    ? "Gratis"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const RADII = [10, 25, 50, 100, 0]; // 0 = nessun limite

// Giorno nel fuso italiano come "AAAA-MM-GG" (il formato del selettore data).
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (d: Date) => dayFmt.format(d);

export function TournamentCards({ items, emptyHint }: { items: TournamentItem[]; emptyHint: string }) {
  const [user, setUser] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(50);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(""); // "" = tutte le date

  // La posizione resta sul dispositivo: non viene inviata al server.
  function locate() {
    if (user) {
      setUser(null);
      return;
    }
    if (!navigator.geolocation) {
      setError("Il tuo browser non supporta la geolocalizzazione.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Non riesco a leggere la tua posizione. Controlla i permessi del browser.");
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  const rows = useMemo(() => {
    const dated = day ? items.filter((t) => dayOf(new Date(t.starts_at)) === day) : items;
    const withKm = dated.map((t) => {
      const s = t.shops;
      const km = user && s && s.lat != null && s.lng != null ? distanceKm(user, { lat: s.lat, lng: s.lng }) : null;
      return { t, km };
    });
    if (!user) return withKm;
    return withKm
      .filter((r) => r.km !== null && (radius === 0 || r.km <= radius))
      .sort((a, b) => (a.km as number) - (b.km as number));
  }, [items, user, radius, day]);

  return (
    <>
      <div className="brutal-card space-y-2 p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDay(day === dayOf(new Date()) ? "" : dayOf(new Date()))}
            aria-pressed={day !== "" && day === dayOf(new Date())}
            className={`brutal-btn flex-1 ${day !== "" && day === dayOf(new Date()) ? "bg-brand-yellow" : "bg-white"}`}
          >
            Oggi
          </button>
          {day && (
            <button type="button" onClick={() => setDay("")} className="brutal-btn flex-1 bg-white">
              Tutte le date
            </button>
          )}
        </div>
        <label className="block min-w-0 text-sm font-bold">
          Data
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 block w-full min-w-0 max-w-full appearance-none border-[3px] border-ink bg-white px-2 py-2"
          />
        </label>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-pressed={!!user}
          className={`brutal-btn w-full disabled:opacity-60 ${user ? "bg-brand-blue" : "bg-white"}`}
        >
          {locating ? "Cerco la tua posizione…" : user ? "📍 Vicino a me: attivo" : "📍 Vicino a me"}
        </button>
        {user && (
          <label className="block text-sm font-bold">
            Distanza massima
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-1 block w-full border-[3px] border-ink bg-white px-2 py-2"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "Nessun limite" : `Entro ${r} km`}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="border-[3px] border-ink bg-brand-red p-2 text-sm font-bold">
            {error}
          </p>
        )}
      </div>

      {rows.length > 0 ? (
        <ul className="space-y-4">
          {rows.map(({ t, km }) => (
            <li key={t.id} className="brutal-card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase">{dateFmt.format(new Date(t.starts_at))}</p>
                  <h2 className="text-xl font-black leading-tight">
                    <Link href={`/onepiece/tornei/${t.id}`} className="underline decoration-[3px]">
                      {t.title}
                    </Link>
                  </h2>
                  <p className="text-sm">
                    {t.shops ? `${t.shops.name}${t.shops.city ? ` · ${t.shops.city}` : ""}` : "Torneo libero"}
                  </p>
                </div>
                {t.shops && <ShopLogo name={t.shops.name} logoUrl={t.shops.logo_url} size={56} />}
              </div>
              <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                {km !== null && (
                  <span className="border-2 border-ink bg-brand-pink px-2 py-1">{formatKm(km)}</span>
                )}
                {euro(t.entry_fee_cents) && (
                  <span className="border-2 border-ink bg-brand-yellow px-2 py-1">{euro(t.entry_fee_cents)}</span>
                )}
                {t.format_slug && (
                  <span className="border-2 border-ink bg-brand-blue px-2 py-1">{t.format_slug}</span>
                )}
                {t.max_players && (
                  <span className="border-2 border-ink bg-brand-green px-2 py-1">{t.max_players} posti</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="brutal-card p-4">
          <p className="font-bold">Nessun torneo trovato</p>
          <p className="text-sm">
            {user
              ? "Nessun torneo entro questa distanza, o i negozi non hanno ancora una posizione sulla mappa."
              : day
                ? "Nessun torneo in questa data: prova un altro giorno o togli il filtro."
                : emptyHint}
          </p>
        </div>
      )}
    </>
  );
}
