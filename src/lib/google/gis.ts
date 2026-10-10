import { GOOGLE_CALENDAR_SCOPES, googleClientId } from "@/lib/google/config";
import {
  GOOGLE_TOKEN_KEY,
  browserTokenStorage,
  clearStoredGoogleToken,
  readStoredGoogleToken,
  writeStoredGoogleToken,
} from "@/lib/google/token-store";

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
        /** Подсказка аккаунта в окне выбора Google. */
        hint?: string;
        /** Popup — подходит для static export / GitHub Pages без server callback. */
        ux_mode?: "popup" | "redirect";
        redirect_uri?: string;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

/** Токен протух. Вход в этом браузере не сбрасываем. */
export function forgetGoogleAccessToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
  browserTokenStorage()?.removeItem(GOOGLE_TOKEN_KEY);
}

export function clearGoogleAccessToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
  clearStoredGoogleToken(browserTokenStorage());
}

export function getCachedGoogleAccessToken(): string | null {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) return accessToken;
  accessToken = null;
  tokenExpiresAt = 0;
  const stored = readStoredGoogleToken(browserTokenStorage());
  if (!stored) return null;
  accessToken = stored.accessToken;
  tokenExpiresAt = stored.expiresAt;
  return accessToken;
}

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Identity Services только в браузере"));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить Google Identity Services")));
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Не удалось загрузить Google Identity Services"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Запрос access token через GIS Token Client.
 * Без redirect и без hint: иначе Google уводит со страницы склада и кажется, что вход сброшен.
 * Токен лежит в localStorage до конца срока. Новый запрос только по нажатию кнопки.
 */
export async function requestGoogleAccessToken(options?: { prompt?: string }): Promise<string> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new Error("Нет NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  }
  await loadGisScript();
  const cached = getCachedGoogleAccessToken();
  if (cached && options?.prompt !== "consent") return cached;

  const google = window.google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google Identity Services не инициализированы");
  }

  return new Promise((resolve, reject) => {
    // Token Client + public Client ID: client secret не используется (SPA / Pages).
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPES.join(" "),
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Отказ в доступе Google"));
          return;
        }
        accessToken = response.access_token;
        const ttlSec = typeof response.expires_in === "number" ? response.expires_in : 3600;
        tokenExpiresAt = Date.now() + ttlSec * 1000;
        writeStoredGoogleToken(browserTokenStorage(), { accessToken, expiresAt: tokenExpiresAt });
        resolve(accessToken);
      },
      error_callback: (error) => {
        reject(new Error(error.message || error.type || "Ошибка OAuth Google"));
      },
    });
    client.requestAccessToken({ prompt: options?.prompt ?? "" });
  });
}