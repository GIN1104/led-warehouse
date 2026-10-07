import { getDb } from "@/lib/db";
import { listOrders } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const orders = listOrders(getDb()).map((row) => ({
    id: row.id,
    customer_name: row.customerName,
    start_date: row.startDate,
    end_date: row.endDate,
    status: row.status,
    notes: row.notes,
    line_count: row.lineCount,
    qty_shortage: row.shortage,
  }));
  return Response.json({ orders });
}
