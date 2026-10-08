import { currentRevision } from "@/lib/db/file-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const revision = await currentRevision();
  return Response.json({ revision }, { headers: { "Cache-Control": "no-store" } });
}
