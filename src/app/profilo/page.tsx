import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function Account() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const { count: managed } = await supabase
    .from("shop_members")
    .select("shop_id", { count: "exact", head: true })
    .eq("user_id", user?.id ?? "");

  return (
    <main className="space-y-4 p-4">
      <div className="brutal-card p-4">
        <p className="text-sm font-bold uppercase">Account Google</p>
        <p className="break-all">{user?.email ?? "—"}</p>
      </div>
      {(managed ?? 0) > 0 && (
        <Link href="/gestore" className="brutal-btn w-full bg-brand-green">
          Area gestore
        </Link>
      )}
      <Link href="/negozi/richiesta" className="brutal-btn w-full bg-white">
        Gestisci un negozio
      </Link>
      {me?.is_admin && (
        <Link href="/admin/richieste" className="brutal-btn w-full bg-brand-blue">
          Area admin · richieste negozi
        </Link>
      )}
      {me?.is_admin && (
        <Link href="/onepiece/admin/meta" className="brutal-btn w-full bg-brand-blue">
          Area admin · leader in meta (One Piece)
        </Link>
      )}
      <form action={signOut}>
        <button type="submit" className="brutal-btn w-full bg-brand-red">
          Esci
        </button>
      </form>
    </main>
  );
}

export default function ProfiloPage() {
  return (
    <>
      <PageHeader title="Profilo" subtitle="Il tuo account" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <Account />
      </Suspense>
    </>
  );
}
