"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { applyMovement, type MovementType } from "@/lib/services/ledger";
import { listLocationBalances, listLocations, listMovements, listSkuSummaries } from "@/lib/services/queries";

export default function StockPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "stock.write");
  const summary = listSkuSummaries(db);
  const balances = listLocationBalances(db);
  const locations = listLocations(db);
  const movements = listMovements(db);
  const warehouse = users.find((user) => user.role === "warehouse")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "in");
    try {
      assertCan(session.role, "stock.write");
      if (type !== "in" && type !== "out" && type !== "adjust" && type !== "move") {
        throw new Error("type");
      }
      applyMovement(
        db,
        {
          skuId: String(form.get("skuId") ?? ""),
          type: type as MovementType,
          qty: Number(form.get("qty")),
          locationId: String(form.get("locationId") ?? ""),
          fromLocationId: String(form.get("fromLocationId") ?? "") || undefined,
          reason: String(form.get("reason") ?? ""),
        },
        session.id,
      );
      refresh();
      setFlash({ ok: t("stock.posted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("stock.eyebrow")} title={t("stock.title")} description={t("stock.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="mb-4 overflow-x-auto rounded-lg border border-line bg-sand">
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">{t("stock.code")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.location")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.onHand")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.reservedToday")}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((row) => (
              <tr key={`${row.skuId}-${row.locationId}`} className="border-t border-line">
                <td className="px-3 py-2 font-mono text-xs">{row.skuCode}</td>
                <td className="px-3 py-2">{row.locationName}</td>
                <td className="px-3 py-2">
                  {row.qtyOnHand} {row.unit}
                </td>
                <td className="px-3 py-2">{row.qtyReserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("stock.post")}</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label={t("stock.type")}>
                <select name="type" className={controlClass} defaultValue="in">
                  <option value="in">{t("move.in")}</option>
                  <option value="out">{t("move.out")}</option>
                  <option value="adjust">{t("stock.adjustOption")}</option>
                  <option value="move">{t("move.move")}</option>
                </select>
              </Field>
              <Field label={t("stock.sku")}>
                <select name="skuId" className={controlClass}>
                  {summary.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("stock.qty")}>
                <input name="qty" type="number" required className={controlClass} defaultValue={1} />
              </Field>
              <Field label={t("stock.location")}>
                <select name="locationId" className={controlClass}>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("stock.from")}>
                <select name="fromLocationId" className={controlClass} defaultValue="">
                  <option value="">{t("common.notNeeded")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("stock.reason")}>
                <input name="reason" className={controlClass} placeholder={t("stock.reasonHint")} />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("stock.submit")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-medium">{t("stock.recent")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {movements.map((movement) => (
              <li key={movement.id} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span>
                  {t(`move.${movement.type}` as MessageKey)} {movement.skuCode} · {movement.qty} · {movement.locationName}
                  {movement.reason ? <span className="text-ink/50"> — {movement.reason}</span> : null}
                </span>
                <span className="shrink-0 text-ink/50">{formatDateTime(movement.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
