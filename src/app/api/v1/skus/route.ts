import { getDb } from "@/lib/db";
import { listSkuSummaries } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const skus = listSkuSummaries(getDb()).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    track_mode: row.trackMode,
    qty_on_hand: row.onHand,
    qty_reserved_today: row.reservedToday,
    qty_available_today: row.availableToday,
    qty_shortage: row.shortage,
  }));
  return Response.json({ skus });
}
