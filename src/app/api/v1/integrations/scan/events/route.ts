import { bumpRevision, enqueueLedger } from "@/lib/db/file-store";
import { DomainError } from "@/lib/domain/errors";
import { isScanAuthorized } from "@/lib/hmac";
import { ingestScan, type IncomingScan } from "@/lib/services/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanBody = IncomingScan | { events: IncomingScan[] };

export async function POST(request: Request) {
  const raw = await request.text();
  if (!isScanAuthorized(raw, request.headers.get("x-signature"), process.env.SCAN_WEBHOOK_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: ScanBody;
  try {
    body = JSON.parse(raw) as ScanBody;
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const events = "events" in body && Array.isArray(body.events) ? body.events : [body as IncomingScan];
  try {
    const results = await enqueueLedger((db) => {
      const applied = events.map((event) => ingestScan(db, event, "gate"));
      const changed = applied.some((result) => result.status === "accepted" && !result.idempotent);
      const revision = changed ? bumpRevision(db) : undefined;
      return { applied, revision };
    });
    return Response.json(
      { results: results.applied },
      { headers: results.revision === undefined ? undefined : { "X-Revision": String(results.revision) } },
    );
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "Скан не принят";
    return Response.json({ error: message }, { status: 400 });
  }
}
