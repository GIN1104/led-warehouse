import ExcelJS from "exceljs";
import { bumpRevision, enqueueLedger } from "@/lib/db/file-store";
import { DomainError } from "@/lib/domain/errors";
import { isScanAuthorized } from "@/lib/hmac";
import { importMapperOrder } from "@/lib/services/mapper";
import { parseMapperCsv, parseMapperTable, type MapperOrderDraft } from "@/lib/services/mapper-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text;
    if ("result" in value) return cellText((value as { result: unknown }).result);
    if ("richText" in value && Array.isArray((value as { richText: { text?: string }[] }).richText)) {
      return (value as { richText: { text?: string }[] }).richText.map((part) => part.text ?? "").join("");
    }
  }
  return value == null ? "" : String(value);
}

async function readDraft(request: Request): Promise<{ draft: MapperOrderDraft; raw: string; multipart: boolean }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const raw = await request.text();
    return { draft: JSON.parse(raw) as MapperOrderDraft, raw, multipart: false };
  }
  if (type.includes("text/csv") || type.includes("text/plain")) {
    const raw = await request.text();
    return { draft: parseMapperCsv(raw), raw, multipart: false };
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new DomainError("Нужен файл Excel или CSV");
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv")) {
    const raw = buffer.toString("utf8");
    return { draft: parseMapperCsv(raw), raw, multipart: true };
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DomainError("В книге нет листа");
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    rows.push(values.slice(1).map((cell) => cellText(cell)));
  });
  return { draft: parseMapperTable(rows), raw: "", multipart: true };
}

function allowed(request: Request, raw: string, multipart: boolean): boolean {
  const secret = process.env.SCAN_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!multipart) return isScanAuthorized(raw, request.headers.get("x-signature"), secret);
  return request.headers.get("x-ledger-secret") === secret;
}

export async function POST(request: Request) {
  try {
    const { draft, raw, multipart } = await readDraft(request);
    if (!allowed(request, raw, multipart)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await enqueueLedger((db) => {
      const imported = importMapperOrder(db, draft, "mapper");
      const revision = imported.idempotent ? undefined : bumpRevision(db);
      return { imported, revision };
    });
    return Response.json(result.imported, {
      status: result.imported.idempotent ? 200 : 201,
      headers: result.revision === undefined ? undefined : { "X-Revision": String(result.revision) },
    });
  } catch (error) {
    const message = error instanceof DomainError ? error.message : error instanceof Error ? error.message : "Не удалось принять заказ";
    return Response.json({ error: message }, { status: 400 });
  }
}
