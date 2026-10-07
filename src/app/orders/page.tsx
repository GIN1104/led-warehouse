"use client";

import Link from "next/link";
import { useWarehouse } from "@/components/warehouse";
import { Badge, PageHeader, buttonClass } from "@/components/ui";
import { can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { orderStatusLabel } from "@/lib/labels";
import { orderHref } from "@/lib/paths";
import { listOrders } from "@/lib/services/queries";

export default function OrdersPage() {
  const { db, session, revision } = useWarehouse();
  const allowed = can(session.role, "order.write");
  const orders = listOrders(db);
  void revision;

  return (
    <div>
      <PageHeader
        eyebrow="Прокат"
        title="Заказы"
        description="Даты, состав по количеству и мягкий резерв. Дефицит не мешает сохранить заказ."
        action={
          allowed ? (
            <Link href="/orders/new" className={buttonClass("primary")}>
              Новый заказ
            </Link>
          ) : null
        }
      />
      {!allowed ? <p className="mb-4 text-sm text-ink/60">Оформляет менеджер. Сейчас вы вошли как склад.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-line bg-sand">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Заказчик</th>
              <th className="px-3 py-2 font-medium">Даты</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="px-3 py-2 font-medium">Нехватка</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <Link href={orderHref(order.id)} className="font-medium hover:text-copper">
                    {order.customerName}
                  </Link>
                  {order.notes ? <p className="text-ink/50">{order.notes}</p> : null}
                </td>
                <td className="px-3 py-2">
                  {formatDate(order.startDate)} — {formatDate(order.endDate)}
                </td>
                <td className="px-3 py-2">{orderStatusLabel[order.status]}</td>
                <td className="px-3 py-2">
                  {order.shortage > 0 ? <Badge tone="warn">{order.shortage}</Badge> : <Badge tone="ok">нет</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
