import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Versione dell'app (da package.json) e commit del deploy, mostrati nel profilo.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
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
