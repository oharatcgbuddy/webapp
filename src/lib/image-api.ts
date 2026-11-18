// Client del servizio immagini (FastAPI, cartella services/image-api). Si chiama solo dal server:
// la chiave condivisa non deve mai arrivare al browser.
//
// Variabili d'ambiente (non pubbliche):
//   IMAGE_API_URL  es. https://immagini.example.com (senza / finale)
//   IMAGE_API_KEY  la stessa del servizio (almeno 24 caratteri)

export type ImageFormat = "libero" | "storia" | "post";

export const IMAGE_FORMATS: Record<ImageFormat, { api: "full" | "story" | "post"; label: string; file: string }> = {
  post: { api: "post", label: "Post Instagram (4:5)", file: "post" },
  storia: { api: "story", label: "Storia (9:16)", file: "storia" },
  libero: { api: "full", label: "Immagine intera", file: "intera" },
};

export function parseFormat(v: string | null): ImageFormat {
  return v === "storia" || v === "libero" ? v : "post";
}

export type ImageCard = {
  code: string;
  qty: number;
  name: string | null;
  cost: number | null;
  type: string | null;
  colors: string[];
  counter: number | null;
  image_path: string | null;
};

export type ImageMatchup = {
  round: number | null;
  opponent_code: string | null;
  opponent_name: string | null;
  opponent_colors: string[];
  opponent_image_path: string | null;
  dice_won: boolean | null;
  result: "win" | "loss" | "bye";
};

export type ImageBody = {
  kind: "deck" | "result";
  title: string;
  leader: { code: string; name: string; colors: string[]; image_path: string | null };
  cards: ImageCard[];
  result_label?: string | null;
  result_winner?: boolean;
  placement_text?: string | null;
  tournament?: string | null;
  date?: string | null;
  shop?: { name: string; logo_path: string | null } | null;
  matchups?: ImageMatchup[];
};

export type RenderOutcome = { ok: true; png: ArrayBuffer } | { ok: false; error: string };

export async function renderImage(body: ImageBody, format: ImageFormat): Promise<RenderOutcome> {
  const base = process.env.IMAGE_API_URL?.replace(/\/$/, "");
  const key = process.env.IMAGE_API_KEY;
  if (!base || !key) return { ok: false, error: "Il servizio delle immagini non è ancora configurato." };

  try {
    const res = await fetch(`${base}/render`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ ...body, format: IMAGE_FORMATS[format].api }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, error: "Il servizio delle immagini non ha risposto bene. Riprova tra poco." };
    return { ok: true, png: await res.arrayBuffer() };
  } catch {
    return { ok: false, error: "Il servizio delle immagini non è raggiungibile. Riprova tra poco." };
  }
}
