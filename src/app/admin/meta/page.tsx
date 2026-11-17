import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { MetaForm, type MetaLeader } from "./meta-form";

type LeaderRow = MetaLeader & { meta_position: number | null };

async function MetaLoader() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user?.id ?? "")
    .maybeSingle();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!me?.is_admin) notFound();

  const { data, error } = await supabase
    .schema("onepiece")
    .from("leaders")
    .select("card_code, name, image_path, meta_position")
    .order("card_code")
    .overrideTypes<LeaderRow[], { merge: false }>();

  if (error) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare i leader. Riprova più tardi.
        </p>
      </main>
    );
  }

  const leaders = data ?? [];
  const initial = leaders
    .filter((l) => l.meta_position != null)
    .sort((a, b) => (a.meta_position ?? 0) - (b.meta_position ?? 0))
    .map((l) => l.card_code);
  const withImage = leaders.filter((l) => l.image_path).length;

  return (
    <main className="space-y-4 p-4">
      <p className="brutal-card p-3 text-sm">
        I leader che scegli compaiono in cima al selettore, in questo ordine, come riquadri da toccare.
        Immagini caricate: <strong>{withImage}</strong> su {leaders.length}.
      </p>
      <MetaForm leaders={leaders.map(({ card_code, name, image_path }) => ({ card_code, name, image_path }))} initial={initial} />
    </main>
  );
}

export default function AdminMetaPage() {
  return (
    <>
      <PageHeader title="Leader in meta" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <MetaLoader />
      </Suspense>
    </>
  );
}
