"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, controlClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { hireStatusLabel } from "@/lib/labels";
import { orderHref } from "@/lib/paths";
import { setHireStatus } from "@/lib/services/ledger";
import { listExternalHires } from "@/lib/services/queries";

const tone = {
  needed: "alert",
  ordered: "warn",
  received: "ok",
  closed: "neutral",
} as const;

export default function ExternalHiresPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const allowed = can(session.role, "hire.write");
  const rows = listExternalHires(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status = submitter instanceof HTMLButtonElement ? submitter.value : "";
    try {
      assertCan(session.role, "hire.write");
      if (status !== "needed" && status !== "ordered" && status !== "received" && status !== "closed") {
        throw new Error("Неизвестный статус аренды");
      }
      setHireStatus(db, String(form.get("id") ?? ""), status, String(form.get("supplierNote") ?? ""), session.id);
      refresh();
      setFlash({ ok: "Внешняя аренда обновлена" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Дефицит"
        title="Внешняя аренда"
        description="Если своего парка не хватает, заявка появляется сама в статусе «нужно арендовать». Дальше менеджер отмечает заказ у поставщика и получение."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-ink/60">Заявок нет.</p> : null}
        {rows.map((hire) => (
          <article key={hire.id} className="rounded-lg border border-line bg-sand p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {hire.skuCode} · {hire.qty} {hire.unit}
                </p>
                <p className="text-sm text-ink/70">{hire.skuName}</p>
                <Link href={orderHref(hire.orderId)} className="text-sm text-copper">
                  {hire.customerName}
                </Link>
              </div>
              <Badge tone={tone[hire.status]}>{hireStatusLabel[hire.status]}</Badge>
            </div>
            {allowed && hire.status !== "closed" ? (
              <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <input type="hidden" name="id" value={hire.id} />
                <input
                  name="supplierNote"
                  defaultValue={hire.supplierNote}
                  placeholder="Поставщик или комментарий"
                  className={`${controlClass} md:flex-1`}
                />
                {hire.status === "needed" ? (
                  <button name="status" value="ordered" className="rounded-md bg-copper px-3 py-2 text-sm text-white">
                    Заказано снаружи
                  </button>
                ) : null}
                {hire.status === "ordered" || hire.status === "needed" ? (
                  <button name="status" value="received" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                    Получено
                  </button>
                ) : null}
                <button name="status" value="closed" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                  Закрыть
                </button>
              </form>
            ) : hire.supplierNote ? (
              <p className="mt-2 text-sm text-ink/60">{hire.supplierNote}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
