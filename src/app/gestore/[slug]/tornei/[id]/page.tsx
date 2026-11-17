import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isoToRomeLocal } from "@/lib/datetime";
import { TournamentForm } from "../../tournament-form";
import { DeleteTournament } from "../../delete-tournament";

type TournamentRow = {
  id: string;
  title: string;
  tcg_id: number;
  format_slug: string | null;
  starts_at: string;
  entry_fee_cents: number | null;
  max_players: number | null;
  prizes: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
};

const SLUG = /^[a-z0-9-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function euros(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toString().replace(".", ",");
}

async function EditTournament({ params }: { params: Promise<{ slug: string; id: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { slug, id } = await params;
  if (!SLUG.test(slug) || !UUID.test(id)) notFound();

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

  const [{ data: t }, { data: tcgs }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, title, tcg_id, format_slug, starts_at, entry_fee_cents, max_players, prizes, notes, status")
      .eq("id", id)
      .eq("shop_id", shop.id)
      .maybeSingle()
      .overrideTypes<TournamentRow, { merge: false }>(),
    supabase.from("tcgs").select("id, name").eq("active", true).order("name"),
  ]);
  if (!t) notFound();

  return (
    <main className="space-y-4 p-4">
      <TournamentForm
        slug={slug}
        tournamentId={t.id}
        tcgs={tcgs ?? []}
        initial={{
          title: t.title,
          tcg_id: String(t.tcg_id),
          format_slug: t.format_slug ?? "",
          starts_at: isoToRomeLocal(t.starts_at),
          entry_fee: euros(t.entry_fee_cents),
          max_players: t.max_players?.toString() ?? "",
          prizes: t.prizes ?? "",
          notes: t.notes ?? "",
          status: t.status,
        }}
      />
      <DeleteTournament slug={slug} id={t.id} />
    </main>
  );
}

export default function EditTournamentPage({ params }: PageProps<"/gestore/[slug]/tornei/[id]">) {
  return (
    <>
      <PageHeader title="Modifica torneo" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <EditTournament params={params} />
      </Suspense>
    </>
  );
}
