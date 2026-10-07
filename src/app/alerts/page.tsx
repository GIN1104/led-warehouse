"use client";

import Link from "next/link";
import { useState } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, buttonClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { alertStatusLabel } from "@/lib/labels";
import { orderHref } from "@/lib/paths";
import { ackAlert } from "@/lib/services/ledger";
import { listAlerts } from "@/lib/services/queries";

export default function AlertsPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const allowed = can(session.role, "alert.write");
  const rows = listAlerts(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function accept(id: string) {
    try {
      assertCan(session.role, "alert.write");
      ackAlert(db, id, session.id);
      refresh();
      setFlash({ ok: "Сигнал принят" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Контроль"
        title="Сигналы"
        description="Нехватка остаётся видимой, пока дефицит не исчезнет. Принятие сигнала не списывает его втихую."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-ink/60">Сигналов пока нет.</p> : null}
        {rows.map((alert) => (
          <article key={alert.id} className="rounded-lg border border-line bg-sand p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={alert.status === "open" ? "alert" : alert.status === "ack" ? "warn" : "neutral"}>
                {alertStatusLabel[alert.status]}
              </Badge>
              <span className="text-xs text-ink/50">{formatDateTime(alert.createdAt)}</span>
            </div>
            <p className="text-sm leading-6">{alert.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {alert.orderId ? (
                <Link href={orderHref(alert.orderId)} className={buttonClass("ghost")}>
                  Открыть заказ
                </Link>
              ) : null}
              {allowed && alert.status === "open" ? (
                <button type="button" className={buttonClass("primary")} onClick={() => accept(alert.id)}>
                  Принять сигнал
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
