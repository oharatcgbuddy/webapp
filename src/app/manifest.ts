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
    // Android mostra questo colore con l'icona mentre l'app si avvia: lo stesso giallo della schermata di caricamento.
    background_color: "#FFD23F",
    theme_color: "#FFD23F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
