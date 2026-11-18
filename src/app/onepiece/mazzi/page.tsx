import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { CARD_RATIO, cardImageUrl } from "@/lib/card-images";
import { DECK_SIZE } from "@/lib/onepiece/deck-rules";

type DeckRow = {
  id: string;
  name: string;
  leader_code: string | null;
  created_at: string;
  deck_cards: { qty: number }[];
};

type LeaderRow = { card_code: string; name: string; image_path: string | null };

const dateFmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

async function Decks() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const op = supabase.schema("onepiece");

  const { data, error } = await op
    .from("decks")
    .select("id, name, leader_code, created_at, deck_cards(qty)")
    .eq("owner_id", auth.user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(100)
    .overrideTypes<DeckRow[], { merge: false }>();

  if (error) {
    return (
      <p role="alert" className="brutal-card bg-brand-red p-4 font-bold">
        Impossibile caricare i mazzi. Riprova più tardi.
      </p>
    );
  }

  const decks = data ?? [];
  if (decks.length === 0) {
    return (
      <div className="brutal-card p-4">
        <p className="font-bold">Nessun mazzo ancora</p>
        <p className="text-sm">Crea il tuo primo mazzo con il pulsante qui sopra.</p>
      </div>
    );
  }

  const codes = [...new Set(decks.map((d) => d.leader_code).filter((c): c is string => !!c))];
  const { data: leaders } = codes.length
    ? await op.from("leaders").select("card_code, name, image_path").in("card_code", codes).overrideTypes<LeaderRow[], { merge: false }>()
    : { data: [] as LeaderRow[] };
  const byCode = new Map((leaders ?? []).map((l) => [l.card_code, l]));

  return (
    <ul className="space-y-3">
      {decks.map((d) => {
        const total = d.deck_cards.reduce((n, c) => n + c.qty, 0);
        const leader = d.leader_code ? byCode.get(d.leader_code) : undefined;
        const src = cardImageUrl(leader?.image_path, "thumb");
        const complete = total === DECK_SIZE;
        return (
          <li key={d.id}>
            <Link href={`/onepiece/mazzi/${d.id}`} className="brutal-card flex items-center gap-3 p-3">
              <span className="block aspect-[5/7] w-14 shrink-0 overflow-hidden border-2 border-ink bg-brand-pink">
                {src && (
                  <Image unoptimized src={src} alt="" width={CARD_RATIO.width} height={CARD_RATIO.height} className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-black leading-tight">{d.name}</span>
                <span className="block text-sm">
                  {leader ? `${leader.card_code} · ${leader.name}` : (d.leader_code ?? "Leader non scelto")}
                </span>
                <span className="block text-xs font-medium">{dateFmt.format(new Date(d.created_at))}</span>
              </span>
              <span
                className={`shrink-0 border-2 border-ink px-2 py-1 text-xs font-black ${complete ? "bg-brand-green" : "bg-brand-yellow"}`}
              >
                {total}/{DECK_SIZE}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function DecksPage() {
  return (
    <>
      <PageHeader title="Mazzi" subtitle="One Piece, costruisci e salva" />
      <main className="space-y-4 p-4">
        <Link href="/onepiece/mazzi/nuovo" className="brutal-btn w-full bg-brand-green">
          + Nuovo mazzo
        </Link>
        <Suspense fallback={<p>Caricamento…</p>}>
          <Decks />
        </Suspense>
      </main>
    </>
  );
}
