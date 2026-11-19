// Parte comune degli script che leggono gli eventi di BANDAI TCG+ (bandai-events.mjs e sync-bandai-events.mjs).
// Apre un Chrome vero con un profilo dedicato (login fatto da te una volta sola) e fa le richieste d'elenco
// con gli stessi header che usa il sito, da Node con i cookie di quel profilo. Una richiesta ogni ~2 secondi.
//
// Requisito: npm i --no-save playwright-core   (serve Google Chrome installato)

import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

export const SITE = "https://www.bandai-tcg-plus.com";
const API_LIST = "https://api.bandai-tcg-plus.com/api/user/event/list";
const PAGE_SIZE = 20;
const MAX_PAGES = 50; // freno di sicurezza per ogni organizzatore
export const DELAY_MS = 2000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Apre il browser, aspetta che tu faccia login e carichi l'elenco eventi, e restituisce la sessione.
export async function openBandai({ game } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("Manca playwright-core. Installalo con:  npm i --no-save playwright-core");
  }

  const profile = path.join(os.homedir(), ".tcg-buddy-bandai-profile");
  const ctx = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, viewport: null });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  // Si copiano gli header della prima richiesta d'elenco fatta dal sito stesso.
  let seenHeaders = null;
  page.on("request", (req) => {
    if (!seenHeaders && req.url().startsWith(API_LIST)) seenHeaders = req.headers();
  });

  await page.goto(`${SITE}/event`, { waitUntil: "domcontentloaded" });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("\nFai il login se serve, scegli il gioco (One Piece) e fai caricare l'elenco eventi.\nQuando lo vedi, premi Invio qui... ");
  rl.close();

  if (!seenHeaders) {
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1500);
  }
  if (!seenHeaders) throw new Error("Non ho visto nessuna richiesta all'elenco eventi: apri la pagina Eventi di TCG+ e riprova.");

  const gameTitleId = game ?? (await page.evaluate(() => localStorage.getItem("gameTitleId")));
  if (!gameTitleId) throw new Error("Gioco non selezionato: scegli One Piece sul sito oppure passa --game <id>.");

  const headers = Object.fromEntries(Object.entries(seenHeaders).filter(([k]) => !/^(host|content-length|connection|cookie|accept-encoding|:.*)$/i.test(k)));
  return { ctx, headers, gameTitleId, close: () => ctx.close() };
}

async function fetchPage(session, extra, offset, { from, to }) {
  const params = { game_title_id: session.gameTitleId, limit: PAGE_SIZE, offset, order: 1, ...extra };
  if (from) params.start_date = from;
  if (to) params.end_date = to;
  const url = `${API_LIST}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
  const res = await session.ctx.request.get(url, { headers: session.headers, timeout: 30_000 });
  if (!res.ok()) throw new Error(`API Bandai: HTTP ${res.status()} (sessione scaduta? rilancia lo script)`);
  return (await res.json()).success;
}

// Tutti gli eventi che l'API restituisce per un filtro (es. { organizer_id: "5823" } o { keyword: "…" }).
export async function fetchEvents(session, extra, { from, to, onPage } = {}) {
  const byId = new Map();
  let total = 0;
  for (let p = 0; p < MAX_PAGES; p++) {
    const data = await fetchPage(session, extra, p * PAGE_SIZE, { from, to });
    const list = data.event_list ?? [];
    total = Number(data.total ?? 0);
    onPage?.(p + 1, list.length, total);
    for (const e of list) {
      const n = normalize(e);
      if (n.external_id) byId.set(n.external_id, n);
    }
    if (list.length < PAGE_SIZE || (p + 1) * PAGE_SIZE >= total) break;
    await sleep(DELAY_MS);
  }
  return { total, events: [...byId.values()].sort((a, b) => String(a.starts_at_local).localeCompare(String(b.starts_at_local))) };
}

// Orario locale del luogo ("2026-12-30T21:00:00" + "Europe/Rome") → istante UTC in formato ISO.
export function localToUtcIso(local, timeZone = "Europe/Rome") {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const wanted = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const asLocal = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  };
  let guess = wanted;
  for (let i = 0; i < 3; i++) guess = wanted - (asLocal(guess) - guess);
  return new Date(guess).toISOString();
}

// Dall'oggetto evento dell'API ai campi che interessano a TCG Buddy (il grezzo resta in `raw`).
export function normalize(e) {
  const id = String(e.id ?? e.event_id ?? "");
  const fee = e.entryFee != null && e.entryFee !== "" ? Number(e.entryFee) : null; // es. "10.000" = 10 €
  const timezone = e.timezone ?? "Europe/Rome";
  return {
    external_source: "bandai_tcg_plus",
    external_id: id,
    url: `${SITE}/event/${id}`,
    title: e.event_series_title || e.title || null,
    organizer_id: e.organizer_id != null ? String(e.organizer_id) : null,
    organizer_name: e.organizer_name ?? null,
    // L'orario di Bandai è quello locale del luogo, senza offset: `starts_at` è lo stesso istante in UTC.
    starts_at_local: e.start_datetime ?? null,
    starts_at: localToUtcIso(e.start_datetime, timezone),
    timezone,
    country: e.country_code ?? null,
    city: e.city_code ?? null,
    province: e.pref_code ?? null,
    postcode: e.postcode ?? null,
    address: e.street_address ?? null,
    lat: e.event_place_geo?.x ?? null,
    lng: e.event_place_geo?.y ?? null,
    phone: e.phone_number || null,
    website: e.organizer_url || null,
    entry_fee: Number.isFinite(fee) ? fee : null,
    entry_fee_currency: e.entry_fee_currency_code ?? null,
    max_players: e.is_capacity_hidden ? null : (e.max_join_count ?? null),
    canceled: Boolean(e.is_canceled),
    online: String(e.online_flag) === "1",
    conditions: e.participation_condition_by_admin || null,
    excerpt: e.excerpt || null,
    raw: e,
  };
}
