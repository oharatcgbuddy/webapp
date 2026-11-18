import { createClient } from "@/lib/supabase/server";
import { IMAGE_FORMATS, parseFormat, renderImage } from "@/lib/image-api";
import { buildDeckImage, buildParticipationImage, buildTournamentResultImage } from "@/lib/onepiece/image-data";

// GET /api/immagini/<mazzo|risultato|torneo>/<id>?formato=post|storia|libero
// Crea l'immagine con la sessione di chi chiede: le regole del database decidono se può vederla.
// Il proxy impedisce già l'accesso senza login.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, ctx: RouteContext<"/api/immagini/[tipo]/[id]">) {
  const { tipo, id } = await ctx.params;
  if (!UUID.test(id)) return json("Richiesta non valida.", 400);
  const format = parseFormat(new URL(request.url).searchParams.get("formato"));

  const supabase = await createClient();
  const built =
    tipo === "mazzo"
      ? await buildDeckImage(supabase, id)
      : tipo === "risultato"
        ? await buildParticipationImage(supabase, id)
        : tipo === "torneo"
          ? await buildTournamentResultImage(supabase, id)
          : null;
  if (!built) return json("Richiesta non valida.", 400);
  if (!built.ok) return json(built.error, built.status);

  const out = await renderImage(built.body, format);
  if (!out.ok) return json(out.error, 502);

  return new Response(out.png, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${built.file}-${IMAGE_FORMATS[format].file}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
