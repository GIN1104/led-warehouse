import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { saveExternalHire } from "@/lib/services/ledger";
import { listExternalHires } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  order_id: z.string().min(1),
  sku_id: z.string().min(1),
  qty: z.number().int().positive(),
  supplier_note: z.string().optional(),
  status: z.enum(["needed", "ordered", "received", "closed"]).optional(),
});

export function GET() {
  const hires = listExternalHires(getDb()).map((row) => ({
    id: row.id,
    order_id: row.orderId,
    sku_code: row.skuCode,
    qty: row.qty,
    status: row.status,
    supplier_note: row.supplierNote,
  }));
  return Response.json({ external_hires: hires });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session.role !== "manager" && session.role !== "admin") {
    return Response.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Некорректная заявка" }, { status: 400 });
  try {
    const id = saveExternalHire(
      getDb(),
      {
        orderId: parsed.data.order_id,
        skuId: parsed.data.sku_id,
        qty: parsed.data.qty,
        supplierNote: parsed.data.supplier_note,
        status: parsed.data.status,
      },
      session.id,
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
