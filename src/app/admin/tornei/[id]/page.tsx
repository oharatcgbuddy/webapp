import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isoToRomeLocal } from "@/lib/datetime";
import { isAdmin } from "@/lib/shop-access";
import { RegionalForm } from "../regional-form";
import { DeleteRegional } from "../delete-regional";

type Row = {
  id: string;
  title: string;
  venue: string | null;
  tcg_id: number;
  format_slug: string | null;
  starts_at: string;
  entry_fee_cents: number | null;
  max_players: number | null;
  prizes: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function euros(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toString().replace(".", ",");
}

async function EditRegional({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { id } = await params;
  const { errore } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  const [{ data: t }, { data: tcgs }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, title, venue, tcg_id, format_slug, starts_at, entry_fee_cents, max_players, prizes, notes, status")
      .eq("id", id)
      .eq("kind", "regional")
      .maybeSingle()
      .overrideTypes<Row, { merge: false }>(),
    supabase.from("tcgs").select("id, name").eq("active", true).order("name"),
  ]);
  if (!t) notFound();

  return (
    <main className="space-y-4 p-4">
      {errore === "elimina" && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-3 font-bold">
          Non sono riuscito a eliminare il torneo. Riprova.
        </p>
      )}
      <RegionalForm
        tournamentId={t.id}
        tcgs={tcgs ?? []}
        initial={{
          title: t.title,
          venue: t.venue ?? "",
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
      <DeleteRegional id={t.id} />
    </main>
  );
}

export default function EditRegionalPage({ params, searchParams }: PageProps<"/admin/tornei/[id]">) {
  return (
    <>
      <PageHeader title="Modifica Regional" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <EditRegional params={params} searchParams={searchParams as Promise<{ errore?: string }>} />
      </Suspense>
    </>
  );
}
