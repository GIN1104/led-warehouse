import { DomainError } from "@/lib/domain/errors";
import { enqueueLedger } from "@/lib/db/file-store";
import { isValidEmailShape, normalizeEmail } from "@/lib/email-auth/normalize";
import {
  createAccessRequest,
  findPendingRequest,
  isEmailActivelyAllowed,
  listAccessRequests,
  type AccessRequestRow,
} from "@/lib/services/access-requests";
import { getTelegramAdminChatIds, getTelegramBotToken, hasTelegramBotToken } from "@/lib/telegram/config";
import { listTelegramNotifyRecipients, sendTelegramMessage } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function deliverAccessTelegram(email: string) {
  const { chatIds, text } = await enqueueLedger((db) => {
    const ids = [...getTelegramAdminChatIds()];
    for (const user of listTelegramNotifyRecipients(db)) {
      if (user.telegramChatId) ids.push(user.telegramChatId);
    }
    return {
      chatIds: [...new Set(ids)],
      text: `LED Warehouse: заявка на доступ от ${email}`,
    };
  });
  let sent = 0;
  if (!hasTelegramBotToken() || chatIds.length === 0) {
    return { attempted: chatIds.length, sent: 0, mode: "mock" as const };
  }
  const token = getTelegramBotToken();
  for (const chatId of chatIds) {
    const result = await sendTelegramMessage({ chatId, text, token });
    if (result.mode === "sent") sent += 1;
  }
  return { attempted: chatIds.length, sent, mode: sent > 0 ? ("sent" as const) : ("mock" as const) };
}

/** GET ?status=pending — список заявок из shared SQLite/Turso. */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const requests = await enqueueLedger((db) =>
    listAccessRequests(
      db,
      status === "pending" || status === "approved" || status === "rejected" ? { status } : undefined,
    ),
  );
  return Response.json({
    ok: true,
    shared: true,
    requests,
    telegramConfigured: hasTelegramBotToken(),
    adminChatIds: getTelegramAdminChatIds().length,
  });
}

/** POST { email } — создать pending в shared ledger + Telegram админам. */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return Response.json({ error: "Нужен JSON { email }" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  if (!isValidEmailShape(email)) {
    return Response.json({ error: "Некорректный email", reason: "invalid_email" }, { status: 400 });
  }

  try {
    const result = await enqueueLedger((db) => {
      if (isEmailActivelyAllowed(db, email)) {
        return { mode: "allowed" as const, request: null as AccessRequestRow | null };
      }
      const existing = findPendingRequest(db, email);
      if (existing) return { mode: "existing" as const, request: existing };
      const created = createAccessRequest(db, email);
      return { mode: "created" as const, request: created };
    });

    const telegram =
      result.mode === "created" || result.mode === "existing"
        ? await deliverAccessTelegram(email)
        : { attempted: 0, sent: 0, mode: "mock" as const };

    return Response.json({ ok: true, mode: result.mode, request: result.request, telegram });
  } catch (error) {
    const message = error instanceof DomainError ? error.message : error instanceof Error ? error.message : "error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
