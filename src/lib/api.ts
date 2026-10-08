export const sharedLedger = process.env.NEXT_PUBLIC_SHARED === "1";

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return `${base}${prefix}${normalized}`;
}
