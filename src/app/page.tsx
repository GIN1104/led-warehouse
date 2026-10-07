"use client";

import Link from "next/link";
import { useWarehouse } from "@/components/warehouse";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { orderHref } from "@/lib/paths";
import { getDashboard } from "@/lib/services/queries";

export default function HomePage() {
  const { db, revision } = useWarehouse();
  const data = getDashboard(db);
  void revision;

  const cards = [
    { label: "Позиций", value: data.skuCount, hint: "номенклатура" },
    { label: "Открытых заказов", value: data.openOrders, hint: "подтверждены" },
    { label: "Нехватка, шт", value: data.shortageUnits, hint: "по открытым заказам" },
    { label: "Внешняя аренда", value: data.hiresNeeded, hint: "статус «нужно»" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Склад проката"
        title="Обзор"
        description="Остатки по количеству, заказы и мягкие резервы. Нехватка не блокирует заказ: система поднимает сигнал и предлагает арендовать снаружи. База этого браузера общая для вкладок и сохраняется локально."
      />
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
            <h2 className="font-medium">Сигналы нехватки</h2>
            <Link href="/alerts" className="text-sm text-copper">
              Все сигналы
            </Link>
          </div>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-ink/60">Открытых сигналов нет.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <Badge tone="alert">Нехватка</Badge>
                  <p className="mt-2 text-sm leading-6">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Ближайшие заказы</h2>
            <Link href="/orders" className="text-sm text-copper">
              Все заказы
            </Link>
          </div>
          {data.orders.length === 0 ? (
            <p className="text-sm text-ink/60">Подтверждённых заказов нет.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.orders.map((order) => (
                <li key={order.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0">
                  <div>
                    <Link href={orderHref(order.id)} className="font-medium hover:text-copper">
                      {order.customerName}
                    </Link>
                    <p className="text-sm text-ink/60">
                      {formatDate(order.startDate)} — {formatDate(order.endDate)}
                    </p>
                  </div>
                  {order.shortage > 0 ? <Badge tone="warn">нехватка {order.shortage}</Badge> : <Badge tone="ok">резерв закрыт</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {data.fullyReserved.length > 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          Сегодня весь остаток в резерве: {data.fullyReserved.map((sku) => sku.code).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
