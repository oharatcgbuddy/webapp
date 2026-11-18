"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ITALY_CENTER, MAP_STYLE, type LatLng } from "@/lib/geo";

function parse(lat: string, lng: string): LatLng | null {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== "" && lng !== "" && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

// Il gestore tocca la mappa (o trascina il segnaposto) per indicare dove si trova il negozio.
export function LocationPicker({
  initialLat,
  initialLng,
  target = null,
}: {
  initialLat: string;
  initialLng: string;
  // Posizione scelta da un suggerimento di indirizzo: sposta segnaposto e mappa (n cambia a ogni scelta).
  target?: { lat: number; lng: number; n: number } | null;
}) {
  const start = useMemo(() => parse(initialLat, initialLng), [initialLat, initialLng]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);

  const [pos, setPos] = useState<LatLng | null>(start);
  const [error, setError] = useState<string | null>(null);

  function place(p: LatLng) {
    const lib = libRef.current;
    const map = mapRef.current;
    if (!lib || !map) return;
    const rounded = { lat: round(p.lat), lng: round(p.lng) };
    if (markerRef.current) {
      markerRef.current.setLngLat([rounded.lng, rounded.lat]);
    } else {
      const marker = new lib.Marker({ draggable: true, color: "#ff5a5f" })
        .setLngLat([rounded.lng, rounded.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        setPos({ lat: round(ll.lat), lng: round(ll.lng) });
      });
      markerRef.current = marker;
    }
    setPos(rounded);
  }

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      libRef.current = maplibre;
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

      map = new maplibre.Map({
        container: container.current,
        style: MAP_STYLE,
        center: start ? [start.lng, start.lat] : ITALY_CENTER,
        zoom: start ? 15 : 5,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (e) => place({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      if (start) place(start);
    })();

    return () => {
      cancelled = true;
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [start]);

  // Un suggerimento di indirizzo scelto nel form sposta il segnaposto e centra la mappa.
  useEffect(() => {
    if (!target) return;
    place({ lat: target.lat, lng: target.lng });
    mapRef.current?.flyTo({ center: [target.lng, target.lat], zoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si reagisce solo a una nuova scelta (target.n)
  }, [target?.n]);

  function useMyPosition() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Il tuo browser non supporta la geolocalizzazione.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        place(p);
        mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 16 });
      },
      () => setError("Non riesco a leggere la tua posizione. Controlla i permessi del browser."),
      { timeout: 10000 },
    );
  }

  function clear() {
    markerRef.current?.remove();
    markerRef.current = null;
    setPos(null);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-bold uppercase">Posizione sulla mappa</span>
      <div
        ref={container}
        role="region"
        aria-label="Mappa per scegliere la posizione del negozio"
        className="h-64 w-full border-[3px] border-ink"
      />
      <input type="hidden" name="lat" value={pos ? pos.lat : ""} />
      <input type="hidden" name="lng" value={pos ? pos.lng : ""} />
      <p className="text-xs">
        {pos ? "Posizione impostata. Trascina il segnaposto per affinarla." : "Tocca la mappa per posizionare il negozio."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={useMyPosition} className="brutal-btn flex-1 bg-white text-sm">
          📍 Sono nel negozio
        </button>
        {pos && (
          <button type="button" onClick={clear} className="brutal-btn bg-white text-sm">
            Rimuovi
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-2 text-sm font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
