import { tursoEnabled } from "@/lib/db/turso";
import { corsPreflight, withCors } from "@/lib/api/cors";
import { sharedLedger } from "@/lib/api";
import { targetStatus } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ops probe: shared/Turso flags without leaking credentials. */
export async function GET(request: Request) {
  const backups = targetStatus();
  return withCors(
    request,
    Response.json({
      ok: true,
      shared: sharedLedger,
      tursoConfigured: tursoEnabled(),
      accessApi: true,
      backups: {
        r2: backups.r2.configured,
        drive: backups.drive.configured,
      },
    }),
  );
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
