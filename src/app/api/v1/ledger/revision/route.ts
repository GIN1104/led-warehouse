import { corsPreflight, withCors } from "@/lib/api/cors";
import { currentRevision } from "@/lib/db/file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  const revision = await currentRevision();
  return withCors(
    request,
    Response.json({ revision }, { headers: { "Cache-Control": "no-store" } }),
  );
}
