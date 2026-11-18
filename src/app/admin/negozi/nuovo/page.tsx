import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/shop-access";
import { ShopForm } from "@/app/gestore/[slug]/shop-form";
import { createShopAsAdmin } from "../actions";

const EMPTY = {
  name: "",
  city: "",
  province: "",
  address: "",
  phone: "",
  website: "",
  description: "",
  instagram: "",
  facebook: "",
  discord: "",
  lat: "",
  lng: "",
};

async function NewShop() {
  await connection(); // il controllo del token usa l'ora corrente: niente prerender
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Pagina riservata agli admin: per gli altri non esiste.
  if (!(await isAdmin(supabase, auth.user?.id ?? ""))) notFound();

  return (
    <main className="space-y-3 p-4">
      <p className="text-sm">
        Il negozio nasce già approvato. Dopo averlo creato potrai assegnargli un gestore con la sua email Google.
      </p>
      <ShopForm action={createShopAsAdmin} initial={EMPTY} submitLabel="Crea negozio" creating />
    </main>
  );
}

export default function NewShopPage() {
  return (
    <>
      <PageHeader title="Nuovo negozio" subtitle="Area admin" />
      <Suspense fallback={<main className="p-4">Caricamento…</main>}>
        <NewShop />
      </Suspense>
    </>
  );
}
