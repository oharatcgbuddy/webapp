import { provinceCode } from "@/lib/it-provinces";

// GET /api/indirizzi?q=via roma 10 torino
// Cerca un indirizzo italiano su OpenStreetMap tramite Photon (ricerca pensata per il completamento mentre si scrive).
// Passa dal nostro server: il browser non contatta terzi e il fornitore si può cambiare qui senza toccare l'app.
// Il proxy impedisce già l'accesso senza login. Uso leggero (gestori che compilano il negozio): per un traffico
// alto conviene un fornitore con chiave o un'istanza propria di Photon.

const PHOTON = "https://photon.komoot.io/api/";
const ITALY_BBOX = "6.6,35.4,18.8,47.2"; // ovest,sud,est,nord

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

export type AddressSuggestion = {
  label: string;
  address: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, max-age=300" } });

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 3) return json([]);

  try {
    const res = await fetch(`${PHOTON}?${new URLSearchParams({ q, limit: "8", bbox: ITALY_BBOX })}`, {
      headers: { "User-Agent": "OharaTCGBuddy/1.0" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return json({ error: "Ricerca non disponibile." }, 502);
    const data = (await res.json()) as { features?: Feature[] };

    const out: AddressSuggestion[] = [];
    for (const f of data.features ?? []) {
      const p = f.properties;
      if (p.countrycode !== "IT") continue;
      const street = p.street ?? (p.name && !p.housenumber ? p.name : undefined);
      const place = p.city ?? p.town ?? p.village ?? p.locality ?? p.name;
      if (!street && !place) continue;
      const address = [street, p.housenumber].filter(Boolean).join(" ");
      const city = p.city ?? p.town ?? p.village ?? (street ? "" : (p.name ?? ""));
      const province = provinceCode(p.county) ?? "";
      const [lng, lat] = f.geometry.coordinates;
      out.push({
        label: [address, p.postcode, city].filter(Boolean).join(", ") || (p.name ?? ""),
        address,
        city,
        province,
        lat: Math.round(lat * 1e5) / 1e5,
        lng: Math.round(lng * 1e5) / 1e5,
      });
      if (out.length === 6) break;
    }
    return json(out);
  } catch {
    return json({ error: "Ricerca non disponibile." }, 502);
  }
}
