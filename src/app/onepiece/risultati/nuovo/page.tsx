import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { ResultForm } from "./result-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

async function FormLoader({ searchParams }: { searchParams: Promise<{ torneo?: string }> }) {
  await connection(); // usa l'ora corrente: niente prerender
  const { torneo } = await searchParams;
  const initial = torneo && UUID.test(torneo) ? torneo : "";

  const supabase = await createClient();
  const nowDate = new Date();
  const since = new Date(nowDate.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  const now = nowDate.toISOString();

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return <main className="p-4">Accedi per inserire un risultato.</main>;

  const [{ data: tournaments }, { data: leaders }, { data: decks }, { data: shops }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, title, starts_at")
      .gte("starts_at", since)
      .lte("starts_at", now)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .schema("onepiece")
      .from("leaders")
      .select("card_code, name, image_path, meta_position")
      .order("card_code"),
    supabase
      .schema("onepiece")
      .from("decks")
      .select("id, name, leader_code")
      .eq("owner_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("shops").select("id, name, city").eq("status", "approved").order("name").limit(500),
  ]);

  const options = (tournaments ?? []).map((t) => ({
    id: t.id,
    label: `${dateFmt.format(new Date(t.starts_at))} · ${t.title}`,
  }));

  return (
    <ResultForm
      tournaments={options}
      leaders={leaders ?? []}
      decks={decks ?? []}
      shops={(shops ?? []).map((s) => ({ id: s.id, label: s.city ? `${s.name} (${s.city})` : s.name }))}
      initialTournament={options.some((o) => o.id === initial) ? initial : ""}
      today={now.slice(0, 10)}
    />
  );
}

export default function NuovoRisultatoPage({ searchParams }: PageProps<"/onepiece/risultati/nuovo">) {
  return (
    <>
      <PageHeader title="Nuovo risultato" subtitle="One Piece" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <FormLoader searchParams={searchParams as Promise<{ torneo?: string }>} />
      </Suspense>
    </>
  );
}
