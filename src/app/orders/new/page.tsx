"use client";

import { OrderForm } from "@/components/order-form";
import { useWarehouse } from "@/components/warehouse";
import { PageHeader, Panel } from "@/components/ui";
import { can } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { listSkuSummaries } from "@/lib/services/queries";

export default function NewOrderPage() {
  const { db, session, revision } = useWarehouse();
  const allowed = can(session.role, "order.write");
  const today = todayIso();
  const skus = listSkuSummaries(db).map((sku) => ({
    id: sku.id,
    code: sku.code,
    name: sku.name,
    unit: sku.unit,
    availableToday: sku.availableToday,
  }));
  void revision;

  return (
    <div>
      <PageHeader
        eyebrow="Прокат"
        title="Новый заказ"
        description="Свободный остаток на сегодня показан в списке. На другие даты расчёт делается при сохранении."
      />
      {allowed ? (
        <Panel>
          <OrderForm skus={skus} startDate={today} endDate={addDays(today, 2)} />
        </Panel>
      ) : (
        <p className="text-sm text-ink/60">Заказ создаёт менеджер. Переключитесь на Марию.</p>
      )}
    </div>
  );
}
