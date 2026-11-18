"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_TCG, isTcgSlug, tcgFromPath, type TcgSlug } from "@/lib/tcgs";

const STORAGE_KEY = "tcg";
const noopSubscribe = () => () => {};

// Ultimo gioco usato: serve nelle pagine comuni (Mappa, Profilo…) dove l'indirizzo non indica il gioco.
function readStoredTcg(): TcgSlug | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTcgSlug(value) ? value : null;
  } catch {
    return null;
  }
}

export function TabBar() {
  const pathname = usePathname();
  const stored = useSyncExternalStore(noopSubscribe, readStoredTcg, () => null);
  const inTcg = tcgFromPath(pathname);
  const tcg = inTcg ?? stored ?? DEFAULT_TCG;

  useEffect(() => {
    if (!inTcg) return;
    try {
      localStorage.setItem(STORAGE_KEY, inTcg);
    } catch {
      // Memoria del browser non disponibile: si userà il gioco predefinito.
    }
  }, [inTcg]);

  if (pathname.startsWith("/login")) return null;

  const base = `/${tcg}`;
  const tabs = [
    {
      href: base,
      label: "Tornei",
      color: "bg-brand-yellow",
      active: pathname === base || pathname.startsWith(`${base}/tornei`),
    },
    { href: "/mappa", label: "Mappa", color: "bg-brand-blue", active: pathname.startsWith("/mappa") },
    {
      href: `${base}/risultati`,
      label: "Risultati",
      color: "bg-brand-green",
      active: pathname.startsWith(`${base}/risultati`),
    },
    {
      href: `${base}/mazzi`,
      label: "Mazzi",
      color: "bg-brand-red",
      active: pathname.startsWith(`${base}/mazzi`),
    },
    { href: "/profilo", label: "Profilo", color: "bg-brand-pink", active: pathname.startsWith("/profilo") },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => (
          <li key={tab.label} className="border-b-[3px] border-r-[3px] border-ink last:border-r-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`block px-0.5 py-4 text-center text-[13px] font-bold ${tab.active ? tab.color : ""}`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
