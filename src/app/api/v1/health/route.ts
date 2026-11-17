import { tursoEnabled } from "@/lib/db/turso";
import { corsPreflight, withCors } from "@/lib/api/cors";
import { sharedLedger } from "@/lib/api";
import { driveBackupStatus } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ops probe: shared/Turso flags without leaking credentials. */
export async function GET(request: Request) {
  const drive = driveBackupStatus();
  return withCors(
    request,
    Response.json({
      ok: true,
      shared: sharedLedger,
      tursoConfigured: tursoEnabled(),
      accessApi: true,
      backups: {
        drive: drive.configured,
      },
    }),
  );
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
