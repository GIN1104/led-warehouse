import { getDb } from "@/lib/db";
import { listLocations } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const locations = listLocations(getDb()).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parent_id: row.parentId,
  }));
  return Response.json({ locations });
}
