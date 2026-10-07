import { getDb } from "@/lib/db";
import { listLocationBalances } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const balances = listLocationBalances(getDb()).map((row) => ({
    sku_id: row.skuId,
    sku_code: row.skuCode,
    location_id: row.locationId,
    location_name: row.locationName,
    qty_on_hand: row.qtyOnHand,
    qty_reserved: row.qtyReserved,
  }));
  return Response.json({ balances });
}
