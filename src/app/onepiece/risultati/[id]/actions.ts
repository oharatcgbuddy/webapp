"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Elimina un proprio risultato. Round e dettagli vanno in cascata; i mazzi restano.
export async function deleteResult(id: string): Promise<void> {
  if (!UUID.test(id)) return;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  await supabase.from("participations").delete().eq("id", id).eq("user_id", auth.user.id);
  redirect("/onepiece/risultati");
}
