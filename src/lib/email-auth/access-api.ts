import { apiUrl, sharedLedger } from "@/lib/api";
import type { AccessRequestRow } from "@/lib/services/access-requests";

/** Внешний shared API (Docker/Turso host), чтобы Pages мог слать заявки в общий ledger. */
export function accessApiBase(): string {
  return (process.env.NEXT_PUBLIC_ACCESS_API_BASE ?? "").trim().replace(/\/$/, "");
}

/** Shared ledger на этом origin ИЛИ явный NEXT_PUBLIC_ACCESS_API_BASE. */
export function accessApiEnabled(): boolean {
  return sharedLedger || Boolean(accessApiBase());
}

function accessEndpoint(path: string): string {
  const base = accessApiBase();
  if (base) {
    const normalized = path.endsWith("/") ? path : `${path}/`;
    return `${base}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
  }
  return apiUrl(path);
}

export type SharedAccessCreateResult = {
  ok: boolean;
  request?: AccessRequestRow;
  mode?: "created" | "existing" | "allowed";
  telegram?: { attempted: number; sent: number };
  error?: string;
};

/** POST заявки в shared backend (+ Telegram админам на сервере). */
export async function postSharedAccessRequest(
  email: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<SharedAccessCreateResult | null> {
  if (!accessApiEnabled()) return null;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(accessEndpoint("/api/v1/access-requests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as SharedAccessCreateResult;
    if (!response.ok) return { ok: false, error: data.error ?? `HTTP ${response.status}` };
    return data;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network" };
  }
}

/** GET pending с shared backend (для админа на другом устройстве). */
export async function fetchSharedPendingRequests(opts?: {
  fetchImpl?: typeof fetch;
}): Promise<AccessRequestRow[] | null> {
  if (!accessApiEnabled()) return null;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(accessEndpoint("/api/v1/access-requests/?status=pending"));
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; requests?: AccessRequestRow[] };
    return data.requests ?? [];
  } catch {
    return null;
  }
}

export async function postSharedAccessDecision(input: {
  action: "approve" | "reject" | "add";
  actorEmail: string;
  requestId?: string;
  email?: string;
  expiresInDays?: number | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string }> {
  if (!accessApiEnabled()) return { ok: false, error: "api_disabled" };
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(accessEndpoint("/api/v1/access-requests/decide"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId,
        email: input.email,
        action: input.action,
        actorEmail: input.actorEmail,
        expiresInDays: input.expiresInDays,
      }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok) return { ok: false, error: data.error ?? `HTTP ${response.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network" };
  }
}
