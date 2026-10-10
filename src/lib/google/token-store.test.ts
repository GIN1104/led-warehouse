import { describe, expect, it } from "vitest";
import {
  GOOGLE_CONNECTED_KEY,
  GOOGLE_TOKEN_KEY,
  clearStoredAccessToken,
  clearStoredGoogleToken,
  hasStoredGoogleConnection,
  readStoredGoogleToken,
  writeStoredGoogleToken,
} from "@/lib/google/token-store";

function memoryStore() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => bag.set(key, value),
    removeItem: (key: string) => bag.delete(key),
  };
}

describe("сохранение входа Google", () => {
  it("помнит токен до срока и забывает после", () => {
    const storage = memoryStore();
    const now = 1_000_000;
    writeStoredGoogleToken(storage, { accessToken: "ya29.test", expiresAt: now + 60_000 });
    expect(readStoredGoogleToken(storage, now)?.accessToken).toBe("ya29.test");
    expect(storage.getItem(GOOGLE_CONNECTED_KEY)).toBe("1");
    expect(readStoredGoogleToken(storage, now + 120_000)).toBeNull();
    expect(storage.getItem(GOOGLE_TOKEN_KEY)).toBeNull();
  });

  it("протухший токен не стирает флаг входа", () => {
    const storage = memoryStore();
    writeStoredGoogleToken(storage, { accessToken: "ya29.test", expiresAt: Date.now() + 60_000 });
    clearStoredAccessToken(storage);
    expect(storage.getItem(GOOGLE_TOKEN_KEY)).toBeNull();
    expect(hasStoredGoogleConnection(storage)).toBe(true);
  });

  it("выход стирает и токен, и флаг", () => {
    const storage = memoryStore();
    writeStoredGoogleToken(storage, { accessToken: "ya29.test", expiresAt: Date.now() + 60_000 });
    clearStoredGoogleToken(storage);
    expect(storage.getItem(GOOGLE_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(GOOGLE_CONNECTED_KEY)).toBeNull();
  });
});
