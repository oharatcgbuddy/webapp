"use client";

import { useRef, useState } from "react";
import type { AddressSuggestion } from "@/app/api/indirizzi/route";

// Campo "Indirizzo" con suggerimenti da OpenStreetMap mentre si scrive. Scegliendone uno si compilano
// anche città e provincia e si sposta il segnaposto sulla mappa (lo decide il form tramite onPick).
export function AddressSearch({
  value,
  onChange,
  onPick,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: AddressSuggestion) => void;
  className: string;
}) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abort = useRef<AbortController>(undefined);

  function handle(v: string) {
    onChange(v);
    clearTimeout(timer.current);
    abort.current?.abort();
    if (v.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    // Attesa breve dopo l'ultimo tasto: poche richieste e niente raffica al servizio.
    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      abort.current = ac;
      try {
        const res = await fetch(`/api/indirizzi?q=${encodeURIComponent(v.trim())}`, { signal: ac.signal });
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          setItems(data as AddressSuggestion[]);
          setOpen(data.length > 0);
        }
      } catch {
        // richiesta annullata o rete assente: si può sempre scrivere l'indirizzo a mano
      }
    }, 350);
  }

  function pick(s: AddressSuggestion) {
    onPick(s);
    setOpen(false);
    setItems([]);
  }

  return (
    <div className="relative">
      <input
        name="address"
        maxLength={120}
        value={value}
        autoComplete="off"
        onChange={(e) => handle(e.target.value)}
        onFocus={() => setOpen(items.length > 0)}
        onBlur={() => setOpen(false)}
        className={className}
      />
      {open && (
        <ul
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto border-[3px] border-ink bg-white shadow-brutal"
        >
          {items.map((s, i) => (
            <li key={`${s.lat},${s.lng},${i}`}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="block w-full border-b-2 border-ink px-3 py-2 text-left text-sm font-bold normal-case last:border-b-0 hover:bg-brand-yellow"
              >
                {s.label}
                {s.province && <span className="font-medium"> ({s.province})</span>}
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[11px]">Suggerimenti © OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  );
}
