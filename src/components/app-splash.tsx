"use client";

import { useEffect, useState } from "react";

// Schermata di caricamento della PWA: compare solo quando l'app è aperta dall'icona (display-mode: standalone,
// vedi globals.css) e copre la pagina finché l'app non è pronta, poi svanisce. Ha lo stesso aspetto
// dell'immagine di avvio di iOS (public/splash), così il passaggio non si nota. Il testo HTML arriva già dal
// server: copre la pagina subito, prima ancora che il JavaScript sia pronto. Senza JavaScript, una regola CSS
// la fa sparire da sola dopo qualche secondo.
export function AppSplash() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), 350); // si resta un attimo a vista: niente lampi
    const t2 = setTimeout(() => setGone(true), 800); // dopo la dissolvenza si toglie dalla pagina
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
    </div>
  );
}
