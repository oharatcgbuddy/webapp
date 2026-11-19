// Sincronizza nel database i tornei di BANDAI TCG+ dei locali che hanno un ID organizzatore (tabella shop_external_ids,
// che il gestore compila dal modulo del proprio negozio).
// Da lanciare A MANO dal proprio PC (serve il login a TCG+ in Chrome, vedi bandai-events-lib.mjs).
//
// Uso (la chiave di servizio si passa solo da riga di comando: non va scritta in nessun file):
//   SUPABASE_URL=https://<progetto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chiave> \
//     node scripts/sync-bandai-events.mjs [--link slug=ID …] [--add ID …] [--go]
//
// Senza --go è una PROVA: scarica gli eventi, controlla tutto, mostra cosa farebbe e non scrive niente.
// Lo stesso comando vale per dev e prod: cambiano solo URL e chiave.
//
// Opzioni:
//   --link slug=ID      collega un locale già nel database al suo organizer_id di TCG+ (si può ripetere; di norma lo
//                       scrive il gestore nel proprio modulo)
//   --add ID            crea il locale partendo dai dati dei suoi eventi su TCG+ (si può ripetere)
//   --only ID           sincronizza solo questo organizer_id (si può ripetere); senza, tutti i locali collegati
//   --from AAAA-MM-GG   scarica solo gli eventi da questa data
//   --shop-status       stato dei locali creati con --add: approved (predefinito) o pending
//   --with-phone        copia anche il telefono pubblicato su TCG+ nella scheda del locale (predefinito: no)
//   --game <id>         id del gioco su TCG+ (predefinito: quello scelto sul sito)
//
// Per ogni evento:
//   - non esiste ancora            → si crea il torneo del locale;
//   - esiste come torneo "della comunità" (creato da un giocatore con il link) → lo si riscatta per il locale,
//     con la riga in tournament_claims, così i risultati già registrati restano collegati;
//   - esiste ed è dello stesso locale → si aggiornano solo data, quota, posti e annullamento;
//     titolo, note, premi e formato modificati dal gestore non si toccano;
//   - esiste ed è di un altro locale → saltato, con avviso.
// Gli eventi che spariscono da TCG+ non vengono cancellati.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DELAY_MS, fetchEvents, openBandai, sleep } from "./bandai-events-lib.mjs";

const SOURCE = "bandai_tcg_plus";

