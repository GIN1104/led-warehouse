/** Ключ входа в календарь в этом браузере. Секрет клиента сюда не кладём. */
export const GOOGLE_TOKEN_KEY = "led-warehouse:google-access-token";
export const GOOGLE_CONNECTED_KEY = "led-warehouse:google-calendar";

export type StoredGoogleToken = {
  accessToken: string;
  expiresAt: number;
};

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const SKEW_MS = 30_000;

export function readStoredGoogleToken(storage: KeyValueStore | undefined, now = Date.now()): StoredGoogleToken | null {
  if (!storage) return null;
  const raw = storage.getItem(GOOGLE_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGoogleToken;
    if (!parsed.accessToken || typeof parsed.expiresAt !== "number") {
      storage.removeItem(GOOGLE_TOKEN_KEY);
      return null;
    }
    if (now >= parsed.expiresAt - SKEW_MS) {
      storage.removeItem(GOOGLE_TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(GOOGLE_TOKEN_KEY);
    return null;
  }
}

export function writeStoredGoogleToken(storage: KeyValueStore | undefined, token: StoredGoogleToken): void {
  storage?.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(token));
  storage?.setItem(GOOGLE_CONNECTED_KEY, "1");
}

export function clearStoredGoogleToken(storage: KeyValueStore | undefined): void {
  storage?.removeItem(GOOGLE_TOKEN_KEY);
  storage?.removeItem(GOOGLE_CONNECTED_KEY);
}

export function browserTokenStorage(): KeyValueStore | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}
