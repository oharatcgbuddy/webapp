import { changeShop } from "./[id]/actions";

export type ShopOption = { id: string; label: string };

// Locale di un torneo libero (nome e logo nelle immagini). Per i tornei creati da un locale non serve:
// il locale è quello del torneo.
export function ChangeShop({
  participationId,
  currentShopId,
  shops,
}: {
  participationId: string;
  currentShopId: string | null;
  shops: ShopOption[];
}) {
  if (shops.length === 0) return null;

  return (
    <form action={changeShop.bind(null, participationId)} className="brutal-card space-y-3 p-4">
      <h3 className="font-black uppercase">Locale</h3>
      <select
        name="shop_id"
        defaultValue={currentShopId ?? ""}
        aria-label="Locale del torneo"
        className="block w-full border-[3px] border-ink bg-white px-3 py-2"
      >
        <option value="">Nessun locale</option>
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button type="submit" className="brutal-btn w-full bg-white">
        Salva locale
      </button>
      <p className="text-xs">Nome e logo del locale compaiono nelle immagini di questo risultato.</p>
    </form>
  );
}
