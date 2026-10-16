import { DomainError } from "@/lib/domain/errors";
import { enqueueLedger } from "@/lib/db/file-store";
import { isValidEmailShape, normalizeEmail } from "@/lib/email-auth/normalize";
import { BOOTSTRAP_ALLOWLIST, generateOtpCode, isEmailAllowed, OTP_TTL_MS } from "@/lib/email-auth/otp";
import { listDirectoryEmails } from "@/lib/services/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pending = { email: string; code: string; expiresAt: number; attempts: number };

/** In-memory OTP для одного процесса Docker / npm run dev. */
const pendingByEmail = new Map<string, Pending>();

function envAllowlist(): string[] {
  const raw = process.env.AUTH_ALLOWLIST?.trim() ?? "";
  if (!raw) return [];
  return raw.split(",").map((part) => normalizeEmail(part)).filter(Boolean);
}

async function directoryEmails(): Promise<string[]> {
  try {
    const fromDb = await enqueueLedger((db) => listDirectoryEmails(db));
    return [...fromDb, ...envAllowlist()];
  } catch {
    return [...BOOTSTRAP_ALLOWLIST, ...envAllowlist()];
  }
}

async function sendResend(email: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = process.env.AUTH_FROM_EMAIL?.trim() || "LED Warehouse <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Код входа — LED Warehouse",
      text: `Ваш код входа: ${code}\nДействует 10 минут.`,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new DomainError(`Не удалось отправить письмо (${response.status}): ${text.slice(0, 200)}`);
  }
  return true;
}

/** POST { email } → mock code или sent через Resend. Без cookie session. */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return Response.json({ error: "Нужен JSON { email }" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  if (!isValidEmailShape(email)) {
    return Response.json({ error: "Некорректный email", reason: "invalid_email" }, { status: 400 });
  }
  const allowed = isEmailAllowed(email, await directoryEmails());
  if (!allowed) {
    return Response.json({ error: "Email не в списке сотрудников", reason: "not_allowed" }, { status: 403 });
  }

  const code = generateOtpCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  pendingByEmail.set(email, { email, code, expiresAt, attempts: 0 });

  try {
    const sent = await sendResend(email, code);
    if (sent) {
      return Response.json({ ok: true, mode: "sent", email, expiresAt });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка отправки";
    return Response.json({ error: message }, { status: 502 });
  }

  return Response.json({ ok: true, mode: "mock", email, code, expiresAt });
}

/** PUT { email, code } — проверка OTP на сервере (Docker). */
export async function PUT(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return Response.json({ error: "Нужен JSON { email, code }" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  const code = String(body.code ?? "").trim();
  const pending = pendingByEmail.get(email);
  if (!pending) return Response.json({ ok: false, reason: "no_pending" }, { status: 400 });
  if (Date.now() > pending.expiresAt) {
    pendingByEmail.delete(email);
    return Response.json({ ok: false, reason: "expired" }, { status: 400 });
  }
  if (pending.attempts >= 5) {
    pendingByEmail.delete(email);
    return Response.json({ ok: false, reason: "too_many" }, { status: 429 });
  }
  if (code !== pending.code) {
    pending.attempts += 1;
    if (pending.attempts >= 5) pendingByEmail.delete(email);
    return Response.json({ ok: false, reason: "mismatch" }, { status: 401 });
  }
  pendingByEmail.delete(email);
  return Response.json({ ok: true, email });
}
