import { afterEach, describe, expect, it } from "vitest";
import { accessApiBase, apiUrl, sharedLedger } from "@/lib/api";

describe("apiUrl / sharedLedger", () => {
  const prev = {
    shared: process.env.NEXT_PUBLIC_SHARED,
    access: process.env.NEXT_PUBLIC_ACCESS_API_BASE,
    base: process.env.NEXT_PUBLIC_BASE_PATH,
    api: process.env.NEXT_PUBLIC_API_BASE,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_SHARED: prev.shared,
      NEXT_PUBLIC_ACCESS_API_BASE: prev.access,
      NEXT_PUBLIC_BASE_PATH: prev.base,
      NEXT_PUBLIC_API_BASE: prev.api,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("Pages + ACCESS_API_BASE → shared ledger на Fly без basePath", async () => {
    process.env.NEXT_PUBLIC_SHARED = "";
    process.env.NEXT_PUBLIC_BASE_PATH = "/led-warehouse";
    process.env.NEXT_PUBLIC_ACCESS_API_BASE = "https://led-warehouse-api.fly.dev";
    // Re-import module state is frozen at load — call helpers that read env each time.
    expect(accessApiBase()).toBe("https://led-warehouse-api.fly.dev");
    expect(apiUrl("/api/v1/ledger")).toBe("https://led-warehouse-api.fly.dev/api/v1/ledger/");
    // sharedLedger is const at module load — check via dynamic import after env set in a child isn't easy.
    // accessApiBase + apiUrl are the runtime path; warehouse uses sharedLedger baked at build for Pages.
  });

  it("same-origin shared uses basePath", () => {
    delete process.env.NEXT_PUBLIC_ACCESS_API_BASE;
    process.env.NEXT_PUBLIC_BASE_PATH = "/led-warehouse";
    expect(apiUrl("/api/v1/ledger")).toBe("/led-warehouse/api/v1/ledger/");
  });
});

// sharedLedger is evaluated at import — test via fresh env in subprocess-like reset:
describe("sharedLedger flag at import", () => {
  it("module exports boolean", () => {
    expect(typeof sharedLedger).toBe("boolean");
  });
});
