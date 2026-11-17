import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Solo percorsi interni, per evitare open redirect.
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Attiva gli inviti a gestire un negozio in attesa per l'email di chi ha appena fatto l'accesso.
      // Se fallisce, l'accesso non deve essere bloccato: l'invito resta in attesa per il prossimo login.
      const { error: inviteError } = await supabase.rpc("claim_shop_invites");
      if (inviteError) console.error("[auth/callback] attivazione inviti fallita:", inviteError.code, inviteError.message);
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Solo nei log del server (mai nell'URL né al client): serve a capire il motivo.
    console.error("[auth/callback] scambio del codice fallito:", error.status, error.code, error.message);
  } else {
    console.error(
      "[auth/callback] nessun codice nella richiesta:",
      searchParams.get("error_code") ?? searchParams.get("error") ?? "sconosciuto",
      searchParams.get("error_description") ?? "",
    );
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
