import Link from "next/link";
import { ackAlertAction } from "@/app/actions";
import { can, getSession } from "@/lib/auth";
import { Badge, Flash, PageHeader, buttonClass } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { alertStatusLabel } from "@/lib/labels";
import { listAlerts } from "@/lib/services/queries";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const flash = await searchParams;
  const session = await getSession();
  const allowed = can(session.role, "alert.write");
  const rows = listAlerts(getDb());

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
                <Link href={`/orders/${alert.orderId}`} className={buttonClass("ghost")}>
                  Открыть заказ
                </Link>
              ) : null}
              {allowed && alert.status === "open" ? (
                <form action={ackAlertAction}>
                  <input type="hidden" name="id" value={alert.id} />
                  <button type="submit" className={buttonClass("primary")}>
                    Принять сигнал
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
