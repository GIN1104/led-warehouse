import { getDb } from "@/lib/db";
import { listAlerts } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const filter = status === "open" || status === "ack" || status === "closed" ? status : undefined;
  const alerts = listAlerts(getDb(), filter).map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    message: row.message,
    order_id: row.orderId,
    sku_id: row.skuId,
    created_at: row.createdAt,
  }));
  return Response.json({ alerts });
}
