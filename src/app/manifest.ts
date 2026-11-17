import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ohara TCG Buddy",
    short_name: "Ohara Buddy",
    description: "Traccia tornei e risultati dei tuoi TCG.",
    lang: "it",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFF4D6",
    theme_color: "#FFD23F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
