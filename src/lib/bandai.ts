// Link a un evento di BANDAI TCG+. Si estrae solo l'ID numerico: nessuna richiesta verso Bandai,
// e tutto il resto dell'URL (filtri, postcode, indirizzo, preferiti…) viene scartato.

export const BANDAI_SOURCE = "bandai_tcg_plus" as const;

const BANDAI_HOSTS = new Set(["www.bandai-tcg-plus.com", "bandai-tcg-plus.com"]);
const EVENT_PATH = /^\/event\/(\d{1,18})\/?$/;

export type BandaiEvent = { id: string; url: string };

// Restituisce null se il testo non è un link a un evento Bandai TCG+.
export function parseBandaiEventLink(raw: string): BandaiEvent | null {
  const value = raw.trim();
  if (!value || value.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !BANDAI_HOSTS.has(url.hostname)) return null;
  const m = EVENT_PATH.exec(url.pathname);
  if (!m) return null;
  return { id: m[1], url: bandaiEventUrl(m[1]) };
}

export function bandaiEventUrl(id: string): string {
  return `https://www.bandai-tcg-plus.com/event/${id}`;
}

export const BANDAI_LINK_ERROR =
  "Il link non è valido: incolla l'indirizzo della pagina dell'evento su BANDAI TCG+ (es. https://www.bandai-tcg-plus.com/event/1234567).";
