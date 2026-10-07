"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, Panel, buttonClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { hireStatusLabel, orderStatusLabel } from "@/lib/labels";
import { setOrderStatus } from "@/lib/services/ledger";
import { getOrderDetail } from "@/lib/services/queries";

export function OrderView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { db, session, refresh, revision } = useWarehouse();
  const allowed = can(session.role, "order.write");
  const detail = id ? getOrderDetail(db, id) : null;
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  if (!detail) {
    return <p className="text-sm">Заказ не найден.</p>;
  }
  const { order, lines, hires } = detail;
  const shortage = lines.reduce((sumQty, line) => sumQty + line.qtyShortage, 0);

  function changeStatus(status: "cancelled" | "closed") {
    try {
      assertCan(session.role, "order.write");
      setOrderStatus(db, order.id, status, session.id);
      refresh();
      setFlash({ ok: "Статус заказа обновлён" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Заказ"
        title={order.customerName}
        description={`${formatDate(order.startDate)} — ${formatDate(order.endDate)}. ${order.notes || "Без заметки."}`}
        action={<Badge tone={order.status === "confirmed" ? "ok" : "neutral"}>{orderStatusLabel[order.status]}</Badge>}
      />
      <Flash error={flash.error} ok={flash.ok} />
      {shortage > 0 ? (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Заказ сохранён. Нехватка {shortage} шт. — это мягкий резерв, он не блокирует проведение. Откройте{" "}
          <Link href="/external-hires" className="underline">
            внешнюю аренду
          </Link>
          .
        </p>
      ) : null}
      <Panel className="mb-4">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="py-2 font-medium">Позиция</th>
              <th className="py-2 font-medium">Запрошено</th>
              <th className="py-2 font-medium">Мягкий резерв</th>
              <th className="py-2 font-medium">Нехватка</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className="py-2">
                  <span className="font-mono text-xs">{line.code}</span> {line.name}
                </td>
                <td className="py-2">
                  {line.qtyRequested} {line.unit}
                </td>
                <td className="py-2">{line.qtySoftReserved}</td>
                <td className="py-2">{line.qtyShortage > 0 ? <Badge tone="warn">{line.qtyShortage}</Badge> : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {hires.length > 0 ? (
        <Panel className="mb-4">
          <h2 className="mb-2 font-medium">Внешняя аренда по заказу</h2>
          <ul className="text-sm">
            {hires.map((hire) => (
              <li key={hire.id} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
                <span>
                  {hire.code} · {hire.qty}
                </span>
                <span>{hireStatusLabel[hire.status]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {allowed && order.status === "confirmed" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("ghost")} onClick={() => changeStatus("closed")}>
            Закрыть заказ
          </button>
          <button type="button" className={buttonClass("danger")} onClick={() => changeStatus("cancelled")}>
            Отменить заказ
          </button>
        </div>
      ) : null}
    </div>
  );
}
