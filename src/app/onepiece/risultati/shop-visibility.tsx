import { setShopVisibility } from "./[id]/actions";

// Un risultato su un torneo di un negozio è visibile ai gestori di quel negozio (per l'immagine e l'elenco dei risultati).
// Il giocatore può nasconderlo e mostrarlo di nuovo. Funziona anche senza JavaScript.
export function ShopVisibility({
  participationId,
  shopName,
  hidden,
}: {
  participationId: string;
  shopName: string;
  hidden: boolean;
}) {
  return (
    <form action={setShopVisibility.bind(null, participationId)} className="brutal-card space-y-3 p-4">
      <h3 className="font-black uppercase">Visibile al negozio</h3>
      <p className="text-sm">
        {hidden
          ? `Hai nascosto questo risultato: ${shopName} non lo vede.`
          : `${shopName} vede questo risultato tra quelli del torneo e può creare l'immagine per te.`}
      </p>
      <input type="hidden" name="visible" value={hidden ? "yes" : "no"} />
      <button type="submit" className="brutal-btn w-full bg-white">
        {hidden ? "Mostra al negozio" : "Nascondi al negozio"}
      </button>
    </form>
  );
}
