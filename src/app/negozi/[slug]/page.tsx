import { Suspense } from "react";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { shopLogoUrl } from "@/lib/shop-logo";
import { toggleFavorite } from "./actions";

type Shop = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  website: string | null;
  social: Record<string, string> | null;
  logo_url: string | null;
};

type TournamentRow = {
  id: string;
  title: string;
  starts_at: string;
  entry_fee_cents: number | null;
  format_slug: string | null;
};

const SLUG = /^[a-z0-9-]{1,80}$/;

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function safeUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function TournamentList({ rows, empty }: { rows: TournamentRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((t) => (
        <li key={t.id} className="border-[3px] border-ink bg-white p-3">
          <p className="text-xs font-bold uppercase">{dateFmt.format(new Date(t.starts_at))}</p>
          <Link href={`/onepiece/tornei/${t.id}`} className="font-black underline decoration-[3px]">
            {t.title}
          </Link>
          {t.format_slug && <span className="ml-2 text-xs font-bold">{t.format_slug}</span>}
        </li>
      ))}
    </ul>
  );
}

async function ShopDetail({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // usa l'ora corrente: niente prerender
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();

  const supabase = await createClient();
  const { data: shop, error } = await supabase
    .from("shops")
    .select("id, name, description, address, city, province, phone, website, social, logo_url")
    .eq("slug", slug)
    .maybeSingle()
    .overrideTypes<Shop, { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare il negozio. Riprova più tardi.
        </p>
      </main>
    );
  }
  if (!shop) notFound();

  const { data: auth } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const cols = "id, title, starts_at, entry_fee_cents, format_slug";

  const [upcoming, past, fav] = await Promise.all([
    supabase
      .from("tournaments")
      .select(cols)
      .eq("shop_id", shop.id)
      .eq("status", "scheduled")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(20)
      .overrideTypes<TournamentRow[], { merge: false }>(),
    supabase
      .from("tournaments")
      .select(cols)
      .eq("shop_id", shop.id)
      .lt("starts_at", now)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(10)
      .overrideTypes<TournamentRow[], { merge: false }>(),
    supabase
      .from("shop_favorites")
      .select("shop_id")
      .eq("shop_id", shop.id)
      .eq("user_id", auth.user?.id ?? "")
      .maybeSingle(),
  ]);

  const isFavorite = !!fav.data;
  const logo = shopLogoUrl(shop.logo_url);
  const website = safeUrl(shop.website);
  const place = [shop.address, [shop.city, shop.province].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const socials = Object.entries(shop.social ?? {})
    .map(([name, url]) => [name, safeUrl(url)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return (
    <main className="space-y-4 p-4">
      <section className="brutal-card space-y-2 p-4">
        <div className="flex items-center gap-3">
          {logo && (
            <Image
              unoptimized
              src={logo}
              alt={`Logo di ${shop.name}`}
              width={72}
              height={72}
              className="size-[72px] shrink-0 rounded-full border-[3px] border-ink object-cover"
            />
          )}
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-black leading-tight">{shop.name}</h2>
            {place && <p className="text-sm font-bold">{place}</p>}
          </div>
        </div>
        {shop.description && <p className="whitespace-pre-line">{shop.description}</p>}
        <p className="flex flex-wrap gap-x-4 text-sm">
          {shop.phone && (
            <a href={`tel:${shop.phone}`} className="underline">
              {shop.phone}
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="underline">
              Sito web
            </a>
          )}
          {socials.map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="underline">
              {name}
            </a>
          ))}
        </p>
      </section>

      <form action={toggleFavorite.bind(null, shop.id, slug)}>
        <button
          type="submit"
          aria-pressed={isFavorite}
          className={`brutal-btn w-full ${isFavorite ? "bg-brand-pink" : "bg-white"}`}
        >
          {isFavorite ? "♥ Stai seguendo questo negozio" : "♡ Segui questo negozio"}
        </button>
      </form>

      <section className="space-y-3">
        <h3 className="font-black uppercase">Prossimi tornei</h3>
        <TournamentList rows={upcoming.data ?? []} empty="Nessun torneo in programma." />
      </section>

      <section className="space-y-3">
        <h3 className="font-black uppercase">Tornei passati</h3>
        <TournamentList rows={past.data ?? []} empty="Ancora nessun torneo passato." />
      </section>
    </main>
  );
}

export default function ShopPage({ params }: PageProps<"/negozi/[slug]">) {
  return (
    <>
      <PageHeader title="Negozio" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <ShopDetail params={params} />
      </Suspense>
    </>
  );
}
