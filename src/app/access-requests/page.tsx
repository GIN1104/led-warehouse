"use client";

import { useState, type FormEvent } from "react";
import { useEmailAuth } from "@/components/auth-gate";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { DEFAULT_TEMP_ACCESS_DAYS, TEMP_ACCESS_DAY_OPTIONS } from "@/lib/email-auth/temp-access";
import { translateError } from "@/lib/i18n/messages";
import {
  addAllowedEmailManual,
  approveAccessRequest,
  canManageAccess,
  listAccessRequests,
  listAllowedEmails,
  rejectAccessRequest,
  revokeAllowedEmail,
} from "@/lib/services/access-requests";

function formatWhen(ts: number, lang: string): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(lang === "he" ? "he-IL" : lang === "en" ? "en-GB" : "ru-RU");
  } catch {
    return String(ts);
  }
}

type DurationChoice = "permanent" | "7" | "30";

function daysFromChoice(choice: DurationChoice): number | null {
  if (choice === "permanent") return null;
  return Number(choice);
}

export default function AccessRequestsPage() {
  const { db, shared, refresh, revision } = useWarehouse();
  const { session: auth } = useEmailAuth();
  const { t, lang } = useI18n();
  const manager = canManageAccess(auth?.email);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [manualEmail, setManualEmail] = useState("");
  const [manualDuration, setManualDuration] = useState<DurationChoice>(String(DEFAULT_TEMP_ACCESS_DAYS) as DurationChoice);
  const [approveDuration, setApproveDuration] = useState<DurationChoice>(String(DEFAULT_TEMP_ACCESS_DAYS) as DurationChoice);
  void revision;

  const pending = listAccessRequests(db, { status: "pending" });
  const decided = listAccessRequests(db).filter((row) => row.status !== "pending").slice(0, 20);
  const allowlist = listAllowedEmails(db, { includeExpired: true });

  async function onApprove(id: string) {
    try {
      approveAccessRequest(db, id, auth!.email, { expiresInDays: daysFromChoice(approveDuration) });
      await refresh();
      setFlash({ ok: t("access.approved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onReject(id: string) {
    try {
      rejectAccessRequest(db, id, auth!.email);
      await refresh();
      setFlash({ ok: t("access.rejected") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onRevoke(email: string) {
    try {
      revokeAllowedEmail(db, email, auth!.email);
      await refresh();
      setFlash({ ok: t("access.revoked") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onManualAdd(event: FormEvent) {
    event.preventDefault();
    try {
      addAllowedEmailManual(db, manualEmail, auth!.email, {
        expiresInDays: daysFromChoice(manualDuration),
      });
      setManualEmail("");
      await refresh();
      setFlash({ ok: t("access.added") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow={t("access.eyebrow")}
        title={t("access.title")}
        description={t("access.description")}
      />
      {!shared ? <p className="text-sm text-ink/55">{t("access.browser")}</p> : null}
      <p className="text-sm text-ink/60">{t("access.tempHelp")}</p>
      <Flash error={flash.error} ok={flash.ok} />

      {!manager ? (
        <p className="rounded-md border border-line bg-white px-3 py-2 text-sm">{t("access.managersOnly")}</p>
      ) : null}

      <Panel>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink/70 uppercase">{t("access.pendingTitle")}</h2>
        {manager && pending.length > 0 ? (
          <div className="mb-3 max-w-xs">
            <Field label={t("access.duration")}>
              <select
                className={controlClass}
                value={approveDuration}
                onChange={(event) => setApproveDuration(event.target.value as DurationChoice)}
              >
                <option value="permanent">{t("access.durationPermanent")}</option>
                {TEMP_ACCESS_DAY_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {t("access.durationDays", { days })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
        {pending.length === 0 ? (
          <Empty>{t("access.pendingEmpty")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink">{row.email}</p>
                  <p className="text-xs text-ink/50">{formatWhen(row.createdAt, lang)}</p>
                </div>
                {manager ? (
                  <div className="flex gap-2">
                    <button type="button" className={buttonClass("primary")} onClick={() => void onApprove(row.id)}>
                      {t("access.approve")}
                    </button>
                    <button type="button" className={buttonClass("ghost")} onClick={() => void onReject(row.id)}>
                      {t("access.reject")}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink/70 uppercase">{t("access.allowlistTitle")}</h2>
        {allowlist.length === 0 ? (
          <Empty>{t("access.allowlistEmpty")}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {allowlist.map((row) => (
              <li key={row.email} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink">
                    {row.email}
                    {row.permanent ? (
                      <span className="ms-2 text-xs font-normal text-ink/50">({t("access.permanentBadge")})</span>
                    ) : null}
                    {!row.permanent && row.expiresAt ? (
                      <span className="ms-2 text-xs font-normal text-ink/50">
                        ({row.expired ? t("access.expiredBadge") : t("access.temporaryBadge")})
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink/50">
                    {t("access.approvedAt")}: {formatWhen(row.approvedAt, lang)}
                    {row.expiresAt ? (
                      <>
                        {" · "}
                        {t("access.expiresAt")}: {formatWhen(row.expiresAt, lang)}
                      </>
                    ) : null}
                  </p>
                </div>
                {manager && !row.permanent ? (
                  <button type="button" className={buttonClass("ghost")} onClick={() => void onRevoke(row.email)}>
                    {t("access.revoke")}
                  </button>
                ) : null}
                {row.permanent ? (
                  <p className="text-xs text-ink/45">{t("access.cannotRevoke")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {manager ? (
          <form onSubmit={(event) => void onManualAdd(event)} className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-end">
            <Field label={t("access.addEmail")}>
              <input
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                className={controlClass}
                required
                maxLength={120}
                placeholder="name@company.com"
              />
            </Field>
            <Field label={t("access.duration")}>
              <select
                className={controlClass}
                value={manualDuration}
                onChange={(event) => setManualDuration(event.target.value as DurationChoice)}
              >
                <option value="permanent">{t("access.durationPermanent")}</option>
                {TEMP_ACCESS_DAY_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {t("access.durationDays", { days })}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={buttonClass("primary")}>
              {t("access.add")}
            </button>
          </form>
        ) : null}
      </Panel>

      {decided.length > 0 ? (
        <Panel>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink/70 uppercase">{t("access.historyTitle")}</h2>
          <ul className="divide-y divide-line">
            {decided.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink">
                  {row.email}{" "}
                  <span className="text-ink/50">
                    · {row.status === "approved" ? t("access.statusApproved") : t("access.statusRejected")}
                  </span>
                </p>
                <p className="text-xs text-ink/45">{row.decidedAt ? formatWhen(row.decidedAt, lang) : ""}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
