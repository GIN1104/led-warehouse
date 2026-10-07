"use client";

import { useState, type FormEvent } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { movementLabel } from "@/lib/labels";
import { applyMovement, type MovementType } from "@/lib/services/ledger";
import { listLocationBalances, listLocations, listMovements, listSkuSummaries } from "@/lib/services/queries";

export default function StockPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const allowed = can(session.role, "stock.write");
  const summary = listSkuSummaries(db);
  const balances = listLocationBalances(db);
  const locations = listLocations(db);
  const movements = listMovements(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "in");
    try {
      assertCan(session.role, "stock.write");
      if (type !== "in" && type !== "out" && type !== "adjust" && type !== "move") {
        throw new Error("Неизвестный тип движения");
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
      setFlash({ ok: "Движение проведено" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Остатки"
        title="Движения склада"
        description="Остаток меняется только движением: приход, расход, корректировка или перемещение. Заказ сам по себе товар со склада не списывает."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="mb-4 overflow-x-auto rounded-lg border border-line bg-sand">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Код</th>
              <th className="px-3 py-2 font-medium">Локация</th>
              <th className="px-3 py-2 font-medium">На руках</th>
              <th className="px-3 py-2 font-medium">Резерв сегодня</th>
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
          <h2 className="mb-3 font-medium">Провести движение</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label="Тип">
                <select name="type" className={controlClass} defaultValue="in">
                  <option value="in">Приход</option>
                  <option value="out">Расход</option>
                  <option value="adjust">Корректировка (±)</option>
                  <option value="move">Перемещение</option>
                </select>
              </Field>
              <Field label="Номенклатура">
                <select name="skuId" className={controlClass}>
                  {summary.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Количество">
                <input name="qty" type="number" required className={controlClass} defaultValue={1} />
              </Field>
              <Field label="Локация">
                <select name="locationId" className={controlClass}>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Откуда (для перемещения)">
                <select name="fromLocationId" className={controlClass} defaultValue="">
                  <option value="">Не нужно</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Причина">
                <input name="reason" className={controlClass} placeholder="Инвентаризация" />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                Провести движение
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">Движения проводит склад. Переключитесь на Алексея.</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-medium">Последние движения</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {movements.map((movement) => (
              <li key={movement.id} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span>
                  {movementLabel[movement.type]} {movement.skuCode} · {movement.qty} · {movement.locationName}
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
