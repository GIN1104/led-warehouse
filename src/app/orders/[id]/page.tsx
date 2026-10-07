import Link from "next/link";
import { notFound } from "next/navigation";
import { orderStatusAction } from "@/app/actions";
import { can, getSession } from "@/lib/auth";
import { Badge, Flash, PageHeader, Panel, buttonClass } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { hireStatusLabel, orderStatusLabel } from "@/lib/labels";
import { getOrderDetail } from "@/lib/services/queries";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const session = await getSession();
  const allowed = can(session.role, "order.write");
  const detail = getOrderDetail(getDb(), id);
  if (!detail) notFound();
  const { order, lines, hires } = detail;
  const shortage = lines.reduce((sumQty, line) => sumQty + line.qtyShortage, 0);

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
          <form action={orderStatusAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="closed" />
            <button type="submit" className={buttonClass("ghost")}>
              Закрыть заказ
            </button>
          </form>
          <form action={orderStatusAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button type="submit" className={buttonClass("danger")}>
              Отменить заказ
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
