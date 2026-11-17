"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, PageHeader, Panel, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { orderHref } from "@/lib/paths";
import { getDashboard } from "@/lib/services/queries";

export default function HomePage() {
  const { db, revision } = useWarehouse();
  const { t } = useI18n();
  const data = getDashboard(db);
  void revision;

  const cards = [
    {
      label: t("home.orders"),
      value: data.openOrders,
      hint: t("home.ordersHint"),
      href: "/orders/",
    },
    {
      label: t("home.units"),
      value: data.equipmentUnits,
      hint: t("home.unitsHint", { sku: data.skuCount }),
      href: "/stock/",
    },
    {
      label: t("home.inTransit"),
      value: data.transfersInTransit,
      hint: t("home.inTransitHint"),
      href: "/transfers/?status=in_transit",
    },
    {
      label: t("home.people"),
      value: data.peopleCount,
      hint: t("home.peopleHint"),
      href: "/people/",
    },
  ];

  return (
    <div>
      <PageHeader eyebrow={t("home.eyebrow")} title={t("home.title")} description={t("home.description")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Panel key={card.label}>
            <Link href={card.href} className="block hover:opacity-90">
              <p className="text-xs tracking-wide text-ink/50 uppercase">{card.label}</p>
              <p className="mt-2 font-mono text-3xl font-medium">{card.value}</p>
              <p className="mt-1 text-xs text-ink/50">{card.hint}</p>
            </Link>
          </Panel>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
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

        <section className="flex flex-col justify-between rounded-lg border border-copper/30 bg-copper px-5 py-5 text-white shadow-sm">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-white/70 uppercase">{t("home.throughEyebrow")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{t("home.throughTitle")}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/85">{t("home.throughBody")}</p>
            <p className="mt-4 text-sm font-medium text-white/95" dir="ltr">
              {t("home.throughFlow")}
            </p>
          </div>
          <Link href="/transfers/?new=1" className={`${buttonClass("ghost", "mt-6 self-start border-0 bg-white text-copper hover:bg-white/90")} gap-2`}>
            {t("home.throughCta")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">{t("home.logistics")}</h2>
            <Link href="/transfers" className="text-sm text-copper">
              {t("home.allTransfers")}
            </Link>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="neutral">
              {t("home.plannedCount", { count: data.transfersPlanned })}
            </Badge>
            <Badge tone="warn">
              {t("home.inTransitCount", { count: data.transfersInTransit })}
            </Badge>
          </div>
          {data.inTransitPreview.length === 0 ? (
            <p className="text-sm text-ink/60">{t("home.noInTransit")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.inTransitPreview.map((row) => (
                <li key={row.id} className="border-b border-line pb-3 text-sm last:border-0 last:pb-0">
                  <p className="font-medium">
                    {row.skuCode} × {row.qty} {row.unit}
                  </p>
                  <p className="text-ink/60">
                    {row.fromName} → {row.toName}
                  </p>
                  {row.driverName ? (
                    <p className="text-xs text-ink/45">
                      {t("transfers.driver")}: {row.driverName}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

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
      </div>

      {data.fullyReserved.length > 0 ? (
        <p className="mt-4 text-sm text-ink/60">{t("home.fullyReserved", { codes: data.fullyReserved.map((sku) => sku.code).join(", ") })}</p>
      ) : null}
    </div>
  );
}
