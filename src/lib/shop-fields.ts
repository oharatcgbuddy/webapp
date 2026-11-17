// Lettura e validazione dei campi del negozio da un form: la stessa regola per il gestore che modifica
// la propria pagina e per l'admin che crea un negozio.

export type ParsedShop = {
  name: string;
  city: string;
  province: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  website: string | null;
  social: Record<string, string>;
  lat: number | null;
  lng: number | null;
};

function text(fd: FormData, key: string, max: number) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function normalizeUrl(raw: string): string | null | "invalid" {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export function parseShopFields(fd: FormData): { error: string } | { values: ParsedShop } {
  const name = text(fd, "name", 80);
  const city = text(fd, "city", 60);
  const province = text(fd, "province", 2).toUpperCase();
  if (!/[a-z0-9]/i.test(name)) return { error: "Inserisci il nome del negozio." };
  if (!city) return { error: "Inserisci la città." };
  if (!/^[A-Z]{2}$/.test(province)) return { error: "La provincia deve essere di 2 lettere (es. MI)." };

  const website = normalizeUrl(text(fd, "website", 200));
  if (website === "invalid") return { error: "Il sito web non è valido." };
  const social: Record<string, string> = {};
  for (const key of ["instagram", "facebook", "discord"] as const) {
    const url = normalizeUrl(text(fd, key, 200));
    if (url === "invalid") return { error: `Il link ${key} non è valido.` };
    if (url) social[key] = url;
  }

  // Posizione: o entrambe le coordinate o nessuna.
  const latRaw = text(fd, "lat", 20);
  const lngRaw = text(fd, "lng", 20);
  let lat: number | null = null;
  let lng: number | null = null;
  if (latRaw || lngRaw) {
    lat = Number(latRaw);
    lng = Number(lngRaw);
    if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { error: "La posizione sulla mappa non è valida." };
    }
    lat = Math.round(lat * 1e5) / 1e5;
    lng = Math.round(lng * 1e5) / 1e5;
  }

  return {
    values: {
      name,
      city,
      province,
      address: text(fd, "address", 120) || null,
      phone: text(fd, "phone", 30) || null,
      description: text(fd, "description", 1000) || null,
      website,
      social,
      lat,
      lng,
    },
  };
}
