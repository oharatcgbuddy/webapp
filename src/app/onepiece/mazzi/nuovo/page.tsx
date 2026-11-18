import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { NewDeckForm } from "./new-deck-form";

type LeaderRow = { card_code: string; name: string; image_path: string | null; meta_position: number | null };

async function NewDeck() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("onepiece")
    .from("leaders")
    .select("card_code, name, image_path, meta_position")
    .order("card_code")
    .overrideTypes<LeaderRow[], { merge: false }>();

  if (error || !data || data.length === 0) {
    return (
      <main className="p-4">
        <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
          Impossibile caricare i leader. Riprova più tardi.
        </p>
      </main>
    );
  }

  return (
    <main className="p-4">
      <NewDeckForm leaders={data} />
    </main>
  );
}

export default function NewDeckPage() {
  return (
    <>
      <PageHeader title="Nuovo mazzo" subtitle="One Piece" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <NewDeck />
      </Suspense>
    </>
  );
}
