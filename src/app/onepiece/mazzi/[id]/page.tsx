import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { entriesFromCards, type CatalogCard } from "@/lib/onepiece/deck-rules";
import { DeckEditor } from "./deck-editor";

type DeckRow = { id: string; name: string; leader_code: string | null };
type LeaderRow = { card_code: string; name: string; colors: string[]; image_path: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "card_code, name, type, colors, cost, power, counter, rarity, set_code, image_path, traits";
const PAGE = 1000; // limite di righe per richiesta

async function Editor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ errore?: string }> }) {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const { id } = await params;
  const { errore } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const op = supabase.schema("onepiece");

  // Il mazzo è visibile solo al proprietario (le regole del database lo garantiscono comunque).
  const { data: deck } = await op
    .from("decks")
    .select("id, name, leader_code")
    .eq("id", id)
    .eq("owner_id", auth.user?.id ?? "")
    .maybeSingle()
    .overrideTypes<DeckRow, { merge: false }>();
  if (!deck || !deck.leader_code) notFound();

  const [{ data: leader }, { data: deckCards }] = await Promise.all([
    op.from("leaders").select("card_code, name, colors, image_path").eq("card_code", deck.leader_code).maybeSingle().overrideTypes<LeaderRow, { merge: false }>(),
    op.from("deck_cards").select("card_code, qty").eq("deck_id", id),
  ]);
  if (!leader) notFound();

  // Catalogo: solo le carte che condividono un colore con il leader (e quelle senza dati ancora importati).
  const colors = leader.colors.filter((c) => /^[A-Za-z]+$/.test(c));
  const filter = `colors.ov.{${colors.join(",")}},colors.eq.{}`;
  const catalog: CatalogCard[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await op
      .from("cards")
      .select(FIELDS)
      .or(filter)
      .order("card_code")
      .range(from, from + PAGE - 1)
      .overrideTypes<CatalogCard[], { merge: false }>();
    if (error) {
      return (
        <main className="p-4">
          <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
            Impossibile caricare il catalogo delle carte. Riprova più tardi.
          </p>
        </main>
      );
    }
    catalog.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // Carte già nel mazzo che il filtro dei colori non ha incluso (es. mazzi creati incollando una lista).
  const have = new Set(catalog.map((c) => c.card_code));
  const missing = (deckCards ?? []).map((c) => c.card_code).filter((c) => !have.has(c));
  if (missing.length > 0) {
    const { data } = await op.from("cards").select(FIELDS).in("card_code", missing).overrideTypes<CatalogCard[], { merge: false }>();
    catalog.push(...(data ?? []));
  }

  return (
    <DeckEditor
      deckId={deck.id}
      initialName={deck.name}
      leader={leader}
      catalog={catalog}
      initialEntries={entriesFromCards((deckCards ?? []).map((c) => ({ card_code: c.card_code, qty: c.qty })))}
      deleteError={errore === "elimina"}
    />
  );
}

export default function DeckPage({ params, searchParams }: PageProps<"/onepiece/mazzi/[id]">) {
  return (
    <>
      <PageHeader title="Mazzo" subtitle="One Piece" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Editor params={params} searchParams={searchParams as Promise<{ errore?: string }>} />
      </Suspense>
    </>
  );
}
