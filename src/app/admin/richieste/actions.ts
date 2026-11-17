"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = "/admin/richieste";

// Il controllo admin è nelle funzioni SQL (security definer): qui si inoltra soltanto la chiamata.
export async function approveRequest(fd: FormData): Promise<void> {
  const id = fd.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_shop_request", { p_request: id });
  if (error) redirect(`${PATH}?errore=1`);

  revalidatePath(PATH);
  redirect(PATH);
}

export async function rejectRequest(fd: FormData): Promise<void> {
  const id = fd.get("id");
  const note = fd.get("note");
  if (typeof id !== "string" || !UUID.test(id)) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_shop_request", {
    p_request: id,
    p_note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
  });
  if (error) redirect(`${PATH}?errore=1`);

  revalidatePath(PATH);
  redirect(PATH);
}
