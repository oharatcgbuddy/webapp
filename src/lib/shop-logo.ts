// Il logo di un negozio sta nel bucket pubblico "shop-logos". In shops.logo_url si salva solo il percorso
// "<id negozio>/logo-<timestamp>.webp" (così il servizio immagini lo scarica senza URL arbitrari).

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/shop-logos`;

export const SHOP_LOGO_MAX_BYTES = 512 * 1024;

export function shopLogoPathOk(path: string, shopId: string): boolean {
  return new RegExp(`^${shopId}/logo-\\d{10,15}\\.webp$`, "i").test(path);
}

export function shopLogoUrl(path: string | null | undefined): string | null {
  if (!path || !/^[A-Za-z0-9_./-]{1,100}$/.test(path) || path.includes("..")) return null;
  return `${BASE}/${path}`;
}
