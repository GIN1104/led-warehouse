import { corsPreflight, withCors } from "@/lib/api/cors";
import { DomainError } from "@/lib/domain/errors";
import { enqueueLedger } from "@/lib/db/file-store";
import { normalizeEmail } from "@/lib/email-auth/normalize";
import {
  addAllowedEmailManual,
  approveAccessRequest,
  findPendingRequest,
  rejectAccessRequest,
  revokeAllowedEmail,
} from "@/lib/services/access-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/** POST { requestId?, email?, action, actorEmail, expiresInDays? } — approve/reject/add/revoke на shared ledger. */
export async function POST(request: Request) {
  let body: {
    requestId?: string;
    email?: string;
    action?: "approve" | "reject" | "add" | "revoke";
    actorEmail?: string;
    expiresInDays?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withCors(request, Response.json({ error: "Нужен JSON" }, { status: 400 }));
  }
  const actorEmail = normalizeEmail(body.actorEmail ?? "");
  const action = body.action;
  if (!actorEmail || (action !== "approve" && action !== "reject" && action !== "add" && action !== "revoke")) {
    return withCors(request, Response.json({ error: "Нужны action и actorEmail" }, { status: 400 }));
  }

  try {
    const result = await enqueueLedger((db) => {
      if (action === "add") {
        const email = normalizeEmail(body.email ?? "");
        if (!email) throw new DomainError("Нужен email");
        return {
          kind: "add" as const,
          allowed: addAllowedEmailManual(db, email, actorEmail, {
            expiresInDays: body.expiresInDays,
          }),
        };
      }
      if (action === "revoke") {
        const email = normalizeEmail(body.email ?? "");
        if (!email) throw new DomainError("Нужен email");
        revokeAllowedEmail(db, email, actorEmail);
        return { kind: "revoke" as const, email };
      }
      let requestId = String(body.requestId ?? "").trim();
      const emailHint = normalizeEmail(body.email ?? "");
      // UI мог прислать remote id, которого нет в этом ledger — ищем pending по email.
      if (requestId) {
        const byId = db.get<{ id: string; status: string }>(
          `SELECT id, status FROM access_requests WHERE id = ?`,
          [requestId],
        );
        if (!byId || byId.status !== "pending") {
          if (emailHint) {
            const pending = findPendingRequest(db, emailHint);
            if (pending) requestId = pending.id;
          }
        }
      } else if (emailHint) {
        const pending = findPendingRequest(db, emailHint);
        if (pending) requestId = pending.id;
      }
      if (!requestId) throw new DomainError("Нужен requestId");
      if (action === "approve") {
        return {
          kind: "approve" as const,
          request: approveAccessRequest(db, requestId, actorEmail, {
            expiresInDays: body.expiresInDays ?? null,
          }),
        };
      }
      return { kind: "reject" as const, request: rejectAccessRequest(db, requestId, actorEmail) };
    });
    return withCors(request, Response.json({ ok: true, ...result }));
  } catch (error) {
    const message = error instanceof DomainError ? error.message : error instanceof Error ? error.message : "error";
    const status = /Управлять доступом|не найден|обработана|нельзя отозвать|не в списке/i.test(message)
      ? 403
      : 500;
    return withCors(request, Response.json({ ok: false, error: message }, { status }));
  }
}
