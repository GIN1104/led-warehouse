"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, buttonClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import { ackAlert } from "@/lib/services/ledger";
import { listAlerts } from "@/lib/services/queries";

export default function AlertsPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "alert.write");
  const rows = listAlerts(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function accept(id: string) {
    try {
      assertCan(session.role, "alert.write");
      ackAlert(db, id, session.id);
      refresh();
      setFlash({ ok: t("alerts.acked") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("alerts.eyebrow")} title={t("alerts.title")} description={t("alerts.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-ink/60">{t("alerts.empty")}</p> : null}
        {rows.map((alert) => (
          <article key={alert.id} className="rounded-lg border border-line bg-sand p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={alert.status === "open" ? "alert" : alert.status === "ack" ? "warn" : "neutral"}>
                {t(`alert.${alert.status}` as MessageKey)}
              </Badge>
              <span className="text-xs text-ink/50">{formatDateTime(alert.createdAt)}</span>
            </div>
            <p className="text-sm leading-6">
              {alert.skuCode && alert.customerName && alert.qtyShort != null
                ? t("home.alertLine", {
                    code: alert.skuCode,
                    qty: alert.qtyShort,
                    unit: alert.unit ?? "",
                    customer: alert.customerName,
                  })
                : alert.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {alert.orderId ? (
                <Link href={orderHref(alert.orderId)} className={buttonClass("ghost")}>
                  {t("alerts.openOrder")}
                </Link>
              ) : null}
              {allowed && alert.status === "open" ? (
                <button type="button" className={buttonClass("primary")} onClick={() => accept(alert.id)}>
                  {t("alerts.ack")}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
