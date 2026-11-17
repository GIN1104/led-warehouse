import { corsPreflight, withCors } from "@/lib/api/cors";
import { assertOwnerOrCron, parseTarget, readActorEmail } from "@/lib/backup/http";
import { assertRestoreConfirm } from "@/lib/backup/owner";
import { restoreFromBackup } from "@/lib/backup/restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/**
 * POST { actorEmail, target: 'r2'|'drive', key, confirm: 'CONFIRM' }
 * Опасная операция: заменяет ledger + bump revision + push Turso.
 */
export async function POST(request: Request) {
  let body: { actorEmail?: string; target?: string; key?: string; confirm?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withCors(request, Response.json({ ok: false, error: "Нужен JSON" }, { status: 400 }));
  }

  const actorEmail = readActorEmail(request, body.actorEmail);
  try {
    assertOwnerOrCron(request, actorEmail, false);
    assertRestoreConfirm(body.confirm ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    const status = /CONFIRM|владелец/i.test(message) ? 403 : 400;
    return withCors(request, Response.json({ ok: false, error: message }, { status }));
  }

  const target = parseTarget(body.target);
  const key = String(body.key ?? "").trim();
  if (!target || !key) {
    return withCors(request, Response.json({ ok: false, error: "Нужны target и key" }, { status: 400 }));
  }

  try {
    const result = await restoreFromBackup(target, key);
    return withCors(request, Response.json(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "restore_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
