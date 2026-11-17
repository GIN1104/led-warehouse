import { corsPreflight, withCors } from "@/lib/api/cors";
import { assertOwnerOrCron, readActorEmail } from "@/lib/backup/http";
import { downloadBackup } from "@/lib/backup/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

/** GET ?key=…&actorEmail=… — скачать dump с Drive (owner). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const actorEmail = readActorEmail(request, url.searchParams.get("actorEmail"));
  try {
    assertOwnerOrCron(request, actorEmail, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forbidden";
    return withCors(request, Response.json({ ok: false, error: message }, { status: 403 }));
  }

  const key = String(url.searchParams.get("key") ?? "").trim();
  if (!key) {
    return withCors(request, Response.json({ ok: false, error: "Нужен key" }, { status: 400 }));
  }

  try {
    const { bytes, name } = await downloadBackup(key);
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
