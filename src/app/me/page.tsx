"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { apiUrl, sharedLedger } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { getRoleLabels, updateOwnCabinet } from "@/lib/services/people";
import { flushTelegramOutbox, listTelegramOutbox, sendTestTelegram } from "@/lib/telegram/notify";

type BotStatus = "configured" | "mock" | "unknown";

export default function MePage() {
  const { db, session, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const labels = getRoleLabels(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [botStatus, setBotStatus] = useState<BotStatus>("unknown");
  const outbox = listTelegramOutbox(db, 20);
  const bound = Boolean(session.telegramChatId?.trim());
  void revision;

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      if (!sharedLedger) {
        if (!cancelled) setBotStatus("unknown");
        return;
      }
      try {
        const response = await fetch(apiUrl("/api/v1/telegram/notify"));
        if (!response.ok) throw new Error("status");
        const data = (await response.json()) as { configured?: boolean };
        if (!cancelled) setBotStatus(data.configured ? "configured" : "mock");
      } catch {
        if (!cancelled) setBotStatus("unknown");
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      updateOwnCabinet(db, session.id, {
        phone: String(data.get("phone") ?? ""),
        telegramUsername: String(data.get("telegramUsername") ?? ""),
        telegramChatId: String(data.get("telegramChatId") ?? ""),
      });
      await refresh();
      setFlash({ ok: t("me.saved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onTest() {
    if (!session.telegramChatId?.trim()) {
      setFlash({ error: t("me.needChatId") });
      return;
    }
    try {
      await sendTestTelegram(db, session);
      await flushTelegramOutbox(db);
      await refresh();
      setFlash({ ok: t("me.testSent") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("me.eyebrow")} title={t("me.title")} description={t("me.description")} />
      <Flash error={flash.error} ok={flash.ok} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("me.profile")}</h2>
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink/55">{t("people.name")}</dt>
              <dd className="font-medium">{session.name}</dd>
            </div>
            <div>
              <dt className="text-ink/55">{t("people.role")}</dt>
              <dd className="font-medium">{labels[session.role] || t(`role.${session.role}` as MessageKey)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink/55">{t("people.email")}</dt>
              <dd className="font-medium">{session.email || "—"}</dd>
            </div>
          </dl>

          <div className="mb-4 rounded-md border border-line bg-white/70 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{t("me.bindTitle")}</h3>
              <Badge tone={bound ? "ok" : "warn"}>{bound ? t("me.bindStatusBound") : t("me.bindStatusUnbound")}</Badge>
              <Badge tone={botStatus === "configured" ? "ok" : botStatus === "mock" ? "warn" : "neutral"}>
                {botStatus === "configured"
                  ? t("me.serverConfigured")
                  : botStatus === "mock"
                    ? t("me.serverMock")
                    : t("me.serverUnknown")}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-ink/70">{t("me.bindSteps")}</p>
          </div>

          <form onSubmit={(event) => void onSave(event)} className="grid gap-3 border-t border-line pt-4">
            <Field label={t("me.phone")}>
              <input
                name="phone"
                defaultValue={session.phone ?? ""}
                className={controlClass}
                maxLength={40}
                placeholder={t("me.phonePlaceholder")}
              />
            </Field>
            <Field label={t("me.telegramUsername")}>
              <input
                name="telegramUsername"
                defaultValue={session.telegramUsername ?? ""}
                className={controlClass}
                maxLength={32}
                placeholder={t("me.telegramUsernamePlaceholder")}
              />
            </Field>
            <Field label={t("me.telegramChatId")}>
              <input
                name="telegramChatId"
                defaultValue={session.telegramChatId ?? ""}
                className={controlClass}
                maxLength={20}
                placeholder={t("me.telegramChatIdPlaceholder")}
              />
            </Field>
            <p className="text-xs text-ink/55">{t("me.telegramChatIdHelp")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass("primary")}>
                {t("me.save")}
              </button>
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() => void onTest()}
                disabled={!bound}
                title={!bound ? t("me.needChatId") : undefined}
              >
                {t("me.test")}
              </button>
              <Link href="/people/" className={buttonClass("ghost")}>
                {t("me.toPeople")}
              </Link>
            </div>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-1 font-medium">{t("me.outboxTitle")}</h2>
          <p className="mb-4 text-sm text-ink/65">{t("me.outboxHelp")}</p>
          {outbox.length === 0 ? <Empty>{t("me.outboxEmpty")}</Empty> : null}
          <ul className="flex flex-col gap-2">
            {outbox.map((row) => (
              <li key={row.id} className="rounded-md border border-line bg-white p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={row.mode === "sent" ? "ok" : row.mode === "skipped" ? "neutral" : "warn"}>
                    {t(`me.mode.${row.mode}` as MessageKey)}
                  </Badge>
                  <Badge tone="neutral">{t(`me.kind.${row.kind}` as MessageKey)}</Badge>
                  <span className="text-xs text-ink/45">{formatDateTime(row.createdAt)}</span>
                </div>
                <p className="leading-5">{row.payload}</p>
                {row.chatId ? (
                  <p className="mt-1 text-xs text-ink/50">
                    chatId {row.chatId}
                    {row.username ? ` · @${row.username}` : ""}
                  </p>
                ) : null}
                {row.error ? <p className="mt-1 text-xs text-rose-700">{row.error}</p> : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
