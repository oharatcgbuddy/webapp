import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/shop-access";
import { cancelInvite, removeMember } from "../actions";
import { OwnerForm } from "./owner-form";

type ShopRow = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  address: string | null;
  status: "pending" | "approved" | "rejected";
  lat: number | null;
  lng: number | null;
};

type MemberRow = {
  user_id: string;
  role: string;
  profiles: { display_name: string | null; username: string | null } | null;
};

type InviteRow = { id: string; email: string; created_at: string };

const SLUG = /^[a-z0-9-]{1,80}$/;

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

const STATUS = {
  approved: { text: "Approvato", cls: "bg-brand-green" },
  pending: { text: "In attesa", cls: "bg-brand-yellow" },
  rejected: { text: "Rifiutato", cls: "bg-brand-red" },
} as const;

async function ShopAdmin({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, city, province, address, status, lat, lng")
    .eq("slug", slug)
    .maybeSingle()
    .overrideTypes<ShopRow, { merge: false }>();
  if (!shop) notFound();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("shop_members")
      .select("user_id, role, profiles(display_name, username)")
      .eq("shop_id", shop.id)
      .overrideTypes<MemberRow[], { merge: false }>(),
    supabase
      .from("shop_invites")
      .select("id, email, created_at")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: true })
      .overrideTypes<InviteRow[], { merge: false }>(),
  ]);

  const remove = removeMember.bind(null, slug);
  const cancel = cancelInvite.bind(null, slug);

  return (
    <main className="space-y-6 p-4">
      <section className="brutal-card space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-black leading-tight">{shop.name}</h2>
            <p className="text-sm">{[shop.address, [shop.city, shop.province].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
          </div>
          <span className={`shrink-0 border-2 border-ink px-2 py-1 text-xs font-black uppercase ${STATUS[shop.status].cls}`}>
            {STATUS[shop.status].text}
          </span>
        </div>
        {shop.lat === null && (
          <p className="border-2 border-ink bg-brand-yellow px-2 py-1 text-xs font-bold">
            Senza posizione sulla mappa: impostala da &quot;Modifica negozio e tornei&quot;.
          </p>
        )}
        <div className="grid gap-2 pt-1">
          <Link href={`/gestore/${slug}`} className="brutal-btn w-full bg-brand-green">
            Modifica negozio e tornei
          </Link>
          <Link href={`/negozi/${slug}`} className="brutal-btn w-full bg-white">
            Vedi la pagina pubblica
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Gestori</h2>
        {(members ?? []).length === 0 ? (
          <p className="text-sm">Nessun gestore: il negozio non può ancora essere gestito da nessuno tranne che da te.</p>
        ) : (
          <ul className="space-y-2">
            {(members ?? []).map((m) => (
              <li key={m.user_id} className="brutal-card flex items-center justify-between gap-2 p-3">
                <p className="min-w-0 font-bold leading-tight">
                  {m.profiles?.display_name ?? m.profiles?.username ?? "Utente"}
                  <span className="block text-xs font-medium uppercase">{m.role === "owner" ? "Proprietario" : "Staff"}</span>
                </p>
                <form action={remove}>
                  <input type="hidden" name="shop" value={shop.id} />
                  <input type="hidden" name="user" value={m.user_id} />
                  <button type="submit" className="border-[3px] border-ink bg-brand-red px-3 py-2 text-sm font-bold">
                    Togli
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {(invites ?? []).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-black uppercase">Inviti in attesa</h3>
            <ul className="space-y-2">
              {(invites ?? []).map((i) => (
                <li key={i.id} className="brutal-card flex items-center justify-between gap-2 p-3">
                  <p className="min-w-0 break-all text-sm font-bold leading-tight">
                    {i.email}
                    <span className="block text-xs font-medium">dal {dateFmt.format(new Date(i.created_at))}</span>
                  </p>
                  <form action={cancel}>
                    <input type="hidden" name="invite" value={i.id} />
                    <button type="submit" className="border-[3px] border-ink bg-white px-3 py-2 text-sm font-bold">
                      Annulla
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="brutal-card p-4">
          <OwnerForm slug={slug} />
          <p className="mt-2 text-xs">
            Se la persona ha già fatto l&apos;accesso diventa gestore subito; altrimenti l&apos;invito scatta al suo primo
            accesso con quell&apos;email.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function AdminShopPage({ params }: PageProps<"/admin/negozi/[slug]">) {
  return (
    <>
      <PageHeader title="Negozio" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <ShopAdmin params={params} />
      </Suspense>
    </>
  );
}
