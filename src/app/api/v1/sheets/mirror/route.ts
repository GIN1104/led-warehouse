import { enqueueLedger } from "@/lib/db/file-store";
import { buildSheetsMirrorSnapshot, getSheetsMirrorWebhook, pushSheetsMirror } from "@/lib/sheets/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — собрать снимок ledger и опционально отправить в SHEETS_MIRROR_WEBHOOK_URL. */
export async function POST() {
  const snapshot = await enqueueLedger((db) => buildSheetsMirrorSnapshot(db));
  const webhook = getSheetsMirrorWebhook();
  if (!webhook) {
    return Response.json({
      ok: true,
      mode: "mock",
      generatedAt: snapshot.generatedAt,
      tables: Object.keys(snapshot.tables),
      hint: "Задайте SHEETS_MIRROR_WEBHOOK_URL для one-way mirror в Google Sheets / Apps Script. Source of truth — SQLite/Turso.",
      sampleRows: Object.fromEntries(
        Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length]),
      ),
    });
  }
  try {
    const result = await pushSheetsMirror(snapshot, { webhookUrl: webhook });
    return Response.json({
      ok: true,
      mode: result.mode,
      generatedAt: snapshot.generatedAt,
      tables: Object.keys(snapshot.tables),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "mirror_failed";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({
    configured: Boolean(getSheetsMirrorWebhook()),
    hint: "Production shared DB = Docker/Turso. Sheets mirror optional one-way export via SHEETS_MIRROR_WEBHOOK_URL.",
  });
}
