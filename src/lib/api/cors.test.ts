import { afterEach, describe, expect, it } from "vitest";
import { accessCorsOrigins, corsHeaders, withCors } from "@/lib/api/cors";

describe("CORS для Pages → ACCESS_API_BASE", () => {
  afterEach(() => {
    delete process.env.ACCESS_CORS_ORIGINS;
  });

  it("разрешает github pages origin по умолчанию и expose X-Revision", () => {
    expect(accessCorsOrigins()).toContain("https://gin1104.github.io");
    const headers = corsHeaders(
      new Request("http://api.example/health", {
        headers: { Origin: "https://gin1104.github.io" },
      }),
    ) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://gin1104.github.io");
    expect(headers["Access-Control-Expose-Headers"]).toBe("X-Revision");
  });

  it("не отражает чужой Origin", () => {
    const headers = corsHeaders(
      new Request("http://api.example/health", {
        headers: { Origin: "https://evil.example" },
      }),
    ) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("добавляет ACCESS_CORS_ORIGINS", () => {
    process.env.ACCESS_CORS_ORIGINS = "https://custom.example";
    expect(accessCorsOrigins()).toContain("https://custom.example");
  });

  it("withCors сохраняет JSON body", async () => {
    const response = withCors(
      new Request("http://api.example/x", { headers: { Origin: "https://gin1104.github.io" } }),
      Response.json({ ok: true }),
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://gin1104.github.io");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
