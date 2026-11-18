"use client";

import { useEffect, useState } from "react";

// Pagina di caricamento della PWA: compare solo quando l'app è aperta dall'icona (display-mode: standalone,
// vedi globals.css) e copre la pagina finché l'app non è pronta, poi svanisce. Il logo sta fermo nello stesso
// punto dell'immagine di avvio di iOS (public/splash), così il passaggio non si nota; sotto, una barra di
// avanzamento e la scritta "Caricamento…". Resta a vista almeno un attimo (MIN_MS), così si legge come una
// pagina di caricamento e non come un lampo. Il testo HTML arriva già dal server: copre la pagina subito,
// prima ancora che il JavaScript sia pronto. Senza JavaScript, una regola CSS la fa sparire da sola dopo 4 secondi.
const MIN_MS = 900;

export function AppSplash() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), MIN_MS);
    const t2 = setTimeout(() => setGone(true), MIN_MS + 450); // dopo la dissolvenza si toglie dalla pagina
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div className="app-splash" data-hide={hide} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" width={260} height={260} />
      <div className="splash-bar" />
      <p className="splash-label">Caricamento…</p>
    </div>
  );
}
