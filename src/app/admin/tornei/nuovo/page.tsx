import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/shop-access";
import { RegionalForm } from "../regional-form";

async function NewRegional() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  const { data: tcgs } = await supabase.from("tcgs").select("id, name").eq("active", true).order("name");

  return (
    <main className="p-4">
      <RegionalForm
        tcgs={tcgs ?? []}
        initial={{
          title: "",
          venue: "",
          tcg_id: String(tcgs?.[0]?.id ?? ""),
          format_slug: "",
          starts_at: "",
          entry_fee: "",
          max_players: "",
          prizes: "",
          notes: "",
          status: "scheduled",
        }}
      />
    </main>
  );
}

export default function NewRegionalPage() {
  return (
    <>
      <PageHeader title="Nuovo Regional" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <NewRegional />
      </Suspense>
    </>
  );
}
