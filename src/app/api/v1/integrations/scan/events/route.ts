import { z } from "zod";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { isScanAuthorized } from "@/lib/hmac";
import { ingestScan, type IncomingScan } from "@/lib/services/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  event_id: z.string().min(1),
  source: z.string().min(1),
  code: z.string().optional(),
  sku_hint: z.string().optional(),
  direction: z.enum(["in", "out", "move"]),
  qty: z.number().int().positive().optional(),
  device_id: z.string().optional(),
  location_id: z.string().optional(),
  from_location_id: z.string().optional(),
  at: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.union([eventSchema, z.object({ events: z.array(eventSchema).min(1).max(100) })]);

export async function POST(request: Request) {
  const raw = await request.text();
  if (!isScanAuthorized(raw, request.headers.get("x-signature"), process.env.SCAN_WEBHOOK_SECRET)) {
    return Response.json({ error: "Неверная подпись" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Некорректное событие скана" }, { status: 400 });

  const events = "events" in parsed.data ? parsed.data.events : [parsed.data];
  try {
    const results = events.map((event) => {
      const incoming: IncomingScan = {
        eventId: event.event_id,
        source: event.source,
        code: event.code ?? event.sku_hint ?? "",
        direction: event.direction,
        qty: event.qty ?? 1,
        deviceId: event.device_id,
        locationId: event.location_id,
        fromLocationId: event.from_location_id,
        meta: event.meta,
        at: event.at,
      };
      return ingestScan(getDb(), incoming, "api");
    });
    return Response.json({ results });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
