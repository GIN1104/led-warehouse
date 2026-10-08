"use client";

import { OrderForm } from "@/components/order-form";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { PageHeader, Panel } from "@/components/ui";
import { can } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { listSkuSummaries } from "@/lib/services/queries";

export default function NewOrderPage() {
  const { db, session, users, revision } = useWarehouse();
  const { t } = useI18n();
  const allowed = can(session.role, "order.write");
  const today = todayIso();
  const manager = users.find((user) => user.role === "manager")?.name ?? "";
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
      <PageHeader eyebrow={t("new.eyebrow")} title={t("new.title")} description={t("new.description")} />
      {allowed ? (
        <Panel>
          <OrderForm skus={skus} startDate={today} endDate={addDays(today, 2)} />
        </Panel>
      ) : (
        <p className="text-sm text-ink/60">{t("new.switchManager", { name: manager })}</p>
      )}
    </div>
  );
}
