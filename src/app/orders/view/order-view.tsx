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
import {
  cancelOrderAccessory,
  restoreOrderAccessory,
  setOrderAccessoryAssembled,
} from "@/lib/services/order-accessories";
import { getOrderDetail } from "@/lib/services/queries";
import { cn } from "@/lib/utils";

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
  const { order, lines, hires, accessories } = detail;
  const shortage = lines.reduce((sumQty, line) => sumQty + line.qtyShortage, 0);
  const activeAccessories = accessories.filter((row) => !row.cancelled);
  const cancelledAccessories = accessories.filter((row) => row.cancelled);

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

  function onToggleAssembled(accessoryId: string, assembled: boolean) {
    try {
      assertCan(session.role, "order.write");
      setOrderAccessoryAssembled(db, accessoryId, assembled);
      refresh();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onCancelAccessory(accessoryId: string) {
    try {
      assertCan(session.role, "order.write");
      cancelOrderAccessory(db, accessoryId);
      refresh();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onRestoreAccessory(accessoryId: string) {
    try {
      assertCan(session.role, "order.write");
      restoreOrderAccessory(db, accessoryId);
      refresh();
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

      <Panel className="mb-4">
        <h2 className="mb-1 font-medium">{t("order.accessories")}</h2>
        <p className="mb-3 text-sm text-ink/60">{t("order.accessoriesHelp")}</p>
        {accessories.length === 0 ? (
          <p className="text-sm text-ink/50">{t("order.accessoriesEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeAccessories.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper/60 px-3 py-2 text-sm",
                  row.assembled ? "border-moss/40 bg-lime-50/50" : "",
                )}
              >
                <label className="inline-flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.assembled}
                    disabled={!allowed || order.status !== "confirmed"}
                    onChange={(event) => onToggleAssembled(row.id, event.target.checked)}
                    aria-label={t("order.accessoryHave")}
                  />
                  <span className={cn(row.assembled ? "text-ink/50 line-through" : "")}>
                    {row.skuCode ? <span className="font-mono text-xs text-ink/45">{row.skuCode} · </span> : null}
                    {row.label}
                    {row.qty > 1 ? ` ×${row.qty}` : ""}
                  </span>
                </label>
                {allowed && order.status === "confirmed" ? (
                  <button type="button" className={buttonClass("ghost", "h-8 px-2 text-xs")} onClick={() => onCancelAccessory(row.id)}>
                    {t("order.accessoryCancel")}
                  </button>
                ) : null}
              </li>
            ))}
            {cancelledAccessories.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-1 text-sm text-ink/45">
                <span className="line-through">
                  {row.label}
                  {row.qty > 1 ? ` ×${row.qty}` : ""}
                </span>
                <Badge tone="neutral">{t("order.accessoryCancelled")}</Badge>
                {allowed && order.status === "confirmed" ? (
                  <button type="button" className={buttonClass("ghost", "h-8 px-2 text-xs")} onClick={() => onRestoreAccessory(row.id)}>
                    {t("order.accessoryRestore")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
