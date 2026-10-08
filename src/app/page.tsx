"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { orderHref } from "@/lib/paths";
import { getDashboard } from "@/lib/services/queries";

export default function HomePage() {
  const { db, revision } = useWarehouse();
  const { t } = useI18n();
  const data = getDashboard(db);
  void revision;

  const cards = [
    { label: t("home.sku"), value: data.skuCount, hint: t("home.skuHint") },
    { label: t("home.orders"), value: data.openOrders, hint: t("home.ordersHint") },
    { label: t("home.shortage"), value: data.shortageUnits, hint: t("home.shortageHint") },
    { label: t("home.hires"), value: data.hiresNeeded, hint: t("home.hiresHint") },
  ];

  return (
    <div>
      <PageHeader eyebrow={t("home.eyebrow")} title={t("home.title")} description={t("home.description")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Panel key={card.label}>
            <p className="text-xs tracking-wide text-ink/50 uppercase">{card.label}</p>
            <p className="mt-2 font-mono text-3xl font-medium">{card.value}</p>
            <p className="mt-1 text-xs text-ink/50">{card.hint}</p>
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">{t("home.alerts")}</h2>
            <Link href="/alerts" className="text-sm text-copper">
              {t("home.allAlerts")}
            </Link>
          </div>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-ink/60">{t("home.noAlerts")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <Badge tone="alert">{t("home.shortage")}</Badge>
                  <p className="mt-2 text-sm leading-6">
                    {alert.skuCode && alert.customerName && alert.qtyShort != null
                      ? t("home.alertLine", {
                          code: alert.skuCode,
                          qty: alert.qtyShort,
                          unit: alert.unit ?? "",
                          customer: alert.customerName,
                        })
                      : alert.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">{t("home.upcoming")}</h2>
            <Link href="/orders" className="text-sm text-copper">
              {t("home.allOrders")}
            </Link>
          </div>
          {data.orders.length === 0 ? (
            <p className="text-sm text-ink/60">{t("home.noOrders")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.orders.map((order) => (
                <li key={order.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0">
                  <div>
                    <Link href={orderHref(order.id)} className="font-medium hover:text-copper">
                      {order.customerName}
                    </Link>
                    <p className="text-sm text-ink/60" dir="ltr">
                      {formatDate(order.startDate)} — {formatDate(order.endDate)}
                    </p>
                  </div>
                  {order.shortage > 0 ? (
                    <Badge tone="warn">{t("home.shortageBadge", { qty: order.shortage })}</Badge>
                  ) : (
                    <Badge tone="ok">{t("home.reservedOk")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {data.fullyReserved.length > 0 ? (
        <p className="mt-4 text-sm text-ink/60">{t("home.fullyReserved", { codes: data.fullyReserved.map((sku) => sku.code).join(", ") })}</p>
      ) : null}
    </div>
  );
}
