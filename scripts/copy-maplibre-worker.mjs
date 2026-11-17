// MapLibre carica il suo worker da un URL: con il bundler non viene emesso da solo.
// Lo serviamo come file statico da /maplibre/ (vedi setWorkerUrl nei componenti mappa).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const to = resolve(root, "public/maplibre/maplibre-gl-worker.mjs");

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log("maplibre worker copiato in public/maplibre/");
