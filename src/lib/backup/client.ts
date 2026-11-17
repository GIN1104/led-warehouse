import { apiUrl, sharedLedger } from "@/lib/api";
import type { BackupTarget } from "@/lib/backup/config";
import type { BackupEntry } from "@/lib/backup/store";

export type BackupStatusResponse = {
  ok: boolean;
  status?: {
    r2: { configured: boolean; mode: "live" | "mock" };
    drive: { configured: boolean; mode: "live" | "mock" };
  };
  backups?: BackupEntry[];
  error?: string;
};

function headers(actorEmail: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Actor-Email": actorEmail,
  };
}

export async function fetchBackupList(actorEmail: string, target: BackupTarget | "all" = "all"): Promise<BackupStatusResponse> {
  if (!sharedLedger) return { ok: false, error: "shared_disabled" };
  const response = await fetch(`${apiUrl("/api/v1/backups")}?target=${encodeURIComponent(target)}&actorEmail=${encodeURIComponent(actorEmail)}`, {
    headers: headers(actorEmail),
    cache: "no-store",
  });
  const data = (await response.json()) as BackupStatusResponse;
  if (!response.ok) return { ok: false, error: data.error ?? `HTTP ${response.status}` };
  return data;
}

export async function postBackupNow(actorEmail: string, targets?: BackupTarget[]): Promise<{ ok: boolean; error?: string }> {
  if (!sharedLedger) return { ok: false, error: "shared_disabled" };
  const response = await fetch(apiUrl("/api/v1/backups"), {
    method: "POST",
    headers: headers(actorEmail),
    body: JSON.stringify({ actorEmail, targets }),
  });
  const data = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) return { ok: false, error: data.error ?? `HTTP ${response.status}` };
  return { ok: true };
}

export async function postRestoreBackup(input: {
  actorEmail: string;
  target: BackupTarget;
  key: string;
  confirm: string;
}): Promise<{ ok: boolean; revision?: number; error?: string }> {
  if (!sharedLedger) return { ok: false, error: "shared_disabled" };
  const response = await fetch(apiUrl("/api/v1/backups/restore"), {
    method: "POST",
    headers: headers(input.actorEmail),
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { ok?: boolean; revision?: number; error?: string };
  if (!response.ok) return { ok: false, error: data.error ?? `HTTP ${response.status}` };
  return { ok: true, revision: data.revision };
}

export function backupDownloadUrl(actorEmail: string, target: BackupTarget, key: string): string {
  const base = apiUrl("/api/v1/backups/download");
  const params = new URLSearchParams({ target, key, actorEmail });
  return `${base}?${params}`;
}
