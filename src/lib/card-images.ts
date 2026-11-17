// Indirizzi delle immagini di carte e leader, in un bucket pubblico di Supabase Storage.
// Nel database si salva solo il percorso senza estensione (es. "leaders/OP01-001"); i file sono due
// WebP già ridimensionati: "<percorso>.webp" (480 px) e "<percorso>.thumb.webp" (160 px).
// Le immagini si servono direttamente da Supabase (senza l'ottimizzatore di Next/Vercel).

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/card-images`;

export type CardImageSize = "thumb" | "full";

export function cardImageUrl(path: string | null | undefined, size: CardImageSize): string | null {
  if (!path || !/^[A-Za-z0-9_./-]{1,100}$/.test(path) || path.includes("..")) return null;
  return `${BASE}/${path}${size === "thumb" ? ".thumb" : ""}.webp`;
}

// Proporzioni delle carte One Piece (63 × 88 mm), per riservare lo spazio prima del caricamento.
export const CARD_RATIO = { width: 160, height: 224 } as const;
