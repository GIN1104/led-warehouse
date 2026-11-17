import { corsPreflight, withCors } from "@/lib/api/cors";
import { assertOwnerOrCron, parseTarget, readActorEmail } from "@/lib/backup/http";
import { downloadBackup } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/** GET ?target=r2|drive&key=…&actorEmail=… — скачать dump (owner). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const actorEmail = readActorEmail(request, url.searchParams.get("actorEmail"));
  try {
    assertOwnerOrCron(request, actorEmail, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 403 }));
  }

  const target = parseTarget(url.searchParams.get("target"));
  const key = String(url.searchParams.get("key") ?? "").trim();
  if (!target || !key) {
    return withCors(request, Response.json({ ok: false, error: "Нужны target и key" }, { status: 400 }));
  }

  try {
    const { bytes, name } = await downloadBackup(target, key);
    return withCors(
      request,
      new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
          "Cache-Control": "no-store",
        },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "download_failed";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 500 }));
  }
}
