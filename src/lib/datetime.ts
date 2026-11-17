// Gli orari dei tornei si inseriscono e si mostrano in ora italiana, a prescindere dal fuso del server.
const TZ = "Europe/Rome";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function romeParts(date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

// ISO (UTC) -> "YYYY-MM-DDTHH:mm" in ora italiana, per <input type="datetime-local">.
export function isoToRomeLocal(iso: string): string {
  const p = romeParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// "YYYY-MM-DDTHH:mm" in ora italiana -> ISO (UTC). null se non valido o inesistente.
export function romeLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);

  // Due passate: la seconda assorbe il cambio di offset a cavallo dell'ora legale.
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = romeParts(new Date(guess));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess -= shown - wanted;
  }

  const date = new Date(guess);
  if (Number.isNaN(date.getTime())) return null;
  // Scarta date inesistenti (es. 31 febbraio) e orari saltati dal cambio d'ora.
  return isoToRomeLocal(date.toISOString()) === local ? date.toISOString() : null;
}
