import { getTelegramBotToken, hasTelegramBotToken } from "@/lib/telegram/config";
import { sendTelegramMessage } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { chatId, text } → sent через Bot API или mock без TELEGRAM_BOT_TOKEN. */
export async function POST(request: Request) {
  let body: { chatId?: string; text?: string; outboxId?: string };
  try {
    body = (await request.json()) as { chatId?: string; text?: string; outboxId?: string };
  } catch {
    return Response.json({ error: "Нужен JSON { chatId, text }" }, { status: 400 });
  }
  const chatId = String(body.chatId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!chatId || !text) {
    return Response.json({ error: "Нужны chatId и text", reason: "invalid" }, { status: 400 });
  }

  if (!hasTelegramBotToken()) {
    return Response.json({
      ok: true,
      mode: "mock",
      chatId,
      outboxId: body.outboxId ?? null,
      hint: "Задайте TELEGRAM_BOT_TOKEN в окружении сервера (не в Pages).",
    });
  }

  const result = await sendTelegramMessage({
    chatId,
    text,
    token: getTelegramBotToken(),
  });
  if (result.mode === "sent") {
    return Response.json({ ok: true, mode: "sent", chatId, outboxId: body.outboxId ?? null });
  }
  return Response.json(
    { ok: false, mode: "mock", error: result.error ?? "send_failed", chatId },
    { status: 502 },
  );
}

/** GET — статус конфигурации (без утечки токена). */
export async function GET() {
  return Response.json({
    configured: hasTelegramBotToken(),
    hint: hasTelegramBotToken()
      ? "TELEGRAM_BOT_TOKEN задан — notify отправит в Telegram."
      : "TELEGRAM_BOT_TOKEN пуст — mock/outbox без реальной отправки.",
  });
}
