// Giochi gestiti dall'app. Ogni gioco ha la sua cartella di pagine (src/app/<slug>/…) e lo stesso
// identificativo vale per: percorso delle pagine, schema del database, `tcgs.slug` e percorso delle
// immagini nel bucket. Per aggiungere un gioco: nuova cartella di pagine + una riga qui + una riga
// nella tabella `tcgs`.

export const TCGS = [
  {
    slug: "onepiece",
    name: "One Piece",
    description: "Tornei, tracker round per round e risultati.",
  },
] as const;

export type TcgSlug = (typeof TCGS)[number]["slug"];

export const DEFAULT_TCG: TcgSlug = TCGS[0].slug;

export function isTcgSlug(value: string | null | undefined): value is TcgSlug {
  return TCGS.some((t) => t.slug === value);
}

// Il gioco indicato dal primo segmento del percorso ("/onepiece/risultati" → "onepiece"), se c'è.
export function tcgFromPath(pathname: string): TcgSlug | null {
  const first = pathname.split("/")[1];
  return isTcgSlug(first) ? first : null;
}
