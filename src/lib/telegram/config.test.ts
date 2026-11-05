import { describe, expect, it } from "vitest";
import { getTelegramAdminChatIds, hasTelegramBotToken } from "@/lib/telegram/config";

describe("telegram config", () => {
  it("парсит TELEGRAM_ADMIN_CHAT_IDS", () => {
    expect(getTelegramAdminChatIds({ TELEGRAM_ADMIN_CHAT_IDS: "12345, 67890" })).toEqual(["12345", "67890"]);
    expect(getTelegramAdminChatIds({ TELEGRAM_ADMIN_CHAT_IDS: "bad,12" })).toEqual([]);
    expect(hasTelegramBotToken({ TELEGRAM_BOT_TOKEN: "" })).toBe(false);
    expect(hasTelegramBotToken({ TELEGRAM_BOT_TOKEN: "1:ABC" })).toBe(true);
  });
});
