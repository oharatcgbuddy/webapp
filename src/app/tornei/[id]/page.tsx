import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { bandaiEventUrl } from "@/lib/bandai";

type TournamentDetail = {
  id: string;
  title: string;
  starts_at: string;
  entry_fee_cents: number | null;
  max_players: number | null;
  format_slug: string | null;
  prizes: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  external_id: string | null;
  shops: {
    slug: string;
    name: string;
    address: string | null;
    city: string | null;
    province: string | null;
    phone: string | null;
    website: string | null;
  } | null;
  tcgs: { name: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL = { scheduled: "In programma", completed: "Concluso", cancelled: "Annullato" };

function euro(cents: number | null) {
  if (cents == null) return "—";
  return cents === 0
    ? "Gratis"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function safeUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b-2 border-ink py-2 last:border-b-0">
      <dt className="text-sm font-bold uppercase">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      `id, title, starts_at, entry_fee_cents, max_players, format_slug, prizes, notes, status, external_id,
       shops (slug, name, address, city, province, phone, website),
       tcgs (name)`,
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<TournamentDetail, { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare il torneo. Riprova più tardi.
        </p>
      </main>
    );
  }
  if (!data) notFound();

  const shop = data.shops;
  const website = safeUrl(shop?.website ?? null);
  const place = shop
    ? [shop.address, [shop.city, shop.province].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <main className="space-y-4 p-4">
      <div className="brutal-card p-4">
        <p className="text-sm font-bold uppercase">{dateFmt.format(new Date(data.starts_at))}</p>
        <h2 className="text-2xl font-black leading-tight">{data.title}</h2>
        <p className="mt-1 inline-block border-2 border-ink bg-brand-yellow px-2 py-1 text-xs font-bold">
          {STATUS_LABEL[data.status]}
        </p>
      </div>

      <dl className="brutal-card px-4 py-2">
        <Row label="Gioco" value={data.tcgs?.name ?? "—"} />
        <Row label="Formato" value={data.format_slug ?? "—"} />
        <Row label="Costo" value={euro(data.entry_fee_cents)} />
        <Row label="Posti" value={data.max_players ?? "—"} />
      </dl>

      {data.prizes && (
        <section className="brutal-card p-4">
          <h3 className="font-black uppercase">Premi</h3>
          <p className="whitespace-pre-line">{data.prizes}</p>
        </section>
      )}
      {data.notes && (
        <section className="brutal-card p-4">
          <h3 className="font-black uppercase">Note</h3>
          <p className="whitespace-pre-line">{data.notes}</p>
        </section>
      )}

      {!shop && data.external_id && (
        <p className="brutal-card p-4 text-sm">
          Torneo segnalato da un giocatore, non ancora verificato da un negozio.
        </p>
      )}

      {data.external_id && (
        <a
          href={bandaiEventUrl(data.external_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="brutal-btn w-full bg-white"
        >
          Apri l&apos;evento su BANDAI TCG+
        </a>
      )}

      {shop && (
        <section className="brutal-card space-y-1 p-4">
          <h3 className="font-black uppercase">Negozio</h3>
          <p className="font-bold">
            <Link href={`/negozi/${shop.slug}`} className="underline decoration-[3px]">
              {shop.name}
            </Link>
          </p>
          {place && <p className="text-sm">{place}</p>}
          {shop.phone && (
            <p className="text-sm">
              <a href={`tel:${shop.phone}`} className="underline">
                {shop.phone}
              </a>
            </p>
          )}
          {website && (
            <p className="text-sm">
              <a href={website} target="_blank" rel="noopener noreferrer" className="underline">
                Sito web
              </a>
            </p>
          )}
        </section>
      )}

      <Link href={`/risultati/nuovo?torneo=${data.id}`} className="brutal-btn w-full bg-brand-green">
        Aggiungi il mio risultato
      </Link>
    </main>
  );
}

export default function TournamentPage({ params }: PageProps<"/tornei/[id]">) {
  return (
    <>
      <PageHeader title="Torneo" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}
