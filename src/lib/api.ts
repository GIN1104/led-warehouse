/** Remote API host for static Pages (Fly). Empty on same-origin Docker/Fly UI. */
export function accessApiBase(): string {
  return (process.env.NEXT_PUBLIC_ACCESS_API_BASE ?? "").trim().replace(/\/$/, "");
}

/**
 * Shared ledger mode: Docker/Fly with NEXT_PUBLIC_SHARED=1, or Pages pointing at ACCESS_API_BASE.
 * When true, warehouse opens/pushes via /api/v1/ledger (not IndexedDB).
 */
export const sharedLedger =
  process.env.NEXT_PUBLIC_SHARED === "1" || Boolean(accessApiBase());

export function apiUrl(path: string): string {
  const remote = accessApiBase();
  const base = remote || (process.env.NEXT_PUBLIC_API_BASE ?? "");
  // Remote Fly host has no /led-warehouse basePath; local Pages/static prefix only for same-origin.
  const prefix = remote ? "" : (process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return `${base}${prefix}${normalized}`;
}
