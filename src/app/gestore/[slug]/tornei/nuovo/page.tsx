import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { TournamentForm } from "../../tournament-form";

const SLUG = /^[a-z0-9-]{1,80}$/;

async function NewTournament({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: shop } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
  if (!shop) notFound();
  const { data: member } = await supabase
    .from("shop_members")
    .select("role")
    .eq("shop_id", shop.id)
    .eq("user_id", auth.user?.id ?? "")
    .maybeSingle();
  if (!member) notFound();

  const { data: tcgs } = await supabase.from("tcgs").select("id, name").eq("active", true).order("name");

  return (
    <main className="p-4">
      <TournamentForm
        slug={slug}
        tcgs={tcgs ?? []}
        initial={{
          title: "",
          tcg_id: String(tcgs?.[0]?.id ?? ""),
          format_slug: "",
          starts_at: "",
          entry_fee: "",
          max_players: "",
          prizes: "",
          notes: "",
          bandai_url: "",
          status: "scheduled",
        }}
      />
    </main>
  );
}

export default function NewTournamentPage({ params }: PageProps<"/gestore/[slug]/tornei/nuovo">) {
  return (
    <>
      <PageHeader title="Nuovo torneo" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <NewTournament params={params} />
      </Suspense>
    </>
  );
}
