import { describe, expect, it, vi } from "vitest";
import { createDb } from "@/lib/db/memory";
import { createAccessRequest } from "@/lib/services/access-requests";
import { createPerson } from "@/lib/services/people";
import {
  flushTelegramOutbox,
  listTelegramOutbox,
  notifyAccessRequestTelegram,
  notifyOrderPhaseTelegram,
  notifyTransferTelegram,
  sendTelegramMessage,
} from "@/lib/telegram/notify";

describe("telegram notify + outbox", () => {
  it("без получателей пишет skipped; с chatId — mock", () => {
    const db = createDb();
    const skipped = notifyAccessRequestTelegram(db, "new@company.com");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.mode).toBe("skipped");

    createPerson(db, {
      name: "Дмитрий TG",
      role: "manager",
      email: "dm-tg@led.local",
      telegramUsername: "dm_manager",
      telegramChatId: "987654321",
    });
    const mocked = notifyAccessRequestTelegram(db, "another@company.com");
    expect(mocked).toHaveLength(1);
    expect(mocked[0]).toMatchObject({
      mode: "mock",
      kind: "access_request",
      chatId: "987654321",
      username: "dm_manager",
    });
    expect(listTelegramOutbox(db).length).toBeGreaterThanOrEqual(2);
  });

  it("createAccessRequest ставит outbox", () => {
    const db = createDb();
    createPerson(db, {
      name: "Admin TG",
      role: "admin",
      email: "admin-tg@led.local",
      telegramChatId: "111222333",
    });
    createAccessRequest(db, "guest@x.com");
    const rows = listTelegramOutbox(db);
    expect(rows.some((row) => row.kind === "access_request" && row.payload.includes("guest@x.com"))).toBe(true);
  });

  it("sendTelegramMessage без токена — mock; с токеном — sent", async () => {
    const bare = await sendTelegramMessage({ chatId: "1", text: "hi", token: "" });
    expect(bare.mode).toBe("mock");

    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sent = await sendTelegramMessage({
      chatId: "1",
      text: "hi",
      token: "123:ABC",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(sent.mode).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("transfer и order_phase пишут outbox", () => {
    const db = createDb();
    createPerson(db, {
      name: "М",
      role: "manager",
      email: "m2@led.local",
      telegramChatId: "555666777",
    });
    const transfer = notifyTransferTelegram(db, {
      action: "shipped",
      skuCode: "CAB-P25",
      qty: 2,
      fromName: "Склад",
      toName: "Площадка",
      transferId: "tr_test",
    });
    expect(transfer[0]).toMatchObject({ kind: "transfer", mode: "mock", chatId: "555666777" });
    const phase = notifyOrderPhaseTelegram(db, {
      orderId: "ord_1",
      customerName: "Клиент",
      fromPhase: "planning",
      toPhase: "mount",
    });
    expect(phase[0]).toMatchObject({ kind: "order_phase", mode: "mock" });
    expect(phase[0]?.payload).toContain("planning → mount");
  });

  it("flush на Pages (без shared) не меняет mock", async () => {
    const db = createDb();
    createPerson(db, {
      name: "М",
      role: "manager",
      email: "m@led.local",
      telegramChatId: "420000001",
    });
    notifyAccessRequestTelegram(db, "z@led.local");
    const result = await flushTelegramOutbox(db, {
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ mode: "sent" }), { status: 200 })) as unknown as typeof fetch,
    });
    expect(result.sent).toBe(0);
    expect(listTelegramOutbox(db)[0]?.mode).toBe("mock");
  });
});
