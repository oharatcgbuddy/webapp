// Versione dell'app: numero da package.json e, nei deploy, i primi 7 caratteri del commit (vedi next.config.ts).
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "";

export function appVersionLabel(): string {
  return `v${APP_VERSION || "?"}${APP_COMMIT ? ` · ${APP_COMMIT}` : ""}`;
}
