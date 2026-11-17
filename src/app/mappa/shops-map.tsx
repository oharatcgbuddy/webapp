"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ITALY_CENTER, MAP_STYLE, distanceKm, formatKm, type LatLng } from "@/lib/geo";

export type MapShop = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  lat: number;
  lng: number;
  next_at: string | null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const YELLOW = "#ffd23f";
const PINK = "#ff8fd8";

export function ShopsMap({ shops }: { shops: MapShop[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const userMarker = useRef<Marker | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [user, setUser] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Mappa e segnaposto dei negozi.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const els = markerEls.current;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      libRef.current = maplibre;
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      map = new maplibre.Map({
        container: container.current,
        style: MAP_STYLE,
        center: ITALY_CENTER,
        zoom: 5,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      const bounds = new maplibre.LngLatBounds();
      for (const s of shops) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", s.name);
        Object.assign(el.style, {
          width: "26px",
          height: "26px",
          borderRadius: "50%",
          border: "3px solid #111",
          background: YELLOW,
          boxShadow: "2px 2px 0 0 #111",
          cursor: "pointer",
          padding: "0",
        });
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelectedId(s.id);
        });
        new maplibre.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
        els.set(s.id, el);
        bounds.extend([s.lng, s.lat]);
      }

      if (shops.length === 1) map.jumpTo({ center: [shops[0].lng, shops[0].lat], zoom: 13 });
      else if (shops.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    })();

    return () => {
      cancelled = true;
      els.clear();
      userMarker.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [shops]);

  // Evidenzia il segnaposto selezionato (senza `transform`, che MapLibre usa per posizionarlo).
  useEffect(() => {
    markerEls.current.forEach((el, id) => {
      el.style.background = id === selectedId ? PINK : YELLOW;
      el.style.boxShadow = id === selectedId ? "4px 4px 0 0 #111" : "2px 2px 0 0 #111";
    });
  }, [selectedId]);

  function focusShop(s: MapShop) {
    setSelectedId(s.id);
    const map = mapRef.current;
    map?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 13) });
  }

  function showUser(u: LatLng) {
    const lib = libRef.current;
    const map = mapRef.current;
    if (!lib || !map) return;
    userMarker.current?.remove();
    const el = document.createElement("div");
    Object.assign(el.style, {
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "3px solid #111",
      background: "#4d9de0",
    });
    el.setAttribute("aria-label", "La tua posizione");
    userMarker.current = new lib.Marker({ element: el }).setLngLat([u.lng, u.lat]).addTo(map);
    map.flyTo({ center: [u.lng, u.lat], zoom: 11 });
  }

  // La posizione resta sul dispositivo: non viene mai inviata al server.
  function locate() {
    if (!navigator.geolocation) {
      setGeoError("Il tuo browser non supporta la geolocalizzazione.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUser(u);
        setLocating(false);
        showUser(u);
      },
      () => {
        setGeoError("Non riesco a leggere la tua posizione. Controlla i permessi del browser.");
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  const list = useMemo(() => {
    const rows = shops.map((s) => ({ shop: s, km: user ? distanceKm(user, s) : null }));
    rows.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.shop.name.localeCompare(b.shop.name));
    return rows.slice(0, 10);
  }, [shops, user]);

  const selected = shops.find((s) => s.id === selectedId) ?? null;

  return (
    <main className="space-y-4 p-4">
      <div
        ref={container}
        role="region"
        aria-label="Mappa dei negozi"
        className="h-80 w-full border-[3px] border-ink shadow-brutal"
      />

      <button type="button" onClick={locate} disabled={locating} className="brutal-btn w-full bg-brand-blue disabled:opacity-60">
        {locating ? "Cerco la tua posizione…" : user ? "📍 Aggiorna la mia posizione" : "📍 Vicino a me"}
      </button>
      {geoError && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          {geoError}
        </p>
      )}

      {selected && (
        <section className="brutal-card space-y-1 p-4" aria-live="polite">
          <h2 className="text-lg font-black leading-tight">{selected.name}</h2>
          <p className="text-sm">{[selected.city, selected.province].filter(Boolean).join(" ")}</p>
          {selected.next_at && (
            <p className="text-sm font-bold">Prossimo torneo: {dateFmt.format(new Date(selected.next_at))}</p>
          )}
          <Link href={`/negozi/${selected.slug}`} className="brutal-btn mt-2 w-full">
            Apri la pagina del negozio
          </Link>
        </section>
      )}

      {shops.length === 0 ? (
        <div className="brutal-card p-4">
          <p className="font-bold">Nessun negozio sulla mappa</p>
          <p className="text-sm">I negozi compaiono quando il gestore ne imposta la posizione.</p>
        </div>
      ) : (
        <section className="space-y-2">
          <h2 className="font-black uppercase">{user ? "Più vicini a te" : "Negozi"}</h2>
          <ul className="space-y-2">
            {list.map(({ shop, km }) => (
              <li key={shop.id}>
                <button
                  type="button"
                  onClick={() => focusShop(shop)}
                  className="brutal-card flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-black">{shop.name}</span>
                    <span className="block truncate text-sm">
                      {[shop.city, shop.province].filter(Boolean).join(" ")}
                    </span>
                  </span>
                  {km !== null && (
                    <span className="shrink-0 border-2 border-ink bg-brand-yellow px-2 py-1 text-xs font-black">
                      {formatKm(km)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
