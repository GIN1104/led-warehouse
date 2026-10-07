"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWarehouse } from "@/components/warehouse";
import { Field, buttonClass, controlClass } from "@/components/ui";
import { assertCan, errorText } from "@/lib/auth";
import { orderHref } from "@/lib/paths";
import { createOrder } from "@/lib/services/ledger";

type SkuOption = { id: string; code: string; name: string; availableToday: number; unit: string };

export function OrderForm({
  skus,
  startDate,
  endDate,
}: {
  skus: SkuOption[];
  startDate: string;
  endDate: string;
}) {
  const { db, session, refresh } = useWarehouse();
  const router = useRouter();
  const [lines, setLines] = useState([{ skuId: skus[0]?.id ?? "", qty: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      assertCan(session.role, "order.write");
      const result = createOrder(
        db,
        {
          customerName: String(form.get("customerName") ?? ""),
          startDate: String(form.get("startDate") ?? ""),
          endDate: String(form.get("endDate") ?? ""),
          notes: String(form.get("notes") ?? ""),
          lines,
        },
        session.id,
      );
      refresh();
      router.push(orderHref(result.orderId));
    } catch (caught) {
      setError(errorText(caught));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Заказчик">
          <input name="customerName" required className={controlClass} placeholder="ООО «Сцена Про»" />
        </Field>
        <Field label="Заметка">
          <input name="notes" className={controlClass} placeholder="Площадка, контакт" />
        </Field>
        <Field label="Начало">
          <input name="startDate" type="date" required defaultValue={startDate} className={controlClass} />
        </Field>
        <Field label="Окончание">
          <input name="endDate" type="date" required defaultValue={endDate} className={controlClass} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Состав</p>
          <button
            type="button"
            className={buttonClass("ghost")}
            onClick={() => setLines((current) => [...current, { skuId: skus[0]?.id ?? "", qty: 1 }])}
          >
            Добавить строку
          </button>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <select
              className={controlClass}
              value={line.skuId}
              onChange={(event) =>
                setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, skuId: event.target.value } : item)))
              }
            >
              {skus.map((sku) => (
                <option key={sku.id} value={sku.id}>
                  {sku.code} — {sku.name} (сегодня свободно {sku.availableToday} {sku.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className={controlClass}
              value={line.qty}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, qty: Number(event.target.value) } : item)),
                )
              }
            />
            {lines.length > 1 ? (
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                Убрать
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-alert">{error}</p> : null}
      <p className="text-sm text-ink/60">
        Заказ сохранится даже при нехватке. Система посчитает мягкий резерв и, если остатка не хватит, создаст заявку на
        внешнюю аренду.
      </p>
      <button type="submit" className={buttonClass("primary", "w-fit")} disabled={pending || skus.length === 0}>
        {pending ? "Сохраняем…" : "Сохранить заказ"}
      </button>
    </form>
  );
}
