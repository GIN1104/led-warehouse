/**
 * Публичные настройки Google OAuth для SPA / GitHub Pages.
 * Client secret, service-account JSON и пароль аккаунта сюда не кладём.
 *
 * GIS Token Client (PKCE/public): токен только в памяти вкладки.
 * Origin для Pages: https://gin1104.github.io (без path).
 * basePath приложения: /led-warehouse — redirect URI включает этот path.
 */

/** Аккаунт проекта (Calendar + Drive). Пароль не хранить. */
export const PROJECT_GOOGLE_EMAIL = "ledvision2026.il@gmail.com";

/** Рекомендуемая папка Excel на Drive (создаёт пользователь вручную). */
export const PROJECT_DRIVE_EXCEL_FOLDER = "LED Warehouse / Excel";

/** Публичный OAuth Web Client ID из env (вшивается в production Pages build). */
export function googleClientId(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
}

/**
 * Текущий origin + path для OAuth redirect (с учётом basePath на Pages).
 * Для GIS Token Client popup Google сверяет JS origin; redirect URI тоже лучше добавить в Console.
 */
export function googleOAuthRedirectUri(): string {
  if (typeof window === "undefined") return "";
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  return `${window.location.origin}${base}/calendar/`;
}

/** Минимальные scopes для чтения календаря (MVP). */
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

/** Later: Drive Picker / upload — отдельно, не включать в MVP consent. */
export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file" as const;