function parseArgs(argv) {
  const o = { go: false, link: [], add: [], only: [], from: null, shopStatus: "approved", withPhone: false, game: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--go") o.go = true;
    else if (a === "--link") o.link.push(v());
    else if (a === "--add") o.add.push(v());
    else if (a === "--only") o.only.push(v());
    else if (a === "--from") o.from = v();
    else if (a === "--shop-status") o.shopStatus = v();
    else if (a === "--with-phone") o.withPhone = true;
    else if (a === "--game") o.game = v();
    else throw new Error(`Argomento sconosciuto: ${a}`);
  }
  const isId = (s) => /^\d{1,12}$/.test(s ?? "");
  for (const id of [...o.add, ...o.only]) if (!isId(id)) throw new Error(`organizer_id non valido: ${id}`);
  for (const l of o.link) {
    const [slug, id] = (l ?? "").split("=");
    if (!slug || !isId(id)) throw new Error(`--link va scritto slug=ID (ricevuto: ${l})`);
  }
  if (!["approved", "pending"].includes(o.shopStatus)) throw new Error("--shop-status: approved oppure pending.");
  if (o.from && !/^\d{4}-\d{2}-\d{2}$/.test(o.from)) throw new Error("--from va scritto AAAA-MM-GG.");
  return o;
}

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const mostCommon = (values) => {
  const count = new Map();
  for (const v of values.filter(Boolean)) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// Dati del locale ricavati dai suoi eventi su TCG+. Restituisce { shop } oppure { error }.
function shopFromEvents(events, { withPhone, status }) {
  const e = events[0];
  const name = (e.organizer_name ?? "").trim();
  if (!name || !/[A-Za-z0-9]/.test(name) || name.length > 80) return { error: `nome non valido (${JSON.stringify(e.organizer_name)})` };
  if (events.some((x) => x.country && x.country !== "IT")) return { error: `locale fuori dall'Italia (${mostCommon(events.map((x) => x.country))})` };
  const city = mostCommon(events.map((x) => x.city?.trim()));
  if (!city || city.length > 60) return { error: "città mancante o troppo lunga" };
  const prov = /^IT-([A-Z]{2})$/.exec(mostCommon(events.map((x) => x.province)) ?? "")?.[1];
  if (!prov) return { error: "provincia non riconosciuta" };
  const address = mostCommon(events.map((x) => x.address?.trim()));
  const atAddress = events.find((x) => x.address?.trim() === address && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  const website = events.map((x) => x.website).find((u) => /^https:\/\/\S{3,190}$/.test(u ?? "")) ?? null;
  return {
    shop: {
      slug: `${slugify(name) || "locale"}-${randomUUID().slice(0, 6)}`,
      name,
      address: address || null,
      city,
      province: prov,
      lat: atAddress?.lat ?? null,
      lng: atAddress?.lng ?? null,
      phone: withPhone ? (events.map((x) => x.phone).find(Boolean) ?? null) : null,
      website,
      status,
    },
  };
}

// Campi del torneo che vengono da TCG+.
function tournamentFields(ev, now) {
  const startsAt = ev.starts_at;
  const cents = ev.entry_fee != null && ev.entry_fee_currency === "€" ? Math.round(ev.entry_fee * 100) : null;
  const status = ev.canceled ? "cancelled" : new Date(startsAt).getTime() < now ? "completed" : "scheduled";
  return {
    title: (ev.title ?? "").trim().slice(0, 80),
    starts_at: startsAt,
    entry_fee_cents: cents != null && cents >= 0 ? cents : null,
    max_players: Number.isInteger(ev.max_players) && ev.max_players > 0 ? ev.max_players : null,
    status,
    notes: [ev.excerpt, ev.conditions].filter(Boolean).join("\n\n").slice(0, 1000) || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (anche per la prova: si legge dal database).");
  const db = createClient(url, key, { auth: { persistSession: false } });
  console.log(`${args.go ? "SCRITTURA" : "PROVA (non scrive niente)"} su ${new URL(url).host}\n`);

  const tcg = must(await db.from("tcgs").select("id").eq("slug", "onepiece").single(), "tcgs");

  // 1. Collegamenti locale ↔ organizer_id (tabella shop_external_ids: li scrive il gestore dal proprio modulo
  //    oppure questo script con --link / --add).
  const shops = must(await db.from("shops").select("id, slug, name, status"), "shops");
  const links = must(await db.from("shop_external_ids").select("shop_id, external_id").eq("source", SOURCE), "shop_external_ids");
  const orgOfShop = new Map(links.map((x) => [x.shop_id, x.external_id]));
  const shopOfOrg = new Map(links.map((x) => [x.external_id, x.shop_id]));
  for (const l of args.link) {
    const [slug, id] = l.split("=");
    const shop = shops.find((s) => s.slug === slug);
    if (!shop) throw new Error(`--link: nessun locale con slug "${slug}"`);
    const otherId = shopOfOrg.get(id);
    if (otherId && otherId !== shop.id) throw new Error(`--link: l'organizer ${id} è già di "${shops.find((s) => s.id === otherId)?.slug}"`);
    const current = orgOfShop.get(shop.id);
    if (current && current !== id) throw new Error(`--link: "${slug}" ha già l'organizer ${current}`);
    console.log(`collega  ${slug} → organizer ${id}${current === id ? " (già collegato)" : ""}`);
    if (args.go && current !== id) must(await db.from("shop_external_ids").insert({ shop_id: shop.id, source: SOURCE, external_id: id }), `collegamento ${slug}`);
    orgOfShop.set(shop.id, id);
    shopOfOrg.set(id, shop.id);
  }

  // 2. Organizzatori da sincronizzare: i locali collegati + quelli da creare con --add.
  const targets = new Map(); // organizer_id → { shop | null }
  for (const [id, shopId] of shopOfOrg) targets.set(id, { shop: shops.find((s) => s.id === shopId) });
  for (const id of args.add) if (!targets.has(id)) targets.set(id, { shop: null });
  const wanted = args.only.length ? args.only : [...targets.keys()];
  for (const id of wanted) if (!targets.has(id)) throw new Error(`--only ${id}: nessun locale collegato e non è in --add`);
  if (!wanted.length) {
    console.log("Nessun locale collegato a TCG+: usa --link slug=ID oppure --add ID.");
    return;
  }

  // 3. Eventi da TCG+.
  const session = await openBandai({ game: args.game });
  const fetched = new Map();
  try {
    for (const id of wanted) {
      const { total, events } = await fetchEvents(session, { organizer_id: id }, { from: args.from });
      console.log(`organizer ${id}: ${total} eventi su TCG+`);
      fetched.set(id, events);
      await sleep(DELAY_MS);
    }
  } finally {
    await session.close();
  }

  // 4. Locali nuovi.
  const now = Date.now();
  for (const id of wanted) {
    const t = targets.get(id);
    if (t.shop) {
      const org = fetched.get(id)?.[0]?.organizer_name;
      const norm = (x) => (x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (org && !norm(t.shop.name).includes(norm(org)) && !norm(org).includes(norm(t.shop.name))) {
        console.log(`\nATTENZIONE  organizer ${id}: su TCG+ si chiama "${org}", il locale qui è "${t.shop.name}". Controlla che l'ID sia suo.`);
      }
      continue;
    }
    const events = fetched.get(id);
    if (!events.length) {
      console.log(`\nSALTATO  organizer ${id}: nessun evento, non so con che dati creare il locale`);
      t.skip = true;
      continue;
    }
    const r = shopFromEvents(events, { withPhone: args.withPhone, status: args.shopStatus });
    if (r.error) {
      console.log(`\nSALTATO  organizer ${id}: ${r.error}`);
      t.skip = true;
      continue;
    }
    console.log(`\nNUOVO LOCALE  ${r.shop.name} — ${r.shop.address ?? "?"}, ${r.shop.city} (${r.shop.province}) · ${r.shop.status} · slug ${r.shop.slug}`);
    if (args.go) {
      const row = must(await db.from("shops").insert(r.shop).select("id, slug, name, status").single(), "creazione locale");
      must(await db.from("shop_external_ids").insert({ shop_id: row.id, source: SOURCE, external_id: id }), "collegamento del nuovo locale");
      t.shop = row;
    } else {
      t.shop = { id: null, slug: r.shop.slug, name: r.shop.name, status: r.shop.status };
    }
  }

  // 5. Tornei.
  const all = [];
  for (const id of wanted) {
    const t = targets.get(id);
    if (t.skip) continue;
    for (const ev of fetched.get(id)) all.push({ ev, shop: t.shop });
  }
  const existing = new Map();
  const ids = all.map((x) => x.ev.external_id);
  for (let i = 0; i < ids.length; i += 100) {
    const rows = must(
      await db.from("tournaments").select("id, shop_id, title, starts_at, entry_fee_cents, max_players, status, created_by, external_id").eq("external_source", SOURCE).in("external_id", ids.slice(i, i + 100)),
      "tornei esistenti",
    );
    for (const r of rows) existing.set(r.external_id, r);
  }

  const counts = { insert: 0, claim: 0, update: 0, same: 0, other: 0, invalid: 0 };
  const inserts = [];
  for (const { ev, shop } of all) {
    const f = tournamentFields(ev, now);
    const label = `${ev.starts_at_local?.slice(0, 16).replace("T", " ")}  ${f.title}`;
    if (!f.title || !f.starts_at) {
      counts.invalid++;
      console.log(`  ?? saltato (dati mancanti)  ${ev.external_id}`);
      continue;
    }
    const cur = existing.get(ev.external_id);
    if (!cur) {
      counts.insert++;
      console.log(`  + nuovo      ${label}`);
      inserts.push({ ...f, shop_id: shop.id, tcg_id: tcg.id, external_source: SOURCE, external_id: ev.external_id });
    } else if (cur.shop_id === null) {
      counts.claim++;
      console.log(`  ↑ riscatto   ${label}  (era "${cur.title}")`);
      if (args.go) {
        must(await db.from("tournament_claims").insert({ tournament_id: cur.id, shop_id: shop.id, claimed_by: null, previous_created_by: cur.created_by, previous_title: cur.title }), "registro riscatti");
        must(await db.from("tournaments").update({ shop_id: shop.id, ...f }).eq("id", cur.id), "riscatto torneo");
      }
    } else if (cur.shop_id === shop.id) {
      const patch = {};
      if (new Date(cur.starts_at).getTime() !== new Date(f.starts_at).getTime()) patch.starts_at = f.starts_at;
      if (cur.entry_fee_cents !== f.entry_fee_cents) patch.entry_fee_cents = f.entry_fee_cents;
      if (cur.max_players !== f.max_players) patch.max_players = f.max_players;
      // Lo stato cambia solo verso "annullato" o da programmato a concluso: non si riapre un torneo chiuso a mano.
      if (f.status === "cancelled" && cur.status !== "cancelled") patch.status = "cancelled";
      else if (f.status === "completed" && cur.status === "scheduled") patch.status = "completed";
      if (Object.keys(patch).length) {
        counts.update++;
        console.log(`  ~ aggiorna   ${label}  (${Object.keys(patch).join(", ")})`);
        if (args.go) must(await db.from("tournaments").update(patch).eq("id", cur.id), "aggiornamento torneo");
      } else counts.same++;
    } else {
      counts.other++;
      console.log(`  ! saltato    ${label}  (torneo già di un altro locale)`);
    }
  }
  if (args.go && inserts.length) must(await db.from("tournaments").insert(inserts), "inserimento tornei");

  console.log(`\nRiepilogo: ${counts.insert} nuovi, ${counts.claim} riscattati, ${counts.update} aggiornati, ${counts.same} invariati, ${counts.other} di altri locali, ${counts.invalid} non validi.`);
  if (!args.go) console.log("È stata una PROVA: per scrivere davvero aggiungi --go.");
}

main().catch((err) => {
  console.error(`\nErrore: ${err.message}`);
  process.exit(1);
});
