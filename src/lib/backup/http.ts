import { getBackupCronSecret } from "@/lib/backup/config";
import { assertBackupOwnerEmail } from "@/lib/backup/owner";
import { normalizeEmail } from "@/lib/email-auth/normalize";

export function readActorEmail(request: Request, bodyEmail?: string | null): string {
  const header = request.headers.get("x-actor-email") ?? "";
  return normalizeEmail(header || bodyEmail || "");
}

/** Owner email ИЛИ Bearer BACKUP_CRON_SECRET (только для create). */
export function assertOwnerOrCron(request: Request, actorEmail: string, forCreate: boolean): "owner" | "cron" {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const cron = getBackupCronSecret();
  if (forCreate && cron && bearer && bearer === cron) return "cron";
  assertBackupOwnerEmail(actorEmail);
  return "owner";
}
