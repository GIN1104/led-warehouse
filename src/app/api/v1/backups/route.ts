import { corsPreflight, withCors } from "@/lib/api/cors";
import { runBackupJob } from "@/lib/backup/job";
import { assertOwnerOrCron, parseTarget, parseTargets, readActorEmail } from "@/lib/backup/http";
import { listBackups, targetStatus } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/** GET — список dump (owner). ?target=r2|drive|all */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const actorEmail = readActorEmail(request, url.searchParams.get("actorEmail"));
  try {
    assertOwnerOrCron(request, actorEmail, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 403 }));
  }

  const rawTarget = url.searchParams.get("target") ?? "all";
  const single = parseTarget(rawTarget);
  try {
    const backups = await listBackups(single ?? "all");
    return withCors(
      request,
      Response.json({
        ok: true,
        status: targetStatus(),
        backups,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "list_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}

/** POST — on-demand backup (owner или BACKUP_CRON_SECRET). */
export async function POST(request: Request) {
  let body: { actorEmail?: string; targets?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const actorEmail = readActorEmail(request, body.actorEmail);
  try {
    assertOwnerOrCron(request, actorEmail, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 403 }));
  }

  try {
    const result = await runBackupJob({ targets: parseTargets(body.targets) ?? undefined });
    return withCors(request, Response.json({ ...result, status: targetStatus() }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "backup_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
