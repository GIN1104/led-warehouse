import { corsPreflight, withCors } from "@/lib/api/cors";
import { runBackupJob } from "@/lib/backup/job";
import { assertOwnerOrCron, readActorEmail } from "@/lib/backup/http";
import { driveBackupStatus, listBackups } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/** GET — список dump на Google Drive (owner). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const actorEmail = readActorEmail(request, url.searchParams.get("actorEmail"));
  try {
    assertOwnerOrCron(request, actorEmail, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 403 }));
  }

  try {
    const backups = await listBackups();
    return withCors(
      request,
      Response.json({
        ok: true,
        status: driveBackupStatus(),
        backups,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "list_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}

/** POST — on-demand backup на Drive (owner или BACKUP_CRON_SECRET). */
export async function POST(request: Request) {
  let body: { actorEmail?: string } = {};
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
    const result = await runBackupJob();
    return withCors(request, Response.json({ ...result, status: driveBackupStatus() }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "backup_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
