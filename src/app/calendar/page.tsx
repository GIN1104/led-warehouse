"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarMonth } from "@/components/calendar-month";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Flash, PageHeader, Panel, buttonClass } from "@/components/ui";
import { mockCalendarEvents } from "@/lib/calendar/mock-events";
import { itemsOnDate, mergeCalendarItems, ordersToCalendarItems, shiftMonth } from "@/lib/calendar/merge";
import type { CalendarItem, GoogleSyncStatus } from "@/lib/calendar/types";
import { formatDate, todayIso } from "@/lib/dates";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleSyncStatus,
  syncGoogleCalendar,
} from "@/lib/google/calendar-sync";
import { PROJECT_GOOGLE_EMAIL, googleClientId } from "@/lib/google/config";
import { getCachedGoogleAccessToken } from "@/lib/google/gis";
import { GOOGLE_CONNECTED_KEY } from "@/lib/google/token-store";
import { getDriveSyncStatus } from "@/lib/google/drive-sync";
import type { MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import { listOrders } from "@/lib/services/queries";

function statusLabel(status: GoogleSyncStatus, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  switch (status.kind) {
    case "missing_client_id":
      return t("calendar.syncMissingId");
    case "ready":
      return t("calendar.syncReady", { id: status.clientId });
    case "connected":
      return t("calendar.syncConnected", { email: status.email, id: status.clientId });
    case "stub":
      return status.message;
    case "error":
      return status.message;
    default:
      return t("calendar.syncIdle");
  }
}

function sourceTone(source: CalendarItem["source"]): "neutral" | "ok" | "warn" | "alert" {
  if (source === "order") return "ok";
  if (source === "task") return "warn";
  return "neutral";
}

export default function CalendarPage() {
  const { db, revision } = useWarehouse();
  const { t, lang } = useI18n();
  void revision;

  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y!, monthIndex: m! - 1 };
  });
  const [selected, setSelected] = useState(today);
  const [googleEvents, setGoogleEvents] = useState<CalendarItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<GoogleSyncStatus>(() => getGoogleSyncStatus());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const hasClientId = Boolean(googleClientId());
  const connected = syncStatus.kind === "connected";

  const orderItems = useMemo(() => ordersToCalendarItems(listOrders(db)), [db, revision]);
  const mockItems = useMemo(() => mockCalendarEvents(), []);
  const items = useMemo(
    () => mergeCalendarItems(orderItems, mockItems, googleEvents),
    [orderItems, mockItems, googleEvents],
  );
  const dayItems = itemsOnDate(items, selected);
  const driveStatus = getDriveSyncStatus();

  const monthTitle = useMemo(() => {
    const date = new Date(Date.UTC(cursor.year, cursor.monthIndex, 1));
    const locale = lang === "he" ? "he-IL" : lang === "en" ? "en-US" : "ru-RU";
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }, [cursor, lang]);

  useEffect(() => {
    if (!hasClientId) return;
    const wants =
      Boolean(getCachedGoogleAccessToken()) || window.localStorage.getItem(GOOGLE_CONNECTED_KEY) === "1";
    if (!wants) return;
    let cancel = false;
    void (async () => {
      try {
        const result = await syncGoogleCalendar();
        if (cancel) return;
        setSyncStatus(result.status);
        setGoogleEvents(result.events);
      } catch {
        if (!cancel) setSyncStatus(getGoogleSyncStatus());
      }
    })();
    return () => {
      cancel = true;
    };
  }, [hasClientId]);

  const weekdays = useMemo(() => {
    if (lang === "en") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (lang === "he") return ["ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳", "א׳"];
    return ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  }, [lang]);

  async function runConnectOrSync(mode: "connect" | "sync") {
    setBusy(true);
    setFlash({});
    try {
      const result = mode === "connect" ? await connectGoogleCalendar() : await syncGoogleCalendar();
      setSyncStatus(result.status);
      setGoogleEvents(result.events);
      if (result.status.kind === "missing_client_id") {
        setFlash({ error: t("calendar.syncMissingId") });
      } else {
        setFlash({
          ok: t(mode === "connect" ? "calendar.connectOk" : "calendar.syncOk", {
            count: result.events.length,
          }),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("common.saveFailed");
      setSyncStatus({ kind: "error", message });
      setFlash({ error: message });
    } finally {
      setBusy(false);
    }
  }

  function onDisconnect() {
    disconnectGoogleCalendar();
    setGoogleEvents([]);
    setSyncStatus(getGoogleSyncStatus());
    setFlash({ ok: t("calendar.disconnectOk") });
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("calendar.eyebrow")}
        title={t("calendar.title")}
        description={t("calendar.description")}
        action={
          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={busy || !hasClientId}
                onClick={() => void runConnectOrSync("connect")}
              >
                {busy ? t("calendar.syncing") : t("calendar.connect")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={buttonClass("primary")}
                  disabled={busy}
                  onClick={() => void runConnectOrSync("sync")}
                >
                  {busy ? t("calendar.syncing") : t("calendar.sync")}
                </button>
                <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={onDisconnect}>
                  {t("calendar.disconnect")}
                </button>
              </>
            )}
          </div>
        }
      />
      <Flash error={flash.error} ok={flash.ok} />
      <p className="mb-1 text-sm text-ink/70">
        {t("calendar.account", { email: PROJECT_GOOGLE_EMAIL })}
      </p>
      <p className="mb-4 text-sm text-ink/60">{statusLabel(syncStatus, t)}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex, -1))}
        >
          {t("calendar.prev")}
        </button>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => {
            setCursor({ year: Number(today.slice(0, 4)), monthIndex: Number(today.slice(5, 7)) - 1 });
            setSelected(today);
          }}
        >
          {t("calendar.today")}
        </button>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex, 1))}
        >
          {t("calendar.next")}
        </button>
        <h2 className="ms-2 text-lg font-semibold capitalize">{monthTitle}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel>
          <CalendarMonth
            year={cursor.year}
            monthIndex={cursor.monthIndex}
            selected={selected}
            today={today}
            items={items}
            onSelect={setSelected}
            weekdayLabels={weekdays}
          />
        </Panel>
        <Panel>
          <h2 className="mb-1 font-medium">{formatDate(selected)}</h2>
          <p className="mb-3 text-xs text-ink/50">{t("calendar.dayHint")}</p>
          {dayItems.length === 0 ? <Empty>{t("calendar.dayEmpty")}</Empty> : null}
          <ul className="flex flex-col gap-3">
            {dayItems.map((item) => (
              <li key={item.id} className="border-b border-line pb-3 last:border-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={sourceTone(item.source)}>{t(`calendar.source.${item.source}` as MessageKey)}</Badge>
                  {!item.allDay ? <span className="text-xs text-ink/50">{t("calendar.timed")}</span> : null}
                </div>
                <p className="font-medium">{item.title}</p>
                {item.note ? <p className="mt-1 text-sm text-ink/60">{item.note}</p> : null}
                {item.orderId ? (
                  <Link href={orderHref(item.orderId)} className="mt-2 inline-block text-sm text-copper">
                    {t("calendar.openOrder")}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4">
        <h2 className="mb-2 font-medium">{t("calendar.legend")}</h2>
        <ul className="flex flex-wrap gap-3 text-sm text-ink/70">
          <li>
            <Badge tone="ok">{t("calendar.source.order")}</Badge> — {t("calendar.legendOrder")}
          </li>
          <li>
            <Badge tone="warn">{t("calendar.source.task")}</Badge> — {t("calendar.legendTask")}
          </li>
          <li>
            <Badge tone="neutral">{t("calendar.source.mock")}</Badge> — {t("calendar.legendMock")}
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink/50">{t("calendar.envHint")}</p>
        <p className="mt-2 text-xs text-ink/50">
          {t("calendar.driveHint", { email: driveStatus.email, folder: driveStatus.folder })}
        </p>
      </Panel>
    </div>
  );
}
