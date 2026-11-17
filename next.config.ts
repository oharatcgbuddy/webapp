import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Vecchi indirizzi (prima che le pagine stessero sotto il gioco): segnalibri e app già installate.
  async redirects() {
    return [
      { source: "/risultati/:path*", destination: "/onepiece/risultati/:path*", permanent: false },
      { source: "/risultati", destination: "/onepiece/risultati", permanent: false },
      { source: "/tornei/:id", destination: "/onepiece/tornei/:id", permanent: false },
      { source: "/admin/meta", destination: "/onepiece/admin/meta", permanent: false },
    ];
  },
  images: {
    // Immagini di carte e leader nel bucket pubblico di Supabase Storage.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/card-images/**" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
