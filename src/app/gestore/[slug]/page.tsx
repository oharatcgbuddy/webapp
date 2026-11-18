import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { canManageShop } from "@/lib/shop-access";
import { LogoUpload } from "./logo-upload";
import { ShopForm } from "./shop-form";
import { updateShop } from "./actions";

type ShopRow = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  social: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
};

type TournamentRow = {
  id: string;
  title: string;
  starts_at: string;
  status: "scheduled" | "completed" | "cancelled";
};

const SLUG = /^[a-z0-9-]{1,80}$/;

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS = {
  scheduled: { text: "In programma", cls: "bg-brand-yellow" },
  completed: { text: "Concluso", cls: "bg-brand-green" },
  cancelled: { text: "Annullato", cls: "bg-brand-red" },
} as const;

async function Manage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug } = await params;
  const { errore } = await searchParams;
  if (!SLUG.test(slug)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, city, province, address, phone, website, description, social, lat, lng, logo_url")
    .eq("slug", slug)
    .maybeSingle()
    .overrideTypes<ShopRow, { merge: false }>();
  if (!shop) notFound();

  // Chi non gestisce il negozio (membro o admin) non deve nemmeno sapere che la pagina esiste.
  if (!(await canManageShop(supabase, shop.id, auth.user?.id ?? ""))) notFound();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, title, starts_at, status")
    .eq("shop_id", shop.id)
    .order("starts_at", { ascending: false })
    .limit(100)
    .overrideTypes<TournamentRow[], { merge: false }>();

  const social = shop.social ?? {};

  return (
    <main className="space-y-6 p-4">
      <Link href={`/negozi/${slug}`} className="inline-block text-sm font-bold underline">
        Vedi la pagina pubblica
      </Link>

      {errore && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          Non puoi eliminare un torneo con risultati collegati: impostalo come annullato.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Tornei</h2>
        <Link href={`/gestore/${slug}/tornei/nuovo`} className="brutal-btn w-full bg-brand-green">
          + Nuovo torneo
        </Link>
        {(tournaments ?? []).length === 0 ? (
          <p className="text-sm">Nessun torneo creato.</p>
        ) : (
          <ul className="space-y-3">
            {(tournaments ?? []).map((t) => (
              <li key={t.id} className="brutal-card flex items-start justify-between gap-2 p-3">
                <div>
                  <p className="text-xs font-bold uppercase">{dateFmt.format(new Date(t.starts_at))}</p>
                  <Link href={`/gestore/${slug}/tornei/${t.id}`} className="font-black underline decoration-[3px]">
                    {t.title}
                  </Link>
                </div>
                <span className={`border-2 border-ink px-2 py-1 text-xs font-black uppercase ${STATUS[t.status].cls}`}>
                  {STATUS[t.status].text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <LogoUpload slug={slug} shopId={shop.id} currentPath={shop.logo_url} />

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Pagina del negozio</h2>
        <ShopForm
          action={updateShop.bind(null, slug)}
          initial={{
            name: shop.name,
            city: shop.city ?? "",
            province: shop.province ?? "",
            address: shop.address ?? "",
            phone: shop.phone ?? "",
            website: shop.website ?? "",
            description: shop.description ?? "",
            instagram: social.instagram ?? "",
            facebook: social.facebook ?? "",
            discord: social.discord ?? "",
            lat: shop.lat?.toString() ?? "",
            lng: shop.lng?.toString() ?? "",
          }}
        />
      </section>
    </main>
  );
}

export default function ManageShopPage({ params, searchParams }: PageProps<"/gestore/[slug]">) {
  return (
    <>
      <PageHeader title="Gestione negozio" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Manage
          params={params}
          searchParams={searchParams as Promise<{ errore?: string }>}
        />
      </Suspense>
    </>
  );
}
