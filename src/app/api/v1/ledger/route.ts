import { exportLedger, replaceLedger } from "@/lib/db/file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await exportLedger();
  return new Response(Buffer.from(snapshot.bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Revision": String(snapshot.revision),
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(request: Request) {
  const base = Number(request.headers.get("x-base-revision"));
  if (!Number.isInteger(base)) {
    return Response.json({ error: "Нужен заголовок X-Base-Revision" }, { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const result = await replaceLedger(base, bytes);
  if (!result.ok) {
    return Response.json({ error: "conflict", revision: result.revision }, { status: 409, headers: { "X-Revision": String(result.revision) } });
  }
  return new Response(null, { status: 204, headers: { "X-Revision": String(result.revision) } });
}
