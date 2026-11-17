"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Tornei", color: "bg-brand-yellow" },
  { href: "/mappa", label: "Mappa", color: "bg-brand-blue" },
  { href: "/risultati", label: "Risultati", color: "bg-brand-green" },
  { href: "/profilo", label: "Profilo", color: "bg-brand-pink" },
];

export function TabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t-[3px] border-ink bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="border-r-[3px] border-ink last:border-r-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block px-1 py-4 text-center text-sm font-bold ${
                  active ? tab.color : ""
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
