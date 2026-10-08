"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, Panel, buttonClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { setOrderStatus } from "@/lib/services/ledger";
import { getOrderDetail } from "@/lib/services/queries";

export function OrderFallback() {
  const { t } = useI18n();
  return <p className="text-sm">{t("order.loading")}</p>;
}

export function OrderView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { db, session, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "order.write");
  const detail = id ? getOrderDetail(db, id) : null;
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  if (!detail) {
    return <p className="text-sm">{t("order.missing")}</p>;
  }
  const { order, lines, hires } = detail;
  const shortage = lines.reduce((sumQty, line) => sumQty + line.qtyShortage, 0);

  function changeStatus(status: "cancelled" | "closed") {
    try {
      assertCan(session.role, "order.write");
      setOrderStatus(db, order.id, status, session.id);
      refresh();
      setFlash({ ok: t("order.updated") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  const note = [order.notes || t("order.noNote"), order.source === "mapper" ? t("order.fromMapper") : ""].filter(Boolean).join(" ");

  return (
    <div>
      <PageHeader
        eyebrow={t("order.eyebrow")}
        title={order.customerName}
        description={
          <span>
            <span dir="ltr">
              {formatDate(order.startDate)} — {formatDate(order.endDate)}
            </span>
            . {note}
          </span>
        }
        action={<Badge tone={order.status === "confirmed" ? "ok" : "neutral"}>{t(`orderStatus.${order.status}` as MessageKey)}</Badge>}
      />
      <Flash error={flash.error} ok={flash.ok} />
      {shortage > 0 ? (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {t("order.savedShortage", { qty: shortage })}{" "}
          <Link href="/external-hires" className="underline">
            {t("order.hireLink")}
          </Link>
          .
        </p>
      ) : null}
      <Panel className="mb-4">
        <table className="w-full text-start text-sm">
          <thead className="text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="py-2 font-medium">{t("order.item")}</th>
              <th className="py-2 font-medium">{t("order.requested")}</th>
              <th className="py-2 font-medium">{t("order.reserved")}</th>
              <th className="py-2 font-medium">{t("order.issued")}</th>
              <th className="py-2 font-medium">{t("order.shortage")}</th>
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
                <td className="py-2">
                  {line.qtyIssued > 0 ? <Badge tone="ok">{line.qtyIssued}</Badge> : "0"}
                </td>
                <td className="py-2">{line.qtyShortage > 0 ? <Badge tone="warn">{line.qtyShortage}</Badge> : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {hires.length > 0 ? (
        <Panel className="mb-4">
          <h2 className="mb-2 font-medium">{t("order.hireTitle")}</h2>
          <ul className="text-sm">
            {hires.map((hire) => (
              <li key={hire.id} className="flex justify-between gap-3 border-b border-line py-2 last:border-0">
                <span>
                  {hire.code} · {hire.qty}
                </span>
                <span>{t(`hire.${hire.status}` as MessageKey)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {allowed && order.status === "confirmed" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("ghost")} onClick={() => changeStatus("closed")}>
            {t("order.close")}
          </button>
          <button type="button" className={buttonClass("danger")} onClick={() => changeStatus("cancelled")}>
            {t("order.cancel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
