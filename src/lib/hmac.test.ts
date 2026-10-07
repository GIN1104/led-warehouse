import { describe, expect, it } from "vitest";
import { isScanAuthorized, signBody } from "@/lib/hmac";

describe("hmac скана", () => {
  it("проверяет подпись тела", () => {
    const body = '{"events":[]}';
    const signature = signBody(body, "secret");
    expect(isScanAuthorized(body, signature, "secret")).toBe(true);
    expect(isScanAuthorized(body, signature, "other")).toBe(false);
    expect(isScanAuthorized(body, null, "secret")).toBe(false);
  });

  it("без секрета пропускает запрос", () => {
    expect(isScanAuthorized("{}", null, undefined)).toBe(true);
  });
});
