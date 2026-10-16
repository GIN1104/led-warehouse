"use client";

import { useState, type FormEvent } from "react";
import { useEmailAuth } from "@/components/auth-gate";
import { useI18n } from "@/components/i18n";
import { Field, Flash, buttonClass, controlClass } from "@/components/ui";
import { BOOTSTRAP_ALLOWLIST } from "@/lib/email-auth/otp";
import type { MessageKey } from "@/lib/i18n/messages";

type Step = "email" | "code";

function reasonKey(reason: string): MessageKey {
  switch (reason) {
    case "not_allowed":
      return "login.errNotAllowed";
    case "invalid_email":
      return "login.errInvalidEmail";
    case "expired":
      return "login.errExpired";
    case "mismatch":
      return "login.errMismatch";
    case "too_many":
      return "login.errTooMany";
    case "no_pending":
      return "login.errNoPending";
    default:
      return "login.errGeneric";
  }
}

export default function LoginPage() {
  const { requestCode, verifyCode } = useEmailAuth();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [mockCode, setMockCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});

  async function onEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFlash({});
    try {
      const result = await requestCode(email);
      if (!result.ok) {
        setFlash({ error: t(reasonKey(result.reason)) });
        return;
      }
      setEmail(result.email);
      if (result.mode === "mock") {
        setMockCode(result.code);
        setFlash({ ok: t("login.mockHint") });
      } else {
        setMockCode(null);
        setFlash({ ok: t("login.sentHint") });
      }
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function onCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFlash({});
    try {
      const result = await verifyCode(email, code);
      if (!result.ok) {
        setFlash({ error: t(reasonKey(result.reason)) });
        return;
      }
      setFlash({ ok: t("login.ok") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_#f3ebe0_0%,_#e8dfd0_45%,_#d9cfc0_100%)]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">{t("login.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">LED Warehouse</h1>
        <p className="mt-2 text-sm text-ink/65">{t("login.description")}</p>

        <div className="mt-8 rounded-lg border border-line bg-white/90 p-5 shadow-sm">
          <Flash error={flash.error} ok={flash.ok} />

          {step === "email" ? (
            <form onSubmit={(event) => void onEmail(event)} className="flex flex-col gap-3">
              <Field label={t("login.email")}>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={controlClass}
                  required
                  maxLength={120}
                  placeholder="dmitry@led.local"
                />
              </Field>
              <button type="submit" disabled={busy} className={buttonClass("primary")}>
                {busy ? t("login.sending") : t("login.sendCode")}
              </button>
            </form>
          ) : (
            <form onSubmit={(event) => void onCode(event)} className="flex flex-col gap-3">
              <p className="text-sm text-ink/70">
                {t("login.codeFor")} <span className="font-medium text-ink">{email}</span>
              </p>
              {mockCode ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-lg tracking-widest text-ink">
                  {t("login.yourCode")}: {mockCode}
                </p>
              ) : null}
              <Field label={t("login.code")}>
                <input
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={controlClass}
                  required
                  minLength={6}
                  maxLength={6}
                  placeholder="000000"
                />
              </Field>
              <button type="submit" disabled={busy || code.length !== 6} className={buttonClass("primary")}>
                {busy ? t("login.checking") : t("login.submit")}
              </button>
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setMockCode(null);
                  setFlash({});
                }}
              >
                {t("login.back")}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-xs leading-5 text-ink/50">
          {t("login.demoHint", { emails: BOOTSTRAP_ALLOWLIST.join(", ") })}
        </p>
      </div>
    </div>
  );
}
