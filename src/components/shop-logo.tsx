import Image from "next/image";
import { shopLogoUrl } from "@/lib/shop-logo";

// Logo tondo di un negozio; senza logo, un cerchio con l'iniziale (così le righe restano allineate).
export function ShopLogo({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
  const src = shopLogoUrl(logoUrl);
  const box = "shrink-0 rounded-full border-[3px] border-ink";
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={`${box} flex items-center justify-center bg-brand-yellow font-black`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <Image unoptimized src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className={`${box} object-cover`} />
  );
}
