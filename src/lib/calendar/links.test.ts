import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/calendar/links";
import { mapGoogleEvents } from "@/lib/google/map-events";

describe("ссылки события Google", () => {
  it("выделяет адрес и оставляет точку после него текстом", () => {
    const parts = linkify("Схема: https://example.com/a/very/long/path. Готово");
    expect(parts).toEqual([
      { kind: "text", text: "Схема: " },
      { kind: "link", text: "https://example.com/a/very/long/path", href: "https://example.com/a/very/long/path" },
      { kind: "text", text: ". Готово" },
    ]);
  });

  it("кладёт ссылку встречи и карточку Google в событие", () => {
    const [item] = mapGoogleEvents([
      {
        id: "evt",
        summary: "Площадка",
        description: "Макет https://files.example.com/screen",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        htmlLink: "https://www.google.com/calendar/event?eid=abc",
        start: { date: "2026-10-12" },
        end: { date: "2026-10-13" },
      },
    ]);
    expect(item?.href).toBe("https://www.google.com/calendar/event?eid=abc");
    expect(item?.note).toContain("https://files.example.com/screen");
    expect(item?.note).toContain("https://meet.google.com/abc-defg-hij");
    expect(item?.endDate).toBe("2026-10-12");
  });
});
