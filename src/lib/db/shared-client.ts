import { apiUrl } from "@/lib/api";
import { exportSqlBytes, openSqlFromBytes } from "@/lib/db/browser";
import type { Sql } from "@/lib/db/sql";

let revision = 0;

export function knownRevision(): number {
  return revision;
}

export async function openSharedDb(): Promise<Sql> {
  const response = await fetch(apiUrl("/api/v1/ledger"), { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось открыть общий учёт");
  revision = Number(response.headers.get("X-Revision") ?? "0");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return openSqlFromBytes(bytes);
}

export async function pushSharedDb(): Promise<"ok" | "conflict"> {
  const response = await fetch(apiUrl("/api/v1/ledger"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Base-Revision": String(revision),
    },
    body: exportSqlBytes().slice(),
  });
  if (response.status === 409) return "conflict";
  if (!response.ok) throw new Error("Не удалось записать общий учёт");
  revision = Number(response.headers.get("X-Revision") ?? String(revision + 1));
  return "ok";
}

export async function remoteRevision(): Promise<number> {
  const response = await fetch(apiUrl("/api/v1/ledger/revision"), { cache: "no-store" });
  if (!response.ok) return revision;
  const body = (await response.json()) as { revision: number };
  return body.revision;
}
