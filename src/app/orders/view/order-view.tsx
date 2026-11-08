"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { deleteOrder, renameOrder, setOrderStatus } from "@/lib/services/ledger";
import {
  cancelOrderAccessory,
  restoreOrderAccessory,
  setOrderAccessoryAssembled,
} from "@/lib/services/order-accessories";
import { ORDER_PHASES, updateOrderPhases } from "@/lib/services/order-phases";
import { getOrderDetail } from "@/lib/services/queries";
import { cn } from "@/lib/utils";

export function OrderFallback() {
  const { t } = useI18n();
  return <p className="text-sm">{t("order.loading")}</p>;
}

export function OrderView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const { db, session, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "order.write");
  const detail = id ? getOrderDetail(db, id) : null;
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  void revision;

  if (!detail) {
    return <p className="text-sm">{t("order.missing")}</p>;
  }
  const { order, lines, hires, accessories } = detail;
  const shortage = lines.reduce((sumQty, line) => sumQty + line.qtyShortage, 0);
  const activeAccessories = accessories.filter((row) => !row.cancelled);
  const cancelledAccessories = accessories.filter((row) => row.cancelled);

  async function changeStatus(status: "cancelled" | "closed") {
    try {
      setBusy(true);
      assertCan(session.role, "order.write");
      setOrderStatus(db, order.id, status, session.id);
      await refresh();
      setFlash({ ok: t("order.updated") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    } finally {
      setBusy(false);
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

  function onSavePhases(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "order.write");
      updateOrderPhases(
        db,
        order.id,
        {
          mountDate: String(data.get("mountDate") ?? ""),
          showStart: String(data.get("showStart") ?? ""),
          showEnd: String(data.get("showEnd") ?? ""),
          demountDate: String(data.get("demountDate") ?? ""),
          phase: String(data.get("phase") ?? "planning"),
        },
        session.id,
      );
      refresh();
      setFlash({ ok: t("phase.saved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      assertCan(session.role, "order.write");
      renameOrder(db, order.id, String(data.get("customerName") ?? ""), session.id);
      // Must await push to Fly/Turso — otherwise poll reloads the old name.
      await refresh();
      setFlash({ ok: t("order.renamed") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(t("order.deleteConfirm", { name: order.customerName }))) return;
    try {
      setBusy(true);
      assertCan(session.role, "order.write");
      deleteOrder(db, order.id, session.id);
      await refresh();
      router.push("/orders/");
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
      setBusy(false);
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
      <Panel className="mb-4">
        {allowed ? (
          <form onSubmit={(event) => void onRename(event)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label={t("order.rename")}>
                <input
                  key={order.customerName}
                  name="customerName"
                  required
                  minLength={2}
                  defaultValue={order.customerName}
                  disabled={busy}
                  className={controlClass}
                />
              </Field>
            </div>
            <button type="submit" disabled={busy} className={buttonClass("primary")}>
              {t("order.renameSave")}
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink/60">{t("order.renameNeedManager")}</p>
        )}
      </Panel>
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
        <h2 className="mb-1 font-medium">{t("phase.title")}</h2>
        <p className="mb-3 text-sm text-ink/60">{t("phase.help")}</p>
        <p className="mb-3 text-sm">
          <Badge tone="ok">{t(`phase.${order.phase === "mount" ? "mountLabel" : order.phase === "show" ? "showLabel" : order.phase === "demount" ? "demountLabel" : order.phase}` as MessageKey)}</Badge>
        </p>
        {allowed && order.status === "confirmed" ? (
          <form onSubmit={onSavePhases} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("phase.mount")}>
              <input name="mountDate" type="date" defaultValue={order.mountDate ?? ""} className={controlClass} />
            </Field>
            <Field label={t("phase.showStart")}>
              <input name="showStart" type="date" defaultValue={order.showStart ?? ""} className={controlClass} />
            </Field>
            <Field label={t("phase.showEnd")}>
              <input name="showEnd" type="date" defaultValue={order.showEnd ?? ""} className={controlClass} />
            </Field>
            <Field label={t("phase.demount")}>
              <input name="demountDate" type="date" defaultValue={order.demountDate ?? ""} className={controlClass} />
            </Field>
            <Field label={t("phase.current")}>
              <select name="phase" defaultValue={order.phase || "planning"} className={controlClass}>
                {ORDER_PHASES.map((phase) => (
                  <option key={phase} value={phase}>
                    {t(
                      `phase.${phase === "mount" ? "mountLabel" : phase === "show" ? "showLabel" : phase === "demount" ? "demountLabel" : phase}` as MessageKey,
                    )}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button type="submit" className={buttonClass("primary")}>
                {t("phase.save")}
              </button>
            </div>
          </form>
        ) : null}
      </Panel>
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
      {allowed ? (
        <div className="flex flex-wrap gap-2">
          {order.status === "confirmed" ? (
            <>
              <button type="button" disabled={busy} className={buttonClass("ghost")} onClick={() => void changeStatus("closed")}>
                {t("order.close")}
              </button>
              <button type="button" disabled={busy} className={buttonClass("danger")} onClick={() => void changeStatus("cancelled")}>
                {t("order.cancel")}
              </button>
            </>
          ) : null}
          <button type="button" disabled={busy} className={buttonClass("danger")} onClick={() => void onDelete()}>
            {t("order.delete")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
