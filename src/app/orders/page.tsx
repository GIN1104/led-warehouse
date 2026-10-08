"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { can } from "@/lib/auth";
import { sharedLedger, apiUrl } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { translateError } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import { importMapperOrder } from "@/lib/services/mapper";
import { parseMapperCsv } from "@/lib/services/mapper-sheet";
import { listOrders } from "@/lib/services/queries";

export default function OrdersPage() {
  const { db, session, users, refresh, reloadShared, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "order.write");
  const orders = listOrders(db);
  const manager = users.find((user) => user.role === "manager")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  async function onMapper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return;
    try {
      if (sharedLedger) {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch(apiUrl("/api/v1/integrations/mapper/orders"), { method: "POST", body });
        const payload = (await response.json()) as { error?: string; idempotent?: boolean };
        if (!response.ok) throw new Error(payload.error ?? t("common.saveFailed"));
        reloadShared();
        setFlash({ ok: payload.idempotent ? t("orders.mapperSame") : t("orders.mapperOk") });
        return;
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setFlash({ error: t("orders.mapperNeedServer") });
        return;
      }
      const result = importMapperOrder(db, parseMapperCsv(await file.text()), session.id);
      refresh();
      setFlash({ ok: result.idempotent ? t("orders.mapperSame") : t("orders.mapperOk") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("orders.eyebrow")}
        title={t("orders.title")}
        description={t("orders.description")}
        action={
          allowed ? (
            <Link href="/orders/new" className={buttonClass("primary")}>
              {t("orders.new")}
            </Link>
          ) : null
        }
      />
      {!allowed ? <p className="mb-4 text-sm text-ink/60">{t("orders.switchManager", { name: manager })}</p> : null}
      <Flash error={flash.error} ok={flash.ok} />
      <div className="mb-4 overflow-x-auto rounded-lg border border-line bg-sand">
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">{t("orders.customer")}</th>
              <th className="px-3 py-2 font-medium">{t("orders.dates")}</th>
              <th className="px-3 py-2 font-medium">{t("orders.status")}</th>
              <th className="px-3 py-2 font-medium">{t("orders.shortage")}</th>
              <th className="px-3 py-2 font-medium">{t("orders.issued")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <Link href={orderHref(order.id)} className="font-medium hover:text-copper">
                    {order.customerName}
                  </Link>
                  {order.source === "mapper" ? (
                    <span className="ms-2">
                      <Badge tone="neutral">{t("orders.mapperBadge")}</Badge>
                    </span>
                  ) : null}
                  {order.notes ? <p className="text-ink/50">{order.notes}</p> : null}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {formatDate(order.startDate)} — {formatDate(order.endDate)}
                </td>
                <td className="px-3 py-2">{t(`orderStatus.${order.status}`)}</td>
                <td className="px-3 py-2">
                  {order.shortage > 0 ? <Badge tone="warn">{order.shortage}</Badge> : <Badge tone="ok">{t("common.no")}</Badge>}
                </td>
                <td className="px-3 py-2">{order.issued > 0 ? <Badge tone="neutral">{order.issued}</Badge> : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Panel>
        <h2 className="mb-2 font-medium">{t("orders.mapperTitle")}</h2>
        <p className="mb-3 text-sm leading-6 text-ink/70">{t("orders.mapperHelp")}</p>
        <form onSubmit={(event) => void onMapper(event)} className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field label={t("orders.mapperFile")}>
            <input name="file" type="file" accept=".csv,.xlsx,text/csv" required className={controlClass} />
          </Field>
          <button type="submit" className={buttonClass("primary")}>
            {t("orders.mapperSend")}
          </button>
        </form>
      </Panel>
    </div>
  );
}
