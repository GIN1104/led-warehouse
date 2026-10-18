"use client";

import { useState, type FormEvent } from "react";
import { useEmailAuth } from "@/components/auth-gate";
import { useI18n } from "@/components/i18n";
import { Field, Flash, buttonClass, controlClass } from "@/components/ui";
import { LOGIN_HINT_EMAILS } from "@/lib/email-auth/otp";

type Step = "email" | "pending";

export default function LoginPage() {
  const { requestAccess } = useEmailAuth();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});

  async function submitEmail(raw: string) {
    setBusy(true);
    setFlash({});
    try {
      const result = await requestAccess(raw);
      if (result.kind === "invalid_email") {
        setFlash({ error: t("login.errInvalidEmail") });
        return;
      }
      if (result.kind === "logged_in") {
        setEmail(result.email);
        setFlash({ ok: t("login.ok") });
        return;
      }
      if (result.kind === "pending") {
        setEmail(result.email);
        setStep("pending");
        setFlash({ ok: t("login.pendingHint") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onEmail(event: FormEvent) {
    event.preventDefault();
    await submitEmail(email);
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
                  placeholder="you@company.com"
                />
              </Field>
              <button type="submit" disabled={busy} className={buttonClass("primary")}>
                {busy ? t("login.sending") : t("login.requestAccess")}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink/70">
                {t("login.pendingFor")} <span className="font-medium text-ink">{email}</span>
              </p>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-ink">
                {t("login.pendingBody")}
              </p>
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() => {
                  setStep("email");
                  setFlash({});
                }}
              >
                {t("login.back")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={buttonClass("primary")}
                onClick={() => void submitEmail(email)}
              >
                {busy ? t("login.checking") : t("login.checkAgain")}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs leading-5 text-ink/50">
          {t("login.demoHint", { emails: LOGIN_HINT_EMAILS.join(", ") })}
        </p>
      </div>
    </div>
  );
}
